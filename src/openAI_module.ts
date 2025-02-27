//import dotenv from "dotenv"; //for test
import { generateSchema, generateInstruction } from "./data_create.js";
import openai from "openai";
import Ajv from "ajv";
import { ObjectRoom } from "./interface";

//dotenv.config(); //for test

const clientAi = new openai({
  apiKey:
    "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",

  //apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

const ajv = new Ajv();
console.log(process.env.OPENAI_API_KEY);
//PARA TESTEO
export async function analyzeAndStoreResponses(
  objectRoomArray: ObjectRoom[],
  proyecto: any
): Promise<any[]> {
  const responses: any[] = [];

  for (const objectRoom of objectRoomArray) {
    console.log(`🔎 Analizando: ${objectRoom.room} - ${objectRoom.objectAnalisis}`);

    const response = await executeAnalysisOnRoom(objectRoom, proyecto);

    responses.push(...response);
  }
  console.log("RESPONSES");
  console.log(responses);
  return responses;
}

async function executeAnalysisOnRoom(objectRoom: ObjectRoom, proyecto: any): Promise<any[]> {
  try {
    console.log(`🔎 Analizando objeto: ${objectRoom.objectAnalisis} en ${objectRoom.room}`); //testing
    const jsonResponseArray: any[] = [];
    const { contextInstruccionesIA, contextReglasIA, contextConclusionIA } =
      proyecto?.event_datasets || {}; // Array para almacenar respuestas
    for (var i = 0; i < objectRoom.questionObject.length; i++) {
      console.log("Generando pregunta numero :" + i);
      const question = objectRoom.questionObject.map((q) => q.question);
      const contextoIA = objectRoom.questionObject.map((q) => q.contextoIA);
      console.log(question[i]);
      const imgs = objectRoom.questionObject.map((q) => q.imgs);
      const schema = generateSchema(question[i]);
      // console.log(schema); //test line
      const instruction = generateInstruction(
        objectRoom.objectAnalisis,
        schema,
        objectRoom.room,
        question[i],
        contextoIA[i],
        contextInstruccionesIA,
        contextReglasIA,
        contextConclusionIA
      );

      const jsonResponse = await getChatResponse(imgs[i], instruction, schema, objectRoom.room);
      console.log("RESPUESTA NUMERO " + i + "\n" + JSON.stringify(jsonResponse, null, 2));
      jsonResponseArray.push(jsonResponse);
      //sendDataToDataBase(jsonResponse);
      //ACA TIENE QUE IR EL PUSH DE RESPUESTAS
      //sendDataToServer(jsonResponse); //solo testeo
    }
    console.log("RESPUESTA DEL JSON RESPONSE");
    console.log("RESPUESTA DEL JSON RESPONSE");
    console.log(JSON.stringify(jsonResponseArray, null, 2));
    return jsonResponseArray;
  } catch (error) {
    console.error("❌ Error crítico, deteniendo ejecución:", error);
    process.exit(1); // 🔥 Mata el proceso completamente
  }
}

async function askChatGPT(imageUrls: string[], instruction: string) {
  try {
    console.log(imageUrls);
    const payload = {
      model: "gpt-4o-mini",
      messages: [],
      max_tokens: 500,
    };

    // Make an object with the instruction and the image urls
    const messages: any = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: instruction,
          },
        ],
      },
    ];

    // Add the image urls to the messages object
    imageUrls.forEach((imageUrl) => {
      messages[0].content.push({
        type: "image_url",
        image_url: {
          url: imageUrl,
          detail: "high",
        },
      });
    });

    payload.messages = messages;

    const response = await clientAi.chat.completions.create(payload);
    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No se recibió contenido del chat.");
    }
    console.log(content);
    return content;
  } catch (error) {
    console.error("Error en la llamada a OpenAI:", error);
    throw new Error("Error en la llamada a OpenAI");
  }
}

async function getChatResponse(
  imageUrls: string[],
  instruction: string,
  esquemaGenerado: any,
  room: string
) {
  let errorCount = 0;
  try {
    const response = await askChatGPT(imageUrls, instruction);
    console.log(response);
    const validJSON = await validateJSON(response, esquemaGenerado);
    console.log(validJSON);
    console.log("El objeto de la" + room + " se analizo exitosamente");

    return validJSON; //deberia ir la estructura que queremos guardar
  } catch (error) {
    errorCount++; // Incrementamos el contador de errores
    console.error("Error en la primera ejecución:", error);

    if (errorCount >= 2) {
      console.error("❌ Se alcanzaron 2 errores, deteniendo la ejecución...");
      process.exit(1); // 🔥 Mata el proceso completamente
    }

    try {
      console.log("Reintentando...");
      const response = await askChatGPT(imageUrls, instruction);
      const validJSON = await validateJSON(response, esquemaGenerado);
      console.log("El objeto de la " + room + " se analizó exitosamente");
      return validJSON; // Debería ir la estructura que queremos guardar
    } catch (error) {
      errorCount++; // Incrementamos nuevamente el contador de errores
      console.error("Error en el segundo intento:", error);

      if (errorCount >= 2) {
        console.error("❌ Se alcanzaron 2 errores, deteniendo la ejecución...");
        process.exit(1);
      }

      throw new Error("Error getting chat response");
    }
  }
}

async function validateJSON(content: string, esquemaGenerado: any) {
  try {
    // Eliminar las etiquetas de código antes de parsear el JSON
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/i);
    if (!jsonMatch) {
      console.error("No se encontró un bloque JSON válido.");
      throw new Error("No se encontró un bloque JSON válido.");
    }

    // Parsear el JSON extraído
    const jsonString = jsonMatch[1].trim();
    const jsonResponse = JSON.parse(jsonString); // Parseamos el JSON limpio

    // Validar el JSON con el esquema generado
    const validate = ajv.compile(esquemaGenerado);
    const valid = validate(jsonResponse);

    if (!valid) {
      console.error("El JSON no es válido. Errores de validación:", validate.errors);
      return "error";
    }

    console.log("JSON válido:", jsonResponse);
    return jsonResponse;
  } catch (error) {
    console.error("Error en la validación del JSON:", error);
    throw new Error("Hubo un error al validar el JSON");
  }
}
