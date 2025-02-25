import Ajv from "ajv";
import axios from "axios";
import openai from "openai";
// type EstadoEnum = "SI" | "NO" | "PARCIALMENTE"; //Valor para chatgpt
const clientAi = new openai({
    apiKey: process.env.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
});
const ajv = new Ajv();
function generateSchema(pregunta) {
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
//Generamos esquema dinamico
function generateInstruction(element, esquemaGenerado, typeroom, question) {
    const esquemaString = JSON.stringify(esquemaGenerado, null, 2);
    const instruction =
        `
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

async function askChatGPT(imageUrls, instruction) {
    try {
        console.log(imageUrls);
        const payload = {
            model: "gpt-4o-mini",
            messages: [],
            max_tokens: 500,
        };
        // Make an object with the instruction and the image urls
        const messages = [
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
    }
    catch (error) {
        console.error("Error en la llamada a OpenAI:", error);
        throw new Error("Error en la llamada a OpenAI");
    }
}
async function getChatResponse(imageUrls, instruction, esquemaGenerado, room) {
    let errorCount = 0;
    try {
        const response = await askChatGPT(imageUrls, instruction);
        console.log(response);
        const validJSON = await validateJSON(response, esquemaGenerado);
        console.log(validJSON);
        console.log("El objeto de la" + room + " se analizo exitosamente");
        return validJSON; //deberia ir la estructura que queremos guardar
    }
    catch (error) {
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
        }
        catch (error) {
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
async function validateJSON(content, esquemaGenerado) {
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
    }
    catch (error) {
        console.error("Error en la validación del JSON:", error);
        throw new Error("Hubo un error al validar el JSON");
    }
}
async function executeAnalysisOnRoom(objectRoom) {
    try {
        console.log(`🔎 Analizando objeto: ${objectRoom.objectAnalisis} en ${objectRoom.room}`); //testing
        const jsonResponseArray = []; // Array para almacenar respuestas
        for (var i = 0; i < objectRoom.questionObject.length; i++) {
            console.log("Generando pregunta numero :" + i);
            const question = objectRoom.questionObject.map((q) => q.question);
            console.log(question[i]);
            const imgs = objectRoom.questionObject.map((q) => q.imgs);
            const schema = generateSchema(question[i]);
            // console.log(schema); //test line
            const instruction = generateInstruction(objectRoom.objectAnalisis, schema, objectRoom.room, question[i]);
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
    }
    catch (error) {
        console.error("❌ Error crítico, deteniendo ejecución:", error);
        process.exit(1); // 🔥 Mata el proceso completamente
    }
}
function extractObjectRooms(jsonData) {
    if (!jsonData || jsonData.length === 0) {
        console.error("El JSON está vacío o no es válido.");
        return [];
    }
    const extractedRooms = [];
    for (const room of jsonData) {
        // Extraer el nombre del ambiente
        const roomName = room.nombre;
        if (!room.caracteristicas || room.caracteristicas.length === 0) {
            console.warn(`El campo "${roomName}" no tiene características.`);
            continue; // Saltamos si no tiene características
        }
        // Iterar sobre cada característica dentro del room
        for (const characteristic of room.caracteristicas) {
            const objectAnalysis = characteristic.nombre;
            // Extraer solo las preguntas con imágenes dentro de terminaciones
            const questionObject = characteristic.terminaciones
                .filter((terminacion) => {
                    // Verificamos que 'respuesta' exista y sea un objeto
                    if (!terminacion.respuesta || typeof terminacion.respuesta !== "object") {
                        return false;
                    }
                    // Verificamos que 'listaImagenes' exista y sea un array no vacío
                    return (Array.isArray(terminacion.respuesta.listaImagenes) &&
                        terminacion.respuesta.listaImagenes.length > 0);
                })
                .map((terminacion) => ({
                    question: terminacion.pregunta,
                    imgs: terminacion.respuesta.listaImagenes.map((img) => img.uri),
                }));
            // Solo agregar el ambiente si tiene preguntas con imágenes
            if (questionObject.length > 0) {
                const objectRoom = {
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
function addChatGPTResponseToJSON(originalJSON, analyzedRooms, responses) {
    return originalJSON.map((room) => {
        // Buscar si este room tiene análisis realizado
        const analyzedRoom = analyzedRooms.find((r) => r.room === room.nombre);
        if (analyzedRoom) {
            room.caracteristicas = room.caracteristicas.map((caracteristica) => {
                // Verificar si esta característica fue analizada
                const analyzedIndexes = analyzedRooms
                    .map((r, index) => (r.objectAnalisis === caracteristica.nombre ? index : -1))
                    .filter((index) => index !== -1);
                if (analyzedIndexes.length > 0) {
                    // Modificar cada pregunta dentro de terminaciones
                    caracteristica.terminaciones = caracteristica.terminaciones.map((terminacion) => {
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
async function sendDataToDataBase(data) {
    try {
        const response = await axios.post(process.env.REST_EYE_FINISH ?? "-", { data: data }, {
            headers: {
                "Content-Type": "application/json",
                "X-Parse-Master-Key": "myMasterKey",
                "X-Parse-Application-Id": "myAppId",
            },
        });
        console.log("Respuesta del endpoint externo:", response.data);
    }
    catch (error) {
        console.error("Error al comunicarse con el endpoint externo:", error);
    }
}
//PARA TESTEO
async function analyzeAndStoreResponses(objectRoomArray) {
    const responses = [];
    for (const objectRoom of objectRoomArray) {
        console.log(`🔎 Analizando: ${objectRoom.room} - ${objectRoom.objectAnalisis}`);
        const response = await executeAnalysisOnRoom(objectRoom);
        responses.push(...response);
    }
    console.log("RESPONSES");
    console.log(responses);
    return responses;
}
export async function triggerAnalysis_Module(jsonValidationData, infoData) {
    console.log("");
    console.log("# EJECUTANDO ANALISIS SOBRE CONTROL ");
    console.log("");
    const objectRoomArray = extractObjectRooms(jsonValidationData);
    const responses = await analyzeAndStoreResponses(objectRoomArray);
    const updatedJSON = addChatGPTResponseToJSON(jsonValidationData, objectRoomArray, responses);
    // const outputFilePath = path.join(__dirname, "json_resultado.json");
    // sendDataToServer(updatedJSON);
    sendDataToDataBase({
        controlInfo: infoData,
        analisisIA: updatedJSON
    });
    //fs.writeFileSync(outputFilePath, JSON.stringify(updatedJSON, null, 2), "utf-8");
    // console.log("✅ JSON actualizado con respuestas de ChatGPT guardado en:", outputFilePath);
}
//triggerAnalysis_Module(jsonData);  
