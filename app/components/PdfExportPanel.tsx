"use client";
import { useEffect, useRef, useState } from "react";
import type { BackupMetadata } from "../../lib/backup-format";
import { createLibraryPdf, fetchPdfImage, pdfSectionLabels, selectPdfContent, type PdfSection } from "../../lib/pdf-export";

const allSections: PdfSection[] = ["summary", "photos", "covers"];
type Book = { id: string; title: string; author: string };
export default function PdfExportPanel({ books, singleBookId, onBack, offline, busy, setBusy }: { books: Book[]; singleBookId?: string | null; onBack?: () => void; offline: boolean; busy: boolean; setBusy: (value: boolean) => void }) {
  const availableBooks = singleBookId ? books.filter(book => book.id === singleBookId) : books;
  const [selectedBooks, setSelectedBooks] = useState<string[]>(() => availableBooks.map(book => book.id));
  const [sections, setSections] = useState<PdfSection[]>(allSections);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); setBusy(false); }, [setBusy]);
  useEffect(() => {
    if (!working) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [working]);
  const toggleBook = (id: string) => setSelectedBooks(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const toggleSection = (id: PdfSection) => setSections(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  async function generate() {
    if (!selectedBooks.length || !sections.length) return;
    const abort = new AbortController(); controller.current = abort;
    setWorking(true); setBusy(true); setError(""); setStatus("Lendo a biblioteca…");
    try {
      const response = await fetch("/api/backup", { cache: "no-store", signal: abort.signal });
      if (!response.ok) throw new Error("Não foi possível carregar sua biblioteca. Confira sua conexão e sessão.");
      const metadata = await response.json() as BackupMetadata;
      const options = { bookIds: selectedBooks, sections };
      const picked = selectPdfContent(metadata, options);
      const images = new Map<string, Awaited<ReturnType<typeof fetchPdfImage>>>();
      for (const [index, photo] of picked.photos.entries()) {
        setStatus(`Lendo imagem ${index + 1} de ${picked.photos.length}…`);
        images.set(photo.id, await fetchPdfImage(photo.id, photo.mime, abort.signal));
      }
      setStatus("Montando o PDF…");
      const blob = await createLibraryPdf(metadata, options, images);
      if (abort.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const title = singleBookId ? availableBooks[0]?.title.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) : "biblioteca";
      link.href = url; link.download = `entrelinhas-${title || "livro"}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setStatus("PDF preparado para download. Confira a pasta de downloads do seu dispositivo.");
    } catch (cause) {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível gerar o PDF.");
    } finally { setWorking(false); setBusy(false); controller.current = null; }
  }
  return <section className="panel pdf-export-panel">
    {onBack && <button type="button" className="subtle" disabled={busy} onClick={onBack}>← Voltar ao livro</button>}
    <h1>{singleBookId ? "Exportar livro em PDF" : "Exportar PDF"}</h1>
    <p>{singleBookId ? `Escolha o conteúdo de ${availableBooks[0]?.title ?? "este livro"} para baixar.` : "Escolha os livros e o conteúdo que deseja guardar ou compartilhar."} O PDF inclui apenas registros ativos já salvos.</p>
    {!singleBookId && <><h2>Livros</h2>
    <div className="pdf-export-actions">
      <button type="button" className="subtle" disabled={busy} onClick={() => setSelectedBooks(availableBooks.map(book => book.id))}>Todos os livros</button>
      <button type="button" className="subtle" disabled={busy} onClick={() => setSelectedBooks([])}>Limpar seleção</button>
    </div>
    {availableBooks.length === 0 ? <p>Adicione um livro antes de exportar.</p> : <div className="pdf-export-options">{availableBooks.map(book => <label key={book.id}><input type="checkbox" checked={selectedBooks.includes(book.id)} disabled={busy} onChange={() => toggleBook(book.id)} /> <span>{book.title} <small>· {book.author}</small></span></label>)}</div>}</>}
    <h2>Conteúdo</h2>
    <div className="pdf-export-actions">
      <button type="button" className="subtle" disabled={busy} onClick={() => setSections(allSections)}>Tudo</button>
      <button type="button" className="subtle" disabled={busy} onClick={() => setSections(["summary"])}>Somente resumos</button>
      <button type="button" className="subtle" disabled={busy} onClick={() => setSections([])}>Limpar seleção</button>
    </div>
    <div className="pdf-export-options">{allSections.map(section => <label key={section}><input type="checkbox" checked={sections.includes(section)} disabled={busy} onChange={() => toggleSection(section)} /> <span>{pdfSectionLabels[section]}</span></label>)}</div>
    <p className="muted">Capas enviadas por você entram no PDF. Capas buscadas na Open Library ficam na biblioteca online. Rascunhos e itens da lixeira não entram no PDF.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {status && <p role="status">{status}</p>}
    <button type="button" disabled={busy || offline || !selectedBooks.length || !sections.length} onClick={() => void generate()}>{working ? "Gerando PDF…" : "Baixar PDF"}</button>
  </section>;
}
