"use client";
import { useEffect, useRef, useState } from "react";
import Dictation from "./Dictation";
import SummaryHistory from "./SummaryHistory";
import { appendDictation } from "../../lib/dictation";
import { acknowledgeDraft, draftKey, recoverDraft } from "../../lib/summary-draft";

export default function SummaryEditor({ owner, book, initial, busy, offline, save, restore, onStorageRisk }: {
  owner: string; book: string; initial: string; busy: boolean; offline: boolean;
  save: (text: string) => Promise<boolean>;
  restore: (id: string) => Promise<boolean>;
  onStorageRisk: (risk: boolean) => void;
}) {
  const key = draftKey(owner, book);
  const [text, setText] = useState(initial);
  const [base, setBase] = useState(initial);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [storageFailed, setStorageFailed] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const current = useRef(initial);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const dirty = text !== base;
  useEffect(() => {
    try {
      const draft = recoverDraft(localStorage, sessionStorage, key);
      if (draft && draft.text !== initial) {
        current.current = draft.text;
        setText(draft.text);
        setMessage(draft.base !== initial
          ? "Rascunho recuperado. O resumo salvo mudou desde a criação do rascunho; confira antes de salvar."
          : "Rascunho recuperado deste navegador. Confira e salve quando terminar.");
      } else if (draft) localStorage.removeItem(key);
    } catch { setStorageFailed(true); }
    setReady(true);
  }, [key]); // The parent mounts a separate editor for each account and book.
  useEffect(() => {
    onStorageRisk(dirty && storageFailed);
    return () => onStorageRisk(false);
  }, [dirty, storageFailed, onStorageRisk]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(value: string, saved = base) {
    current.current = value;
    setText(value);
    try {
      if (value === saved) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ text: value, base: saved }));
      setStorageFailed(false);
    } catch { setStorageFailed(true); }
  }
  async function submit() {
    const snapshot = current.current;
    if (!await save(snapshot)) return;
    setBase(snapshot);
    // Dictation/typing may have changed the text while the request was in flight.
    try {
      if (mounted.current && current.current !== snapshot)
        localStorage.setItem(key, JSON.stringify({ text: current.current, base: snapshot }));
      else acknowledgeDraft(localStorage, key, snapshot);
    }
    catch { setStorageFailed(true); }
    setMessage("");
  }
  return <div className="panel">
    <div className="summary-heading"><h2>O que ficou da leitura</h2><button type="button" className="subtle" disabled={busy || offline || dictating} onClick={() => setHistoryOpen(true)}>Histórico</button></div>
    <label>Resumo e transcrição
      <textarea rows={9} value={text} disabled={!ready} maxLength={100000}
        onChange={(event) => change(event.target.value)}
        placeholder="Escreva com suas palavras ou cole uma transcrição…" />
    </label>
    {message && <p role="status">{message}</p>}
    {storageFailed && dirty && <p className="error" role="alert">Não foi possível guardar o rascunho neste navegador. Salve o resumo antes de sair.</p>}
    {dirty && !storageFailed && <p role="status">Rascunho guardado neste navegador, mesmo após fechar a aba. Ainda não salvo na biblioteca; não é sincronizado com outros dispositivos.</p>}
    <Dictation disabled={!ready || busy || offline}
      onText={(value) => change(appendDictation(current.current, value))}
      onActiveChange={setDictating} />
    <button disabled={!ready || busy || dictating} onClick={submit}>Salvar resumo</button>
    {dirty && <button className="subtle" disabled={busy || dictating} onClick={() => {
      if (window.confirm("Descartar este rascunho e voltar ao último resumo salvo?")) {
        change(base);
        setMessage("");
      }
    }}>Descartar rascunho</button>}
    {historyOpen && <SummaryHistory book={book} busy={busy} onClose={() => setHistoryOpen(false)} onRestore={async version => {
      if (dirty && !window.confirm("Usar esta versão substitui o rascunho ainda não salvo. Deseja continuar?")) return;
      if (!await restore(version.id)) throw Error("Não foi possível recuperar esta versão. Confira sua conexão e tente novamente.");
      current.current = version.summary; setText(version.summary); setBase(version.summary);
      try { localStorage.removeItem(key); setStorageFailed(false); } catch { setStorageFailed(true); }
      setMessage(""); setHistoryOpen(false);
    }} />}
  </div>;
}
