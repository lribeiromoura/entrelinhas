export type DictationState =
  "idle" | "starting" | "listening" | "stopping" | "error";
export interface SpeechResult {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<SpeechResult>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export const speechError = (code: string) =>
  ({
    "not-allowed":
      "Permissão do microfone negada. Autorize o acesso nas configurações do navegador para usar o ditado.",
    "service-not-allowed":
      "O navegador bloqueou o serviço de ditado. Você pode continuar digitando.",
    "audio-capture":
      "Não foi possível acessar o microfone. Confira se ele está conectado e disponível.",
    network:
      "A conexão com o serviço de ditado falhou. O texto recebido foi preservado; tente novamente.",
    "no-speech":
      "Não foi detectada fala. Você pode iniciar o ditado novamente.",
    "language-not-supported":
      "Este navegador não oferece ditado em português do Brasil.",
    aborted:
      "O ditado foi interrompido. Você pode continuar digitando ou tentar novamente.",
  })[code] ||
  "Não foi possível continuar o ditado. O texto recebido foi preservado.";
export function appendDictation(previous: string, text: string) {
  const addition = text.trim();
  return addition
    ? previous + (previous && !/\s$/.test(previous) ? " " : "") + addition
    : previous;
}
export function createDictation(
  factory: () => Recognition,
  callbacks: {
    onText: (text: string) => void;
    onInterim: (text: string) => void;
    onState: (state: DictationState, message: string) => void;
  },
) {
  let current: Recognition | null = null;
  let disposed = false;
  let pending = "";
  let failure = "";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  function clear() {
    if (timeout) clearTimeout(timeout);
    timeout = undefined;
  }
  function preserve() {
    if (pending.trim()) callbacks.onText(pending.trim());
    pending = "";
    callbacks.onInterim("");
  }
  function finish(rec: Recognition) {
    if (disposed || current !== rec) return;
    clear();
    preserve();
    current = null;
    callbacks.onState(
      failure ? "error" : "idle",
      failure || "Ditado encerrado. Revise o texto e clique em Salvar resumo.",
    );
  }
  return {
    start() {
      if (disposed || current) return;
      failure = "";
      pending = "";
      try {
        const rec = factory();
        current = rec;
        const committed = new Set<number>();
        rec.lang = "pt-BR";
        rec.continuous = true;
        rec.interimResults = true;
        rec.onstart = () => {
          if (current === rec && !disposed)
            callbacks.onState("listening", "Ouvindo… Fale seu resumo.");
        };
        rec.onresult = (event) => {
          if (current !== rec || disposed) return;
          const provisional: string[] = [];
          for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i];
            const text = result[0]?.transcript || "";
            if (result.isFinal) {
              if (!committed.has(i)) {
                committed.add(i);
                if (text.trim()) callbacks.onText(text.trim());
              }
            } else if (!committed.has(i)) provisional.push(text);
          }
          pending = provisional.join(" ").trim();
          callbacks.onInterim(pending);
        };
        rec.onerror = (event) => {
          if (current !== rec || disposed) return;
          failure = speechError(event.error);
          preserve();
          // Release handlers immediately: engines do not consistently emit end after errors.
          current = null;
          clear();
          try {
            rec.abort();
          } catch {}
          callbacks.onState("error", failure);
        };
        rec.onend = () => finish(rec);
        callbacks.onState("starting", "Aguardando o microfone…");
        rec.start();
      } catch {
        const rec = current;
        current = null;
        try {
          rec?.abort();
        } catch {}
        callbacks.onState(
          "error",
          "Não foi possível iniciar o ditado. Confira a permissão do microfone e tente novamente.",
        );
      }
    },
    stop() {
      const rec = current;
      if (!rec || disposed) return;
      callbacks.onState("stopping", "Finalizando o ditado…");
      try {
        rec.stop();
        if (current === rec)
          timeout = setTimeout(() => {
            finish(rec);
            try {
              rec.abort();
            } catch {}
          }, 5000);
      } catch {
        finish(rec);
        try {
          rec.abort();
        } catch {}
      }
    },
    dispose() {
      disposed = true;
      clear();
      const rec = current;
      current = null;
      try {
        rec?.abort();
      } catch {}
    },
  };
}
