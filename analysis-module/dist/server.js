import express from "express";
import "./config.js"; // Asegura que las variables de entorno se cargan antes de todo
import { triggerAnalysis_Module } from "./analysis-module.js";
const app = express();
console.log("");
console.log("------------------------------------------");
console.log("      INICIANDO APP-IA-ANALYSIS");
console.log("------------------------------------------");
console.log("");
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.get("/", (_, res) => {
    res.send("Servidor funcionando correctamente");
});
// Ruta de prueba
app.post("/api/submit", async (req, res) => {
    try {
        const data = req.body; // Asegúrate de enviar datos en formato JSON
        console.log("Datos recibidos:", data);
        if (data.event_datasets) {
            if (data.event_datasets?.['control']) {
                if (data.event_datasets?.['control']?.['event_datasets']) {
                    if (data.event_datasets?.['control']?.['event_datasets']?.['zonas']) {
                        const formulario = data.event_datasets?.['control']?.['event_datasets']?.['zonas'];
                        await triggerAnalysis_Module(formulario,data);
                        res.status(200).json({ message: "Datos recibidos correctamente", data });
                    }
                    else {
                        res.status(500).json({ message: "Error al llamar a la API externa. no se entregaron los datos correspondientes. - BLOQUE 1" });
                    }
                }
                else {
                    res.status(500).json({ message: "Error al llamar a la API externa. no se entregaron los datos correspondientes. - BLOQUE 2" });
                }
            }
            else {
                res.status(500).json({ message: "Error al llamar a la API externa. no se entregaron los datos correspondientes. - BLOQUE 3" });
            }
        }
        else {
            res.status(500).json({ message: "Error al llamar a la API externa. no se entregaron los datos correspondientes. - BLOQUE 4" });
        }
    }
    catch (error) {
        console.error("Error al llamar a la API:", error);
        res.status(500).json({ message: "Error al llamar a la API externa." });
    }
});
// Inicia el servidor
const PORT = 3000;
app.listen(PORT, () => {
    console.log("");
    console.log("------------------------------------------");
    console.log("");
    console.log(`SERVIDOR CORRIENDO ->  http://localhost:${PORT}`);
    console.log("");
    console.log("");
});
