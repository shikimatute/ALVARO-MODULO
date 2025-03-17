//import dotenv from "dotenv"; //for test
import { generateSchema, generateInstruction } from "./data_create.js";
import openai from "openai";
import Ajv from "ajv";
export const modelGPT = "gpt-4o-mini";
const clientAi = new openai({
    apiKey: process.env.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
});
const ajv = new Ajv();
console.log(process.env.OPENAI_API_KEY);
//PARA TESTEO
export async function analyzeAndStoreResponses(objectRoomArray, proyecto) {
    const responses = [];
    for (const objectRoom of objectRoomArray) {
        console.log(`🔎 Analizando: ${objectRoom.room} - ${objectRoom.objectAnalisis}`);
        const response = await executeAnalysisOnRoom(objectRoom, proyecto);
        responses.push(...response);
    }
    console.log("RESPONSES");
    console.log(responses);
    return responses;
}
async function executeAnalysisOnRoom(objectRoom, proyecto) {
    try {
        console.log(`🔎 Analizando objeto: ${objectRoom.objectAnalisis} en ${objectRoom.room}`); //testing
        const jsonResponseArray = [];
        const { contextInstruccionesIA, contextReglasIA, contextConclusionIA } = proyecto?.event_datasets || {}; // Array para almacenar respuestas
        for (var i = 0; i < objectRoom.questionObject.length; i++) {
            console.log("Generando pregunta numero :" + i);
            const question = objectRoom.questionObject.map((q) => q.question);
            const contextoIA = objectRoom.questionObject.map((q) => q.contextoIA);
            console.log(question[i]);
            const imgs = objectRoom.questionObject.map((q) => q.imgs);
            const schema = generateSchema(question[i]);
            // console.log(schema); //test line
            const instruction = generateInstruction(objectRoom.objectAnalisis, schema, objectRoom.room, question[i], contextoIA[i], contextInstruccionesIA, contextReglasIA, contextConclusionIA);
            const jsonResponse = await getChatResponse(imgs[i], instruction, schema, objectRoom.room);
            console.log("RESPUESTA NUMERO " + i + "\n" + JSON.stringify(jsonResponse, null, 2));
            jsonResponseArray.push(jsonResponse);
        }
        // console.log("RESPUESTA DEL JSON RESPONSE"); testing
        console.log(JSON.stringify(jsonResponseArray, null, 2));
        return jsonResponseArray;
    }
    catch (error) {
        console.error("❌ Error crítico, deteniendo ejecución:", error);
        const jsonError = [];
        jsonError.push(error);
        return jsonError;
        //process.exit(1); // 🔥 Mata el proceso completamente
    }
}
async function askChatGPT(imageUrls, instruction) {
    try {
        console.log(imageUrls);
        const payload = {
            model: modelGPT,
            messages: [],
            max_tokens: 10000,
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
        console.log(response);
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
            return error;
            //process.exit(1); // 🔥 Mata el proceso completamente
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
                return error;
                //process.exit(1);
            }
            throw new Error("Error getting chat response");
        }
    }
}
async function validateJSON(content, esquemaGenerado) {
    try {
        // FOR TESTING
        /*console.log("ACA ESTA EL JSON");
        console.log("==============");
    
        console.log(content);
        console.log("==============");
    
        console.log("ACA ESTA EL ESQUEMA");
        
        console.log(esquemaGenerado);
        */
        let jsonString;
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/i);
        if (jsonMatch) {
            jsonString = jsonMatch[1].trim();
        }
        else {
            // AsumiMOS que el contenido completo es JSON y limpiamos separadores comunes
            jsonString = content
                .split("\n")
                .filter((line) => !line.includes("=============="))
                .join("\n")
                .trim();
        }
        // Parsear el JSON extraído
        const jsonResponse = JSON.parse(jsonString); // Parseamos el JSON limpio
        // Validar el JSON con el esquema generado
        const validate = ajv.compile(esquemaGenerado);
        const valid = validate(jsonResponse);
        if (!valid) {
            console.error("El JSON no es válido. Errores de validación:", validate.errors);
            return "error";
        }
        console.log("JSON válido:", content);
        return jsonResponse;
    }
    catch (error) {
        console.error("Error en la validación del JSON:", error);
        throw new Error("Hubo un error al validar el JSON");
    }
}
