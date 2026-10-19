"use client";
import { useEffect, useRef, useState } from "react";
import Dictation from "./Dictation";
import { appendDictation } from "../../lib/dictation";
import { acknowledgeDraft, draftKey, readDraft } from "../../lib/summary-draft";

export default function SummaryEditor({ owner, book, initial, busy, offline, save, onStorageRisk }: {
  owner: string; book: string; initial: string; busy: boolean; offline: boolean;
  save: (text: string) => Promise<boolean>;
  onStorageRisk: (risk: boolean) => void;
}) {
  const key = draftKey(owner, book);
  const [text, setText] = useState(initial);
  const [base, setBase] = useState(initial);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [storageFailed, setStorageFailed] = useState(false);
  const [dictating, setDictating] = useState(false);
  const current = useRef(initial);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const dirty = text !== base;
  useEffect(() => {
    try {
      const draft = readDraft(sessionStorage, key);
      if (draft && draft.text !== initial) {
        current.current = draft.text;
        setText(draft.text);
        setMessage(draft.base !== initial
          ? "Rascunho recuperado. O resumo salvo mudou desde a criação do rascunho; confira antes de salvar."
          : "Rascunho recuperado nesta aba. Confira e salve quando terminar.");
      } else if (draft) sessionStorage.removeItem(key);
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
      if (value === saved) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify({ text: value, base: saved }));
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
        sessionStorage.setItem(key, JSON.stringify({ text: current.current, base: snapshot }));
      else acknowledgeDraft(sessionStorage, key, snapshot);
    }
    catch { setStorageFailed(true); }
    setMessage("");
  }
  return <div className="panel">
    <h2>O que ficou da leitura</h2>
    <label>Resumo e transcrição
      <textarea rows={9} value={text} disabled={!ready} maxLength={100000}
        onChange={(event) => change(event.target.value)}
        placeholder="Escreva com suas palavras ou cole uma transcrição…" />
    </label>
    {message && <p role="status">{message}</p>}
    {storageFailed && dirty && <p className="error" role="alert">Não foi possível guardar o rascunho nesta aba. Salve o resumo antes de sair.</p>}
    {dirty && !storageFailed && <p role="status">Rascunho guardado nesta aba. Ainda não salvo na biblioteca. Fechar a aba pode apagar o rascunho.</p>}
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
  </div>;
}
