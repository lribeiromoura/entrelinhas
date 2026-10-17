"use client";
import { useEffect, useRef, useState } from "react";
import {
  createDictation,
  type DictationState,
  type Recognition,
} from "../../lib/dictation";
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export default function Dictation({
  onText,
  onActiveChange,
  disabled = false,
}: {
  onText: (text: string) => void;
  onActiveChange: (active: boolean) => void;
  disabled?: boolean;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [state, setState] = useState<DictationState>("idle");
  const [message, setMessage] = useState("");
  const [interim, setInterim] = useState("");
  const controller = useRef<ReturnType<typeof createDictation> | null>(null);
  const callbacks = useRef({ onText, onActiveChange });
  useEffect(() => {
    callbacks.current = { onText, onActiveChange };
  }, [onText, onActiveChange]);
  useEffect(() => {
    const browser = window as SpeechWindow;
    const Constructor =
      browser.SpeechRecognition || browser.webkitSpeechRecognition;
    setSupported(Boolean(Constructor));
    if (!Constructor) return;
    const instance = createDictation(() => new Constructor(), {
      onText: (text) => callbacks.current.onText(text),
      onInterim: setInterim,
      onState: (next, text) => {
        setState(next);
        setMessage(text);
        callbacks.current.onActiveChange(
          ["starting", "listening", "stopping"].includes(next),
        );
      },
    });
    controller.current = instance;
    return () => {
      instance.dispose();
      controller.current = null;
      callbacks.current.onActiveChange(false);
    };
  }, []);
  const active = ["starting", "listening", "stopping"].includes(state);
  if (supported === null) return null;
  if (!supported)
    return (
      <div className="dictation">
        <small>
          O ditado não está disponível neste navegador. Você pode digitar ou
          usar o ditado do teclado do seu dispositivo, se disponível.
        </small>
      </div>
    );
  return (
    <div className="dictation">
      <div className="dictation-controls">
        <button
          type="button"
          aria-pressed={active}
          className={active ? "" : "subtle"}
          disabled={active ? state === "stopping" : disabled}
          onClick={() =>
            active ? controller.current?.stop() : controller.current?.start()
          }
        >
          {state === "stopping"
            ? "Finalizando…"
            : active
              ? "Parar ditado"
              : "Ditar resumo"}
        </button>
        {active && (
          <span className="listening-indicator" aria-hidden="true">
            {state === "starting"
              ? "Aguardando permissão…"
              : "● Microfone ativo"}
          </span>
        )}
      </div>
      <small>
        Ditado em português do Brasil. Ao iniciar, o navegador solicitará acesso
        ao microfone e poderá enviar o áudio ao serviço de reconhecimento. O
        texto só será salvo quando você clicar em Salvar resumo.
      </small>
      {message && (
        <p
          className={state === "error" ? "dictation-error" : "dictation-status"}
          role={state === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      {interim && (
        <div className="dictation-preview">
          <small>TRECHO EM RECONHECIMENTO</small>
          <p>{interim}</p>
        </div>
      )}
    </div>
  );
}
