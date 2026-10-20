import type { BackupMetadata } from "./backup-format";
import { maxBackupPhotoBytes } from "./backup-format";
import { photoBase64 } from "./backup-client";

export type PdfSection = "summary" | "ideas" | "photos" | "covers" | "questions" | "connections";
export const pdfSectionLabels: Record<PdfSection, string> = {
  summary: "Resumos", ideas: "Ideias", photos: "Fotos das anotações", covers: "Capas enviadas", questions: "Perguntas e respostas", connections: "Conexões entre ideias",
};
export type PdfOptions = { bookIds: string[]; sections: PdfSection[] };
export type PdfImage = { mime: string; data: string };

export function selectPdfContent(metadata: BackupMetadata, options: PdfOptions) {
  const ids = new Set(options.bookIds);
  const books = metadata.books.filter(book => book.deleted_at === null && ids.has(book.id));
  const bookIds = new Set(books.map(book => book.id));
  const ideas = metadata.ideas.filter(idea => idea.deleted_at === null && bookIds.has(idea.book));
  const ideaIds = new Set(ideas.map(idea => idea.id));
  const questions = metadata.questions.filter(question => question.deleted_at === null && bookIds.has(question.book));
  const photos = metadata.photos.filter(photo => photo.deleted_at === null && bookIds.has(photo.book) && ((photo.kind === "cover" && options.sections.includes("covers")) || (photo.kind === "note" && options.sections.includes("photos"))));
  const connections = metadata.connections.filter(connection => connection.deleted_at === null && ideaIds.has(connection.source) && ideaIds.has(connection.target));
  return { books, ideas, questions, photos, connections };
}

export async function fetchPdfImage(id: string, mime: string, signal: AbortSignal): Promise<PdfImage> {
  const response = await fetch("/api/backup/photo/" + encodeURIComponent(id), { cache: "no-store", signal });
  if (!response.ok) throw new Error("Não foi possível ler uma imagem selecionada. Tente novamente.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > maxBackupPhotoBytes) throw new Error("Uma imagem selecionada excede o limite de 3 MB.");
  if (mime === "image/webp") {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível converter uma foto para PDF.");
      context.drawImage(bitmap, 0, 0);
      const converted = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", .85));
      if (!converted) throw new Error("Não foi possível converter uma foto para PDF.");
      return { mime: "image/jpeg", data: `data:image/jpeg;base64,${photoBase64(new Uint8Array(await converted.arrayBuffer()))}` };
    } finally { bitmap.close(); }
  }
  if (mime !== "image/jpeg" && mime !== "image/png") throw new Error("Formato de imagem não compatível com PDF nesta versão.");
  return { mime, data: `data:${mime};base64,${photoBase64(bytes)}` };
}

export async function createLibraryPdf(metadata: BackupMetadata, options: PdfOptions, images: Map<string, PdfImage>): Promise<Blob> {
  const picked = selectPdfContent(metadata, options);
  if (!picked.books.length) throw new Error("Escolha pelo menos um livro da biblioteca.");
  if (!options.sections.length) throw new Error("Escolha pelo menos uma seção para o PDF.");
  const pdfMakeModule = await import("pdfmake/build/pdfmake");
  const fontsModule = await import("pdfmake/build/vfs_fonts");
  const pdfMake = pdfMakeModule.default ?? pdfMakeModule;
  pdfMake.addVirtualFileSystem(fontsModule.default ?? fontsModule);
  const section = (title: string) => ({ text: title, style: "section", margin: [0, 16, 0, 6] });
  const para = (value: string) => ({ text: value || "—", style: "body", margin: [0, 0, 0, 7] });
  const content: object[] = [
    { text: "ENTRELINHAS", style: "eyebrow" },
    { text: "Minha biblioteca", style: "coverTitle" },
    { text: `${picked.books.length} ${picked.books.length === 1 ? "livro" : "livros"}  ·  ${new Date().toLocaleDateString("pt-BR")}`, style: "subtitle" },
    { text: "Conteúdo: " + options.sections.map(key => pdfSectionLabels[key]).join(" · "), style: "subtitle", margin: [0, 0, 0, 15] },
  ];
  for (const [index, book] of picked.books.entries()) {
    content.push({ text: book.title, style: "bookTitle", pageBreak: index === 0 ? undefined : "before" });
    content.push({ text: book.author, style: "author" });
    if (options.sections.includes("covers") && book.cover_photo && images.has(book.cover_photo)) {
      content.push({ image: images.get(book.cover_photo)!.data, fit: [165, 230], margin: [0, 12, 0, 8] });
    }
    if (options.sections.includes("summary")) { content.push(section("Resumo")); content.push(para(book.summary.trim() || "Sem resumo salvo.")); }
    if (options.sections.includes("ideas")) {
      content.push(section("Ideias"));
      const entries = picked.ideas.filter(idea => idea.book === book.id);
      if (!entries.length) content.push(para("Nenhuma ideia salva."));
      for (const idea of entries) content.push({ stack: [{ text: idea.title, style: "itemTitle" }, para(idea.description)], margin: [0, 0, 0, 7] });
    }
    if (options.sections.includes("questions")) {
      content.push(section("Perguntas e respostas"));
      const entries = picked.questions.filter(question => question.book === book.id);
      if (!entries.length) content.push(para("Nenhuma pergunta salva."));
      for (const question of entries) content.push({ stack: [{ text: question.prompt, style: "itemTitle" }, para(question.answer || "Sem resposta salva.")], margin: [0, 0, 0, 8] });
    }
    if (options.sections.includes("photos")) {
      content.push(section("Fotos das anotações"));
      const entries = picked.photos.filter(photo => photo.book === book.id && photo.kind === "note");
      if (!entries.length) content.push(para("Nenhuma foto salva."));
      for (const [photoIndex, photo] of entries.entries()) {
        const image = images.get(photo.id);
        if (!image) throw new Error("Faltou uma foto selecionada. Gere o PDF novamente.");
        content.push({ stack: [
          { text: `Foto ${photoIndex + 1}`, style: "itemTitle", margin: [0, 8, 0, 5] },
          { image: image.data, fit: [480, 560], margin: [0, 0, 0, 14] },
        ], unbreakable: true });
      }
    }
    if (options.sections.includes("connections")) {
      content.push(section("Conexões entre ideias"));
      const entries = picked.connections.filter(connection => picked.ideas.some(idea => idea.id === connection.source && idea.book === book.id));
      if (!entries.length) content.push(para("Nenhuma conexão salva."));
      const bookById = new Map(picked.books.map(item => [item.id, item]));
      const ideaById = new Map(picked.ideas.map(item => [item.id, item]));
      for (const connection of entries) {
        const source = ideaById.get(connection.source)!, target = ideaById.get(connection.target)!;
        content.push(para(`${source.title} (${bookById.get(source.book)?.title})  ↔  ${target.title} (${bookById.get(target.book)?.title})`));
      }
    }
  }
  const definition = {
    pageSize: "A4", pageMargins: [48, 52, 48, 55],
    content,
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#263b35", lineHeight: 1.25 },
    styles: {
      eyebrow: { fontSize: 10, bold: true, color: "#658675", characterSpacing: 2, margin: [0, 0, 0, 12] },
      coverTitle: { fontSize: 27, bold: true, color: "#213d32", margin: [0, 0, 0, 12] },
      subtitle: { fontSize: 9, color: "#678075", margin: [0, 0, 0, 8] },
      bookTitle: { fontSize: 20, bold: true, color: "#213d32", margin: [0, 6, 0, 5] },
      author: { fontSize: 11, italics: true, color: "#678075", margin: [0, 0, 0, 10] },
      section: { fontSize: 13, bold: true, color: "#315e49" },
      itemTitle: { fontSize: 10, bold: true, color: "#263b35", margin: [0, 4, 0, 3] },
      body: { fontSize: 10 },
    },
    footer: (currentPage: number, pageCount: number) => ({ text: `Entrelinhas  ·  ${currentPage} / ${pageCount}`, alignment: "right", fontSize: 8, color: "#8a9b91", margin: [0, 12, 48, 0] }),
  };
  return pdfMake.createPdf(definition).getBlob();
}
