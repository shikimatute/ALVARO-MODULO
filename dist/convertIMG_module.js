import sharp from "sharp";
import fs from "fs";
export async function convertirBufferAJPEG(rutaImagen, calidad = 100) {
    const bufferOriginal = fs.readFileSync(rutaImagen);
    const bufferJPEG = await sharp(bufferOriginal).jpeg({ quality: calidad }).toBuffer();
    return bufferJPEG;
}
