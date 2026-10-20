"use client";
import { useEffect, useRef, useState } from "react";
import { backupCounts, type BackupManifest } from "../../lib/backup-format";
import { exportBackup, readBackup, restoreBackup } from "../../lib/backup-client";
export default function BackupPanel({ busy, offline, setBusy, refresh }: {
  busy: boolean; offline: boolean; setBusy: (busy: boolean) => void; refresh: () => Promise<void>;
}) {
  const [backup, setBackup] = useState<BackupManifest | null>(null);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; controller.current?.abort(); setBusy(false); };
  }, [setBusy]);
  useEffect(() => {
    if (!working) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [working]);
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    controller.current = new AbortController();
    setWorking(true); setBusy(true); setError(""); setMessage("");
    try { await action(controller.current.signal); }
    catch (error) { if (active.current) setError(error instanceof TypeError ? "Falha de conexão. Tente novamente com o mesmo arquivo para continuar." : error instanceof Error && error.name !== "AbortError" ? error.message : "Operação interrompida. Selecione o mesmo arquivo para continuar."); }
    finally { if (active.current) { setWorking(false); setBusy(false); setProgress(""); } }
  }
  const counts = backup ? backupCounts(backup) : null;
  const countLabel = (count: number, singular: string, plural = singular + "s") => `${count} ${count === 1 ? singular : plural}`;
  return <section className="panel backup-panel">
    <h1>Backup e restauração</h1>
    <p>Guarde sua biblioteca em um arquivo com livros, resumos, histórico de versões, capas e fotos. Os itens da lixeira também são incluídos.</p>
    <p>Capas enviadas como imagem são incluídas no arquivo. Capas da Open Library mantêm a referência para carregamento pela internet.</p>
    <p>Salve seus rascunhos antes de baixar. O backup não inclui a conta, senha ou textos ainda não salvos. O arquivo contém suas anotações e fotos; guarde-o em um local privado.</p>
    <p>Limites desta versão: arquivo de até 100 MB, texto de até 2 MB e até 5.000 registros de cada tipo. As imagens são verificadas e otimizadas ao restaurar.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {message && <p role="status" className="notice">{message}</p>}
    {progress && <p role="status">{progress}</p>}
    <button disabled={busy || offline} onClick={() => run(async signal => {
      setProgress("Preparando a biblioteca…");
      const file = await exportBackup(signal, setProgress);
      if (!active.current) return;
      const url = URL.createObjectURL(file), link = document.createElement("a");
      link.href = url; link.download = `entrelinhas-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage("Arquivo preparado para download. Confira se ele foi salvo no seu dispositivo.");
    })}>Baixar backup com fotos</button>
    <h2>Restaurar um backup</h2>
    <p>A restauração acrescenta cópias à conta atual, preservando os registros existentes e a lixeira. Importar novamente o mesmo arquivo não duplica os registros. Você pode usar o backup para trazer sua biblioteca local para a conta online.</p>
    <label>Arquivo de backup (.json)
      <input type="file" accept="application/json,.json" disabled={busy || offline} onChange={event => {
        const file = event.target.files?.[0];
        setBackup(null);
        if (file) void run(async () => {
          setProgress("Lendo e conferindo o backup…");
          const parsed = await readBackup(file, setProgress);
          if (active.current) { setBackup(parsed); setMessage("Arquivo conferido. Revise o conteúdo antes de restaurar."); }
        });
      }} />
    </label>
    {backup && counts && <div>
      <h3>Conteúdo do backup</h3>
      <p>Criado em {new Date(backup.createdAt).toLocaleString("pt-BR")}: {countLabel(counts.books, "livro")}, {countLabel((backup.summaryVersions ?? []).length, "versão de resumo", "versões de resumo")} e {countLabel(counts.photos, "imagem", "imagens")} (fotos e capas).</p>
      <p>{[...backup.books, ...backup.ideas, ...backup.questions, ...backup.connections, ...backup.photos].filter(row => row.deleted_at !== null).length} itens estão na lixeira e continuarão nela.</p>
      <button disabled={busy || offline} onClick={() => run(async signal => {
        const result = await restoreBackup(backup, signal, setProgress);
        if (!active.current) return;
        setMessage(result.alreadyImported ? "Este backup já foi restaurado nesta conta. Nenhuma cópia adicional foi criada." : "Biblioteca restaurada. Seus registros anteriores foram preservados.");
        try { await refresh(); } catch { setMessage("Restauração concluída. Recarregue a página para atualizar a biblioteca."); }
      })}>Restaurar na minha biblioteca</button>
    </div>}
    <p className="muted">Mantenha esta aba aberta durante a operação. Se a conexão falhar, tente novamente com o mesmo arquivo para continuar. Envios incompletos expiram após 24 horas e são limpos ao iniciar outra restauração.</p>
  </section>;
}
