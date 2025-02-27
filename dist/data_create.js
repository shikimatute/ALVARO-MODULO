export function extractObjectRooms(jsonData) {
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
                contextoIA: terminacion.contextoIA ?? " ",
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
export function generateSchema(pregunta) {
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
export function generateInstruction(element, esquemaGenerado, typeroom, question, contextoIA, dinamicInstructions, dinamicRules, conclusion) {
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
 ${conclusion}
**Importante:** Devuelve únicamente un JSON que debe ser validado con el siguiente ${esquemaString} schema, sin texto adicional antes o después pero con las respuestas `;
    return instruction;
}
