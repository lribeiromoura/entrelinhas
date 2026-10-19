const limit = 3 * 1024 * 1024;
export async function optimizePhoto(file: File): Promise<File> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 8 * 1024 * 1024
  )
    throw Error("Escolha JPEG, PNG ou WebP de até 8 MB.");
  if (file.size <= limit) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw Error("Não foi possível abrir a imagem. Escolha outra foto.");
  }
  try {
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw Error("Não foi possível preparar a imagem neste navegador.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.78, 0.62, 0.45]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob && blob.size <= limit)
        return new File([blob], "imagem.jpg", { type: "image/jpeg" });
    }
    throw Error(
      "A imagem continua muito grande. Recorte a área importante e tente novamente.",
    );
  } finally {
    bitmap.close();
  }
}
