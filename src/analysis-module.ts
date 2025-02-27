import "./config.js";
import axios from "axios";
//import fs from "fs"; //para test
//import path from "path"; //para test
//import { fileURLToPath } from "url"; //para test
import { ObjectRoom, Caracteristica } from "./interface";
import { extractObjectRooms } from "./data_create.js";
import { analyzeAndStoreResponses } from "./openAI_module.js";

// type EstadoEnum = "SI" | "NO" | "PARCIALMENTE"; //Valor para chatgpt

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

export async function triggerAnalysis_Module(
  jsonValidationData: any,
  infoData: any,
  proyecto: any
) {
  console.log("");
  console.log("# EJECUTANDO ANALISIS SOBRE CONTROL ");
  console.log("");
  const objectRoomArray = extractObjectRooms(jsonValidationData);
  const responses = await analyzeAndStoreResponses(objectRoomArray, proyecto);

  const updatedJSON = addChatGPTResponseToJSON(jsonValidationData, objectRoomArray, responses);
  sendDataToDataBase({
    controlInfo: infoData,
    analisisIA: updatedJSON,
  });
  /*const outputFilePath = path.join(__dirname, "json_resultado.json");
  fs.writeFileSync(outputFilePath, JSON.stringify(updatedJSON, null, 2), "utf-8");
  console.log("✅ JSON actualizado con respuestas de ChatGPT guardado en:", outputFilePath); */ //para testeo
}
/*/ COMIENZO DE TESTEO
const infoData = "test";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jsonFilePath = path.join(__dirname, "json_form_app.json");
// Leer el archivo JSON
const rawData = fs.readFileSync(jsonFilePath, "utf-8");
const jsonData = JSON.parse(rawData);
const proyecto = jsonData.proyecto;
console.log("Datos cargados desde JSON:", jsonData);
triggerAnalysis_Module(jsonData, infoData, proyecto); // para testeo
*/ /// FIN DE TESTEO
