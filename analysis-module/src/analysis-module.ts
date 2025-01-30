import openai from "openai";
import Ajv, { Schema } from "ajv";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// type EstadoEnum = "SI" | "NO" | "PARCIALMENTE"; //Valor para chatgpt

const clientAi = new openai({
  apiKey:
    "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",
  dangerouslyAllowBrowser: true,
});

const ajv = new Ajv();

async function sendDataToServer(data: any) {
  try {
    const response = await axios.post("http://localhost:3000/api/submit", data, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    console.log("Respuesta del servidor:", response.data);
  } catch (error) {
    console.error("Error al enviar datos al servidor:", error);
  }
}

function generateSchema(pregunta: string) {
  return {
    type: "object",
    properties: {
      pregunta: { const: pregunta },
      progreso: { type: "string", enum: ["SI", "NO"] },
      porcentaje: { type: "string" },
      Observaciones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            criterio: { type: "string" },
            detalle: { type: "string" },
          },
          required: ["criterio", "detalle"],
        },
      },
    },
    required: ["pregunta", "progreso", "porcentaje", "Observaciones"], // Las propiedades son obligatorias
  };
}

/*function generateSchemaFull(element: string, pregunta: string) {
  const properties: Record<string, any> = {};

  // Generar el esquema dinámico
  properties[element] = {
    type: "object", // Asegúrate de que 'element' sea un objeto
    properties: {
      pregunta: { const: pregunta },
      progreso: { type: "string", enum: ["SI", "NO"] },
      porcentaje: { type: "string" },
      Observaciones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            criterio: { type: "string" },
            detalle: { type: "string" },
          },
          required: ["criterio", "detalle"],
        },
      },
    },
    required: ["pregunta", "progreso", "porcentaje", "Observaciones"], // Las propiedades son obligatorias
  };

  // Construir el esquema completo de JSON
  const esquemaGenerado = {
    type: "object",
    properties: properties,
    required: [element],
  };

  return esquemaGenerado; // Devuelve el esquema completo
}
 */
//Generamos esquema dinamico
function generateInstruction(
  element: string,
  esquemaGenerado: Schema,
  typeroom: string,
  question: string
) {
  const esquemaString = JSON.stringify(esquemaGenerado, null, 2);
  const instruction = `
Eres un analizador de imágenes de una empresa constructora que evalúa el progreso de obras. Tu tarea es determinar si se encuentran instalado el elemento en cuestion que se te preguntara respondiendo a unas preguntas.

Las siguiente o siguientes imágenes pertenecen al mismo objeto a analizar de tipo ${element}. Este elemento pertenece a una ${typeroom} .Necesito que me devuelvas **únicamente** la respuesta en formato JSON **válido**, siguiendo exactamente la siguiente estructura ESQUEMA y agregar **SOLAMENTE LAS RESPUESTAS** donde deberian ir :

${esquemaGenerado} 

Las respuesta para el criterio "progreso" debe ser el siguiente enum: type EstadoEnum = "SI" | "NO";
Las respuestas deben satisfacer el criterio establecido por las siquientes preguntas ${question}
Para el campo "Porcentaje", colocar 100% en caso de que la respusta sea "SI" y 0% en caso que la respuesta sea "NO". Esta respuesta debe ser un string con el formato "%numero" donde numero es el solicitado anteriormente.

Finalmente, en "Criterio" incluye instalacion y en "Observaciones", incluye "INSTALADO CORRECTAMENTE" si la respuesta es "SI".En caso que la respuesta sea "NO", comentar criterio y detalles con una estructura a la del objeto Observaciones del esquema utilizado en la structura JSON

**Importante:** Devuelve únicamente un JSON que debe ser validado con el siguiente ${esquemaString} schema, sin texto adicional antes o después pero con las respuestas
IMPORTANTE: En caso de que la instalacion sea parcial, la respuesta sera "NO".`;
  return instruction;
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
  try {
    const response = await askChatGPT(imageUrls, instruction);
    console.log(response);
    const validJSON = await validateJSON(response, esquemaGenerado);
    console.log(validJSON);
    console.log("El objeto de la" + room + " se analizo exitosamente");

    return validJSON; //deberia ir la estructura que queremos guardar
  } catch (error) {
    try {
      const response = await askChatGPT(imageUrls, instruction);
      const validJSON = await validateJSON(response, esquemaGenerado);
      console.log("El objeto de la" + room + " se analizo exitosamente");
      return validJSON; //deberia ir la estructura que queremos guardar
    } catch (error) {
      console.error("Error getting chat response:", error);
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

async function executeAnalysisOnRoom(objectRoom: ObjectRoom): Promise<any[]> {
  console.log(`🔎 Analizando objeto: ${objectRoom.objectAnalisis} en ${objectRoom.room}`); //testing
  const jsonResponseArray: any[] = []; // Array para almacenar respuestas
  for (var i = 0; i < objectRoom.questionObject.length; i++) {
    console.log("Generando pregunta numero :" + i);
    const question = objectRoom.questionObject.map((q) => q.question);
    console.log(question[i]);
    const imgs = objectRoom.questionObject.map((q) => q.imgs);
    const schema = generateSchema(question[i]);
    // console.log(schema); //test line

    const instruction = generateInstruction(
      objectRoom.objectAnalisis,
      schema,
      objectRoom.room,
      question[i]
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
  console.log(JSON.stringify(jsonResponseArray));
  return jsonResponseArray;
}

interface ObjectRoom {
  room: string; //room
  objectCount: number;
  objectAnalisis: string; //caracteristicas
  questionObject: {
    question: string; //pregunta
    imgs: string[];
  }[];
}

interface Caracteristica {
  nombre: string;
  terminaciones: any[]; // Aquí podrías definir un tipo más específico si lo deseas
  respuestaChatGPT?: any; // Campo opcional para agregar la respuesta
}

function extractObjectRooms(jsonData: any): ObjectRoom[] {
  if (!jsonData || jsonData.length === 0) {
    console.error("El JSON está vacío o no es válido.");
    return [];
  }

  const extractedRooms: ObjectRoom[] = [];

  for (const room of jsonData) {
    // Extraer el nombre del ambiente
    const roomName: string = room.nombre;

    if (!room.caracteristicas || room.caracteristicas.length === 0) {
      console.warn(`El campo "${roomName}" no tiene características.`);
      continue; // Saltamos si no tiene características
    }

    // Iterar sobre cada característica dentro del room
    for (const characteristic of room.caracteristicas) {
      const objectAnalysis: string = characteristic.nombre;

      // Extraer solo las preguntas con imágenes dentro de terminaciones
      const questionObject = characteristic.terminaciones
        .filter((terminacion: any) => {
          // Verificamos que 'respuesta' exista y sea un objeto
          if (!terminacion.respuesta || typeof terminacion.respuesta !== "object") {
            return false;
          }

          // Verificamos que 'listaImagenes' exista y sea un array no vacío
          return (
            Array.isArray(terminacion.respuesta.listaImagenes) &&
            terminacion.respuesta.listaImagenes.length > 0
          );
        })
        .map((terminacion: any) => ({
          question: terminacion.pregunta,
          imgs: terminacion.respuesta.listaImagenes.map((img: any) => img.uri),
        }));

      // Solo agregar el ambiente si tiene preguntas con imágenes
      if (questionObject.length > 0) {
        const objectRoom: ObjectRoom = {
          room: roomName,
          objectCount: 1,
          objectAnalisis: objectAnalysis,
          questionObject: questionObject,
        };
        extractedRooms.push(objectRoom);
      }
    }
  }

  return extractedRooms;
}

function addChatGPTResponseToJSON(
  originalJSON: any[],
  analyzedRooms: ObjectRoom[],
  responses: any[]
): any[] {
  return originalJSON.map((room) => {
    // Buscar si este room tiene análisis realizado
    const analyzedRoom = analyzedRooms.find((r) => r.room === room.nombre);

    if (analyzedRoom) {
      room.caracteristicas = room.caracteristicas.map((caracteristica: Caracteristica) => {
        // Buscar si esta característica tiene preguntas analizadas
        const analyzedIndex = analyzedRooms.findIndex(
          (r) => r.objectAnalisis === caracteristica.nombre
        );

        if (analyzedIndex !== -1) {
          // Modificar cada pregunta dentro de terminaciones
          caracteristica.terminaciones = caracteristica.terminaciones.map((terminacion: any) => {
            // Buscar la respuesta correspondiente
            const response = responses[analyzedIndex];

            if (response && terminacion.pregunta) {
              return {
                ...terminacion,
                respuestaChatGPT: response, // 🔥 Ahora se agrega al mismo nivel que pregunta
              };
            }
            return terminacion;
          });
        }
        return caracteristica;
      });
    }

    return room;
  });
}

async function sendDataToDataBase(data: any) {
  try {
    const response = await axios.post(
      "http://rest-back.eyefinishapp.com/v3/test_chat_gpt",
      { data: data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Respuesta del endpoint externo:", response.data);
  } catch (error) {
    console.error("Error al comunicarse con el endpoint externo:", error);
  }
}

// jsonData = insertKeyAtPosition(jsonData, "respuestaChatGPT", jsonResponse, 1);
// "http://imgfz.com/i/b9NqeCD.jpeg", // imagen de mesada
// http://imgfz.com/i/CKibLPg.jpeg     // imagen de enchufes
//respuestadechatgpt axios
// http://rest-back.eyefinishapp.com
// http://rest-back.eyefinishapp.com/test-chat-gpt golpear esta url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jsonFilePath = path.join(__dirname, "json_form_app.json");
// Leer el archivo JSON
const rawData = fs.readFileSync(jsonFilePath, "utf-8");
const jsonData = JSON.parse(rawData);
console.log("Datos cargados desde JSON:", jsonData);

//PARA TESTEO
async function analyzeAndStoreResponses(objectRoomArray: ObjectRoom[]): Promise<any[]> {
  const responses: any[] = [];

  for (const objectRoom of objectRoomArray) {
    console.log(`🔎 Analizando: ${objectRoom.room} - ${objectRoom.objectAnalisis}`);

    const response = await executeAnalysisOnRoom(objectRoom);

    responses.push(...response);
  }
  console.log("RESPONSES");
  console.log(responses);
  return responses;
}

export async function triggerAnalysis_Module(jsonData: any) {
  const objectRoomArray = extractObjectRooms(jsonData);
  const responses = await analyzeAndStoreResponses(objectRoomArray);

  const updatedJSON = addChatGPTResponseToJSON(jsonData, objectRoomArray, responses);
  const outputFilePath = path.join(__dirname, "json_resultado.json");
  sendDataToServer(updatedJSON);
  sendDataToDataBase(updatedJSON);
  fs.writeFileSync(outputFilePath, JSON.stringify(updatedJSON, null, 2), "utf-8");
  console.log("✅ JSON actualizado con respuestas de ChatGPT guardado en:", outputFilePath);
}

triggerAnalysis_Module(jsonData);
