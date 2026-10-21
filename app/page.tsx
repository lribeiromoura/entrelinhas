"use client";
import { useEffect, useRef, useState } from "react";
import { createAuthClient } from "better-auth/react";
import Modal from "./components/Modal";
import BookCard from "./components/BookCard";
import BackupPanel from "./components/BackupPanel";
import PdfExportPanel from "./components/PdfExportPanel";
import RecordControls from "./components/RecordControls";
import SummaryEditor from "./components/SummaryEditor";
import { readingStatuses, type ReadingStatus } from "../lib/reading-status";
import { clearOwnerDrafts, hasOwnerDrafts } from "../lib/summary-draft";
import { optimizePhoto } from "../lib/optimize-photo";
const auth = createAuthClient();
type Book = {
  id: string;
  title: string;
  author: string;
  summary: string;
  reading_status: ReadingStatus;
  cover_id?: number | null;
  cover_photo?: string | null;
};
type Data = {
  books: Book[];
  photos: { id: string; book: string }[];
  trash: { id: string; kind: string; title: string; deleted_at: number }[];
};
const empty: Data = {
  books: [],
  photos: [],
  trash: [],
};
function BookCover({ book, index = 0 }: { book: Book; index?: number }) {
  const src = book.cover_photo
    ? "/api/photos/" + book.cover_photo
    : book.cover_id
      ? `https://covers.openlibrary.org/b/id/${book.cover_id}-L.jpg?default=false`
      : "";
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div
      className={
        "cover c" + (index % 4) + (src && !failed ? " real-cover" : "")
      }
    >
      {src && !failed ? (
        <img
          src={src}
          alt={"Capa de " + book.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <span>◈</span>
          <strong>{book.title}</strong>
          <small>{book.author}</small>
        </>
      )}
    </div>
  );
}
export default function Home() {
  const { data: session, isPending } = auth.useSession();
  const [data, setData] = useState<Data>(empty);
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState("library");
  const [menuOpen, setMenuOpen] = useState(false);
  const [addBookOpen, setAddBookOpen] = useState(false);
  const [bookOptions, setBookOptions] = useState<Book | null>(null);
  const [bookDialog, setBookDialog] = useState<"edit" | "cover" | null>(null);
  const [purgeItem, setPurgeItem] = useState<Data["trash"][number] | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuPanel = useRef<HTMLElement>(null);
  const bookMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (bookMenu.current?.open && !bookMenu.current.contains(event.target as Node)) bookMenu.current.open = false; };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  useEffect(() => { if (!session) { setMenuOpen(false); setAddBookOpen(false); setBookOptions(null); setPurgeItem(null); setBookDialog(null); } }, [session]);
  const [selected, setSelected] = useState("");
  const [pdfBookId, setPdfBookId] = useState<string | null>(null);
  const [draftAtRisk, setDraftAtRisk] = useState(false);
  function navigate(next: string) {
    if (next === view) return true;
    if (draftAtRisk && !window.confirm("O rascunho não pôde ser guardado. Sair desta tela pode perder seu texto. Deseja sair mesmo assim?")) return false;
    setView(next);
    return true;
  }
  function closeMenu() {
    setMenuOpen(false);
    requestAnimationFrame(() => menuButton.current?.focus());
  }
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    menuPanel.current?.querySelector<HTMLButtonElement>("nav button")?.focus();
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeMenu(); };
    document.addEventListener("keydown", onEscape);
    return () => { document.removeEventListener("keydown", onEscape); document.body.style.overflow = previousOverflow; };
  }, [menuOpen]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [signup, setSignup] = useState(false);
  const [results, setResults] = useState<
    { key: string; title: string; author_name?: string[]; cover_i?: number }[]
  >([]);
  async function refresh() {
    const r = await fetch("/api/data");
    if (!r.ok) throw Error("Não foi possível carregar sua biblioteca.");
    setData(await r.json());
  }
  useEffect(() => {
    setOffline(!navigator.onLine);
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (session) refresh().catch((e) => setError(e.message));
    else setData(empty);
  }, [session]);
  useEffect(() => {
    const owner = session?.user.id;
    if (!owner) return;
    const warn = (event: BeforeUnloadEvent) => {
      try {
        if (hasOwnerDrafts(localStorage, owner)) {
          event.preventDefault();
          event.returnValue = "";
        }
      } catch {} // The active editor also warns if storage is unavailable.
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [session?.user.id]);
  useEffect(() => { if (!notice) return; const timeout = setTimeout(() => setNotice(""), 5000); return () => clearTimeout(timeout); }, [notice]);
  async function save(body: object | FormData) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (body instanceof FormData) {
        const original = body.get("photo");
        if (original instanceof File)
          body.set("photo", await optimizePhoto(original));
      }
      const r = await fetch("/api/data", {
        method: "POST",
        headers:
          body instanceof FormData
            ? undefined
            : { "Content-Type": "application/json" },
        body: body instanceof FormData ? body : JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      try {
        await refresh();
        setNotice("Salvo.");
      } catch {
        setNotice(
          "Salvo no servidor. Não foi possível atualizar a lista; recarregue quando a conexão voltar.",
        );
      }
      return true;
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Falha de conexão. Seus campos continuam preenchidos; tente salvar novamente."
          : e instanceof Error && !(e instanceof SyntaxError)
            ? e.message
            : "Não foi possível salvar. Seus campos continuam preenchidos.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const book = data.books.find((b) => b.id === selected);
  function open(b: Book) {
    setBookDialog(null);
    setSelected(b.id);
    setView("book");
    setNotice("");
    setError("");
  }
  async function form(e: React.FormEvent<HTMLFormElement>, action: string) {
    e.preventDefault();
    const el = e.currentTarget;
    const fields = Object.fromEntries(new FormData(el));
    if (await save({ action, book: selected, ...fields })) { el.reset(); if (action === "book") setAddBookOpen(false); }
  }
  return (
    <>
      <header>
        <div className="header-left">
          {session && <button ref={menuButton} type="button" className="menu-toggle subtle" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen} aria-controls={menuOpen ? "primary-navigation" : undefined} onClick={() => menuOpen ? closeMenu() : setMenuOpen(true)}>
            <span className="hamburger-icon" aria-hidden="true"><span /><span /><span /></span>
          </button>}
        </div>
        <a className="brand" href="/" onClick={event => { if (session) { event.preventDefault(); if (navigate("library")) setMenuOpen(false); } }}><span className="brand-mark" aria-hidden="true">◈</span><span>entrelinhas</span></a>
        {session && (
          <button
            className="subtle"
            disabled={busy}
            onClick={async () => {
              let pendingDraft = draftAtRisk;
              try { pendingDraft ||= hasOwnerDrafts(localStorage, session.user.id) || hasOwnerDrafts(sessionStorage, session.user.id); } catch { pendingDraft = true; }
              if (pendingDraft && !window.confirm("Sair da conta? Os rascunhos deste navegador serão apagados. Salve os resumos que deseja manter antes de sair.")) return;
              const result = await auth.signOut();
              if (result.error) { setError("Não foi possível sair. Tente novamente."); return; }
              try { clearOwnerDrafts(localStorage, session.user.id); clearOwnerDrafts(sessionStorage, session.user.id); } catch {}
              setMenuOpen(false);
              setSelected("");
              setView("library");
            }}
          >
            Sair
          </button>
        )}
      </header>
      {session && menuOpen && <>
        <div className="menu-backdrop" aria-hidden="true" onClick={closeMenu} />
        <aside ref={menuPanel} className="menu-drawer" role="dialog" aria-modal="true" aria-label="Menu principal" onKeyDown={event => {
          if (event.key !== "Tab") return;
          const items = menuPanel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
          if (!items?.length) return;
          if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
          else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
        }}>
          <div className="drawer-heading"><strong>Menu</strong><button type="button" className="subtle" aria-label="Fechar menu" onClick={closeMenu}>×</button></div>
          <nav id="primary-navigation" className="side-nav" aria-label="Principal">
            {[
              ["library", "Biblioteca"],
              ["pdf", "Exportar PDF"],
              ["backup", "Backup"],
              ["trash", `Lixeira · ${data.trash.length}`],
            ].map(([id, label]) => <button key={id} type="button" disabled={busy} aria-current={view === id ? "page" : undefined} className={view === id ? "active" : "subtle"} onClick={() => {
              if (!navigate(id)) return;
              if (id === "pdf") setPdfBookId(null);
              setNotice(""); setError("");
              closeMenu();
            }}>{label}</button>)}
          </nav>
        </aside>
      </>}
      {offline && (
        <aside className="offline" role="status">
          Você está sem conexão. Reconecte para carregar e salvar. Rascunhos de resumo ficam neste navegador até você salvar. Reconecte para carregar a biblioteca.
        </aside>
      )}
      <main>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && (
          <div role="status" className="notice floating-toast"><span>{notice}</span><button type="button" aria-label="Fechar aviso" onClick={() => setNotice("")}>×</button></div>
        )}
        {isPending ? (
          <p>Carregando…</p>
        ) : !session ? (
          <section className="welcome">
            <div>
              <p className="eyebrow">LEIA. CONECTE. RELEMBRE.</p>
              <h1>
                As melhores ideias
                <br />
                merecem ficar.
              </h1>
              <p className="lead">
                Um espaço só seu para transformar leituras em conhecimento que
                acompanha você.
              </p>
              <div className="quote">
                “Ler é só o começo da conversa.”
                <small>Guarde o que importa. Volte quando precisar.</small>
              </div>
            </div>
            <form
              className="panel login"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const f = new FormData(e.currentTarget);
                try {
                  const payload = {
                    email: String(f.get("email")),
                    password: String(f.get("password")),
                    name: String(f.get("name") || "Leitor"),
                  };
                  const r = signup
                    ? await auth.signUp.email(payload)
                    : await auth.signIn.email(payload);
                  if (r.error)
                    setError(
                      signup
                        ? "Não foi possível criar a conta. Confira os dados ou use outro e-mail."
                        : "E-mail ou senha inválidos. Confira os dados e tente novamente.",
                    );
                } catch {
                  setError("Não foi possível entrar. Tente novamente.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2>{signup ? "Comece sua biblioteca" : "Bem-vindo de volta"}</h2>
              <p>Seu próximo capítulo começa aqui.</p>
              {signup && (
                <label>
                  Seu nome
                  <input name="name" required autoComplete="name" />
                </label>
              )}
              <label>
                E-mail
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  name="password"
                  minLength={8}
                  required
                  autoComplete={signup ? "new-password" : "current-password"}
                />
              </label>
              <button disabled={busy}>
                {signup ? "Criar conta" : "Entrar"}
              </button>
              <button
                type="button"
                className="subtle"
                onClick={() => setSignup(!signup)}
              >
                {signup
                  ? "Já tenho uma conta"
                  : "Primeira visita? Crie sua conta"}
              </button>
              <small>Seus livros e anotações são privados.</small>
            </form>
          </section>
        ) : (
          <>
            {view === "library" && (
              <>
                <div className="shelf-heading">
                  <h1>Sua estante <small>{data.books.length} {data.books.length === 1 ? "livro" : "livros"}</small></h1>
                  <button type="button" disabled={busy} onClick={() => { setResults([]); setAddBookOpen(true); }}>Adicionar Livro</button>
                </div>
                <label className="reading-filter">Filtrar por status
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="all">Todos ({data.books.length})</option>
                    {Object.entries(readingStatuses).map(([value, label]) => <option key={value} value={value}>{label} ({data.books.filter(b => b.reading_status === value).length})</option>)}
                  </select>
                </label>
                <section>
                    {data.books.length > 0 && statusFilter !== "all" && !data.books.some(b => b.reading_status === statusFilter) && <p className="empty">Nenhum livro neste status.</p>}
                    {!data.books.length && (
                      <div className="empty">
                        Sua estante começa com uma leitura.
                        <p>Use “Adicionar Livro” para começar.</p>
                      </div>
                    )}
                    <div className="shelf">
                      {data.books.filter(b => statusFilter === "all" || b.reading_status === statusFilter).map((b, i) => (
                        <BookCard key={b.id} title={b.title} onOpen={() => open(b)} onOptions={() => setBookOptions(b)}>
                          <BookCover book={b} index={i} />
                          <strong>{b.title}</strong>
                          <small>{b.author}</small>
                          <span className="reading-badge">{readingStatuses[b.reading_status]}</span>
                        </BookCard>
                      ))}
                    </div>
                  </section>
                  {addBookOpen && <Modal title="Adicionar Livro" busy={busy} onClose={() => setAddBookOpen(false)}>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setBusy(true);
                        setError("");
                        try {
                          const term = new FormData(e.currentTarget).get(
                            "query",
                          );
                          const r = await fetch(
                            "/api/search?q=" + encodeURIComponent(String(term)),
                          );
                          const d = await r.json();
                          if (!r.ok) throw Error(d.error);
                          setResults(d);
                          if (!d.length)
                            setNotice(
                              "Nenhum livro encontrado. Você pode cadastrar manualmente.",
                            );
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : "Falha na busca",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <label>
                        Título, autor ou ISBN
                        <input
                          name="query"
                          required
                          placeholder="O que você está lendo?"
                        />
                      </label>
                      <button disabled={busy}>Buscar na Open Library</button>
                    </form>
                    <div className="results">
                      {results.map((r) => (
                        <div key={r.key}>
                          <strong>{r.title}</strong>
                          <small>{r.author_name?.join(", ")}</small>
                          <button
                            disabled={busy}
                            className="subtle"
                            onClick={async () => {
                              if (await save({
                                action: "book",
                                cover_id: r.cover_i,
                                title: r.title,
                                author:
                                  r.author_name?.join(", ") ||
                                  "Autor desconhecido",
                              })) setAddBookOpen(false);
                            }}
                          >
                            + Adicionar
                          </button>
                        </div>
                      ))}
                    </div>
                    <details>
                      <summary>Prefiro cadastrar manualmente</summary>
                      <form onSubmit={(e) => form(e, "book")}>
                        <label>
                          Título
                          <input name="title" required maxLength={500} />
                        </label>
                        <label>
                          Autor
                          <input name="author" required maxLength={500} />
                        </label>
                        <button disabled={busy}>Adicionar livro</button>
                      </form>
                    </details>
                    <small>
                      Busca gratuita, sem chave de API. Dados da Open Library.
                    </small>
                    {notice && <p role="status">{notice}</p>}
                    {error && <p role="alert" className="error">{error}</p>}
                  </Modal>}
              </>
            )}
            {view === "book" && book && (
              <>
                <button className="subtle" onClick={() => navigate("library")}>
                  ← Voltar à estante
                </button>
                <div className="book-heading">
                  <div><p className="eyebrow">CADERNO DE LEITURA</p><h1>{book.title}</h1><p>{book.author}</p></div>
                  <details ref={bookMenu} className="book-actions" onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary>Opções do livro</summary><div className="book-menu">
                    <button type="button" className="subtle" disabled={busy} onClick={() => { setPdfBookId(book.id); navigate("pdf"); }}>Exportar PDF</button>
                    <button type="button" className="subtle" disabled={busy} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); setBookDialog("edit"); }}>Editar livro</button>
                    <button type="button" className="subtle" disabled={busy} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); setBookDialog("cover"); }}>Capa do livro</button>
                    <button type="button" className="danger subtle" disabled={busy} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); setBookOptions(book); }}>Mover para lixeira</button>
                  </div></details>
                </div>
                <label className="reading-filter">Status de leitura
                  <select value={book.reading_status} disabled={busy || offline} onChange={e => save({ action: "readingStatus", book: book.id, status: e.target.value })}>
                    {Object.entries(readingStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                {bookDialog === "edit" && <Modal title="Editar livro" busy={busy} onClose={() => setBookDialog(null)}>
                  <form onSubmit={async event => { event.preventDefault(); const fields = Object.fromEntries(new FormData(event.currentTarget)); if (await save({ action: "edit", kind: "book", id: book.id, ...fields })) setBookDialog(null); }}>
                    <label>Título<input name="title" required maxLength={500} defaultValue={book.title} /></label>
                    <label>Autor<input name="author" required maxLength={500} defaultValue={book.author} /></label>
                    <button disabled={busy}>Salvar alterações</button>
                  </form>{error && <p role="alert" className="error">{error}</p>}
                </Modal>}
                {bookDialog === "cover" && <Modal title="Capa do livro" busy={busy} onClose={() => setBookDialog(null)}><div className="cover-editor">
                      <BookCover book={book} />
                      {book.cover_photo && <RecordControls kind="photo" id={book.cover_photo} title="Imagem da capa" busy={busy} save={save} />}
                      <p>
                        Busque uma capa ou envie sua própria imagem. A edição
                        encontrada pode ser diferente da sua.
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          save({ action: "findCover", book: selected })
                        }
                      >
                        Buscar capa na Open Library
                      </button>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const el = e.currentTarget;
                          const f = new FormData(el);
                          f.set("book", selected);
                          f.set("kind", "cover");
                          if (await save(f)) el.reset();
                        }}
                      >
                        <label>
                          Imagem da capa
                          <input
                            name="photo"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            required
                          />
                        </label>
                        <small>
                          JPEG, PNG ou WebP · até 8 MB; envio otimizado
                        </small>
                        <button disabled={busy}>Salvar imagem da capa</button>
                      </form>
                    </div>{error && <p role="alert" className="error">{error}</p>}</Modal>}
                <div className="book-content">
                  <section>
                    <SummaryEditor key={session.user.id + ":" + book.id}
                      owner={session.user.id} book={book.id} initial={book.summary}
                      busy={busy} offline={offline} onStorageRisk={setDraftAtRisk}
                      save={(summary) => save({ action: "summary", book: book.id, summary })}
                      restore={async version => { const restored = await save({ action: "restoreSummary", book: book.id, version }); if (restored) setNotice("Versão recuperada como resumo atual."); return restored; }} />
                    <div className="panel">
                      <h2>Fotos das anotações</h2>
                      <p>
                        JPEG, PNG ou WebP · até 8 MB; envio otimizado por foto
                      </p>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const el = e.currentTarget;
                          const f = new FormData(el);
                          f.set("book", selected);
                          if (await save(f)) el.reset();
                        }}
                      >
                        <label>
                          Escolher foto
                          <input
                            type="file"
                            name="photo"
                            accept="image/jpeg,image/png,image/webp"
                            required
                          />
                        </label>
                        <button disabled={busy}>Enviar foto</button>
                      </form>
                      <div className="photos">
                        {data.photos
                          .filter((p) => p.book === selected)
                          .map((p) => (
                            <div key={p.id}><a
                              href={"/api/photos/" + p.id}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <img
                                src={"/api/photos/" + p.id}
                                alt="Foto de anotação do livro"
                              />
                            </a><RecordControls kind="photo" id={p.id} title="Foto de anotação" busy={busy} save={save} /></div>
                          ))}
                      </div>
                    </div>
                  </section>
                </div>
              </>
            )}
            {view === "backup" && <BackupPanel busy={busy} offline={offline} setBusy={setBusy} refresh={refresh} />}
            {view === "pdf" && <PdfExportPanel key={pdfBookId ?? "library"} books={data.books} singleBookId={pdfBookId} onBack={pdfBookId ? () => navigate("book") : undefined} offline={offline} busy={busy} setBusy={setBusy} />}
            {view === "trash" && <section className="panel">
              <h1>Lixeira</h1>
              <p>Os itens são excluídos definitivamente após 30 dias. Restaurar um livro recupera seu conteúdo; itens removidos separadamente continuam na lixeira.</p>
              <p>Restaure o livro antes de restaurar suas fotos.</p>
              {!data.trash.length && <p>A lixeira está vazia.</p>}
              {[...data.trash].sort((a, b) => b.deleted_at - a.deleted_at).map(item => <article key={item.kind + item.id}>
                <h3>{item.title}</h3>
                <small>{{ book: "Livro", idea: "Ideia", question: "Pergunta", photo: "Foto", connection: "Conexão" }[item.kind] || item.kind} · {new Date(item.deleted_at).toLocaleDateString("pt-BR")}</small>
                <small>Exclusão automática em {new Date(item.deleted_at + 30 * 86400000).toLocaleDateString("pt-BR")}</small>
                <div className="record-controls"><button disabled={busy} onClick={() => save({ action: "restore", kind: item.kind, id: item.id })}>Restaurar</button>
                <button className="danger subtle" disabled={busy} onClick={() => setPurgeItem(item)}>Excluir para sempre</button></div>
              </article>)}
            </section>}
          </>
        )}
      </main>
      {bookOptions && <Modal title={bookOptions.title} busy={busy} onClose={() => setBookOptions(null)}>
        <p>Ao apagar este livro, ele e seu conteúdo vão para a lixeira por 30 dias.</p>
        <button type="button" className="danger" disabled={busy} onClick={async () => { if (await save({ action: "trash", kind: "book", id: bookOptions.id })) { if (selected === bookOptions.id) setView("library"); setBookOptions(null); setNotice("Livro movido para a lixeira."); } }}>Apagar livro</button>
        <button type="button" className="subtle" disabled={busy} onClick={() => setBookOptions(null)}>Cancelar</button>
        {error && <p role="alert" className="error">{error}</p>}
      </Modal>}
      {purgeItem && <Modal title="Excluir para sempre?" busy={busy} onClose={() => setPurgeItem(null)}>
        <p>“{purgeItem.title}” será excluído definitivamente.{purgeItem.kind === "book" ? " Todo o conteúdo deste livro, incluindo resumos, histórico de versões e fotos, também será removido." : purgeItem.kind === "idea" ? " As conexões desta ideia também serão removidas." : ""} Esta ação não pode ser desfeita.</p>
        <button type="button" className="danger" disabled={busy} onClick={async () => { if (await save({ action: "purge", kind: purgeItem.kind, id: purgeItem.id })) { setPurgeItem(null); setNotice("Item excluído definitivamente."); } }}>Excluir para sempre</button>
        <button type="button" className="subtle" disabled={busy} onClick={() => setPurgeItem(null)}>Cancelar</button>
        {error && <p role="alert" className="error">{error}</p>}
      </Modal>}
      <footer>entrelinhas · Seu espaço para cultivar conhecimento.</footer>
    </>
  );
}
