import openai from "openai";
import Ajv, { Schema } from "ajv";
import axios from "axios";

// type EstadoEnum = "SI" | "NO" | "PARCIALMENTE"; //Valor para chatgpt

const clientAi = new openai({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

const dinamicInstructions = `
1. Indica cuál(es) de estas partidas deseas evaluar en la imagen (ej. CERÁMICA PISOS, RED DE GAS INTERIOR, etc.).

2. Para cada partida, asigna un porcentaje de avance en cualquier punto entre 0 y 100:
   • 0% si no se ve instalado/completado o no se aprecia en la imagen (y no hay partida posterior que lo implique como terminado).
   • 90% si está prácticamente listo, pero no puedes confirmar la totalidad de la partida. Dejarás este 10% pendiente hasta que un administrador confirme.
   • 100% si el elemento está completamente instalado/completado, o si en la imagen hay evidencia de una partida posterior que requiere su finalización.
   • Si la partida incluye varios subítems (por ej., “cerraduras_interiores_y_topes”), evalúa cada uno por separado y luego calcula el promedio.

3. Incluye siempre un campo “observaciones” que describa brevemente lo que se ve (o no se ve) en la imagen y justifique el porcentaje asignado.

4. Opcionalmente, concluye con un campo "conclusion" si deseas un resumen general.
`;

const dinamicRules = `•	Regla de Suposición sobre Partidas Posteriores
Si la imagen evidencia que una partida posterior está finalizada y depende de una partida anterior, se supone que la partida anterior está completada.
	•	Ejemplo: Cerámica instalada y fraguada implica la impermeabilización previa al 100%.
	•	No Añadir Información Extra
	•	El porcentaje de avance se basa únicamente en la imagen y la partida consultada.
	•	No añadas datos de otras partes de la imagen que no sean relevantes a la pregunta.
	•	Análisis Exclusivo con Base en Foto + Pregunta
	•	Determina la calificación (porcentaje) exclusivamente con la foto y la pregunta.
	•	No agregues más información si el prompt no lo solicita. `;

const ajv = new Ajv();

function generateSchema(pregunta: string) {
  return {
    type: "object",
    properties: {
      pregunta: { const: pregunta },
      progreso: { type: "string", enum: ["COMPLETO", "INCOMPLETO"] },
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

//Generamos esquema dinamico
function generateInstruction(
  element: string,
  esquemaGenerado: Schema,
  typeroom: string,
  question: string,
  contextoIA: string,
  dinamicInstructions: string,
  dinamicRules: string
) {
  const esquemaString = JSON.stringify(esquemaGenerado, null, 2);
  const instruction = `
Eres un analizador de imágenes de una empresa constructora. En las siguientes imágenes se muestra una vivienda en construcción, pertenecientes a una ${typeroom}. Se requiere verificar la instalación y/o terminación de diversos elementos. Para cada ítem, se deberá indicar el porcentaje de avance. Cuando una partida incluya más de un subítem (por ejemplo, cerraduras y topes), se calculará el promedio de sus estados de avance

Para el siguiente ${element} ten en cuenta lo siguiente:

${dinamicInstructions}

Ten en cuenta estas instrucciones para responder el siguiente :
${esquemaGenerado} 
Sigue las siguientes reglas para responder estas ${question}:

${dinamicRules} .
  Las respuesta para el criterio "progreso" debe ser el siguiente enum: type EstadoEnum = "COMPLETO" | "INCOMPLETO";

Ademas cada pregunta tiene que ser respondida con el siguiente criterio: ${contextoIA}
 EN CONCLUSION: 
  1.	Observa la imagen.
	2.	Evalúa el porcentaje de avance (0%, 90%, 100%, u otro valor intermedio si son varios subítems).
	3.	Regla de Suposición: si una partida posterior depende de esta y está instalada, asume la partida previa al 100%.
	4.	90%: si no puedes confirmar totalmente que esté al 100%, deja un 10% pendiente hasta la confirmación del administrador.
	5.	Observaciones: describe brevemente la razón de tu calificación, sin información adicional no solicitada.
Criterios de Evaluación
	•	0%: No instalado o no visto en la imagen.
	•	90%: Prácticamente listo, pero sin confirmación absoluta.
	•	100%: Completo o deducido por la Regla de Suposición.
	•	Valores intermedios: si varios subítems tienen estados diferentes (ej. 50% si uno está a 100% y otro a 0%).

**Importante:** Devuelve únicamente un JSON que debe ser validado con el siguiente ${esquemaString} schema, sin texto adicional antes o después pero con las respuestas `;
  return instruction;
}

async function askChatGPT(imageUrls: string[], instruction: string) {
  try {
    console.log(imageUrls);
    const payload = {
      model: "gpt-4o",
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

async function executeAnalysisOnRoom(objectRoom: ObjectRoom): Promise<any[]> {
  try {
    console.log(`🔎 Analizando objeto: ${objectRoom.objectAnalisis} en ${objectRoom.room}`); //testing
    const jsonResponseArray: any[] = []; // Array para almacenar respuestas
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
        dinamicInstructions,
        dinamicRules
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

interface ObjectRoom {
  room: string; //room
  objectCount: number;
  objectAnalisis: string; //caracteristicas
  questionObject: {
    question: string;
    contextoIA: string; //pregunta
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
          contextoIA: terminacion.contextoIA ?? " ",
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
        // Verificar si esta característica fue analizada
        const analyzedIndexes = analyzedRooms
          .map((r, index) => (r.objectAnalisis === caracteristica.nombre ? index : -1))
          .filter((index) => index !== -1);

        if (analyzedIndexes.length > 0) {
          // Modificar cada pregunta dentro de terminaciones
          caracteristica.terminaciones = caracteristica.terminaciones.map((terminacion: any) => {
            // Buscar la respuesta correspondiente a esta pregunta
            const response = responses.find((resp) => resp.pregunta === terminacion.pregunta);

            if (response) {
              return {
                ...terminacion,
                respuestaChatGPT: response, // 🔥 Se asegura que la respuesta coincide con la pregunta
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
      process.env.REST_EYE_FINISH ?? "-",
      { data: data },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Parse-Master-Key": "myMasterKey",
          "X-Parse-Application-Id": "myAppId",
        },
      }
    );

    console.log("Respuesta del endpoint externo:", response.data);
  } catch (error) {
    console.error("Error al comunicarse con el endpoint externo:", error);
  }
}

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

export async function triggerAnalysis_Module(jsonValidationData: any, infoData: any) {
  console.log("");
  console.log("# EJECUTANDO ANALISIS SOBRE CONTROL ");
  console.log("");
  const objectRoomArray = extractObjectRooms(jsonValidationData);
  const responses = await analyzeAndStoreResponses(objectRoomArray);

  const updatedJSON = addChatGPTResponseToJSON(jsonValidationData, objectRoomArray, responses);
  // const outputFilePath = path.join(__dirname, "json_resultado.json");
  sendDataToDataBase({
    controlInfo: infoData,
    analisisIA: updatedJSON,
  });
  //fs.writeFileSync(outputFilePath, JSON.stringify(updatedJSON, null, 2), "utf-8");
  // console.log("✅ JSON actualizado con respuestas de ChatGPT guardado en:", outputFilePath);
}
//triggerAnalysis_Module(jsonData, infoData); para testeo
