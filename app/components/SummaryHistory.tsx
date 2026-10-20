"use client";
import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
type Item = { id: string; preview: string; created_at: number };
type Version = { id: string; summary: string; created_at: number };
export default function SummaryHistory({ book, busy, onClose, onRestore }: { book: string; busy: boolean; onClose: () => void; onRestore: (version: Version) => Promise<void> }) {
  const [items, setItems] = useState<Item[]>([]), [currentId, setCurrentId] = useState<string | null>(null), [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Version | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  async function load(offset = 0) {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/books/${encodeURIComponent(book)}/summaries?offset=${offset}`, { signal: abort.signal, cache: "no-store" });
      if (!response.ok) throw Error("Não foi possível carregar o histórico.");
      const data = await response.json();
      setItems(current => offset ? [...current, ...data.items] : data.items); setCurrentId(data.currentId); setHasMore(data.hasMore);
    } catch (cause) { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha ao carregar histórico."); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void load(); return () => controller.current?.abort(); }, [book]);
  async function select(id: string) {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/books/${encodeURIComponent(book)}/summaries?version=${encodeURIComponent(id)}`, { signal: abort.signal, cache: "no-store" });
      if (!response.ok) throw Error("Não foi possível abrir essa versão.");
      setSelected(await response.json());
    } catch (cause) { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha ao abrir versão."); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  }
  return <Modal title="Histórico do resumo" busy={busy} onClose={onClose}>
    <p>O resumo atual continua no livro. Você pode consultar versões salvas e usar uma delas como atual.</p>
    {error && <><p className="error" role="alert">{error}</p>{!selected && <button type="button" className="subtle" disabled={busy || loading} onClick={() => void load()}>Tentar novamente</button>}</>}
    {selected ? <>
      <button type="button" className="subtle" disabled={busy || loading} onClick={() => setSelected(null)}>← Todas as versões</button>
      <h3>{new Date(selected.created_at).toLocaleString("pt-BR")}{selected.id === currentId ? " · Atual" : ""}</h3>
      <div className="version-text pre">{selected.summary || "Resumo vazio."}</div>
      {selected.id !== currentId && <button type="button" disabled={busy || loading} onClick={async () => { setError(""); try { await onRestore(selected); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível recuperar a versão."); } }}>Usar como atual</button>}
    </> : <>
      {!items.length && !loading && !error && <p>Ainda não há versões anteriores. Elas aparecerão quando você salvar alterações no resumo.</p>}
      <div className="version-list">{items.map(item => <button type="button" className="subtle" key={item.id} disabled={busy || loading} onClick={() => void select(item.id)}>
        <strong>{new Date(item.created_at).toLocaleString("pt-BR")}{item.id === currentId ? " · Atual" : ""}</strong><span>{item.preview || "Resumo vazio."}</span>
      </button>)}</div>
      {hasMore && <button type="button" className="subtle" disabled={busy || loading} onClick={() => void load(items.length)}>Ver mais versões</button>}
    </>}
    {loading && <p role="status">Carregando histórico…</p>}
  </Modal>;
}
