import sharp from "sharp";
import { maxPhotoBytes } from "./storage-provider";
export async function normalizePhoto(input: Buffer) {
  try {
    const source = sharp(input, { limitInputPixels: 64000000 })
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      });
    for (const quality of [90, 76, 60]) {
      const bytes = await source
        .clone()
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (bytes.length <= maxPhotoBytes) return { bytes, mime: "image/jpeg" };
    }
  } catch {
    throw Error(
      "Não foi possível ler a imagem. Escolha uma foto JPEG, PNG ou WebP válida.",
    );
  }
  throw Error(
    "A imagem continua muito grande. Recorte a área importante e tente novamente.",
  );
}
