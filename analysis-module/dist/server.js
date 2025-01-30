import express from "express";
//import axios from "axios";
import { triggerAnalysis_Module } from "./analysis-module.js";
const app = express();
//const mockAxios = axios.create();
// Middleware para parsear JSON
app.use(express.json());
app.get("/", (_, res) => {
  res.send("Servidor funcionando correctamente");
});
// Ruta de prueba
app.post("/api/submit", async (req, res) => {
  try {
    const data = req.body; // Asegúrate de enviar datos en formato JSON
    console.log("Datos recibidos:", data);
    res.status(200).json({ message: "Datos recibidos correctamente", data });
    const formulario = data["event_datasets"]["zonas"];
    triggerAnalysis_Module(formulario);
    /*mockAxios.interceptors.request.use((config) => {
          return Promise.resolve({
            data: {
              message: "Datos simulados correctamente procesados",
              received: config.data,
            },
            status: 200,
            statusText: "OK",
            headers: config.headers,
            config: config,
          });
        });
        // Llama a la API externa usando axios
    
        async function callAnalysisEndpoint(objectRoom: object) {
          try {
            console.log("llamar funcion");
            triggerAnalysis_Module(req.body);
          } catch (error) {
            console.error("Error al llamar al endpoint de análisis:", error);
          }
        } */ //para alvaro.
  } catch (error) {
    console.error("Error al llamar a la API:", error);
    res.status(500).json({ message: "Error al llamar a la API externa." });
  }
});
// Inicia el servidor
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
