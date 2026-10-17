"use client";
import { useEffect, useState } from "react";
import { createAuthClient } from "better-auth/react";
import Dictation from "./components/Dictation";
import { appendDictation } from "../lib/dictation";
const auth = createAuthClient();
type Book = {
  id: string;
  title: string;
  author: string;
  summary: string;
  cover_id?: number | null;
  cover_photo?: string | null;
};
type Idea = { id: string; book: string; title: string; description: string };
type Question = {
  id: string;
  book: string;
  prompt: string;
  answer: string;
  stage: number;
  due: number;
};
type Data = {
  books: Book[];
  ideas: Idea[];
  questions: Question[];
  connections: { id: string; source: string; target: string }[];
  photos: { id: string; book: string }[];
};
const empty: Data = {
  books: [],
  ideas: [],
  questions: [],
  connections: [],
  photos: [],
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
  const [view, setView] = useState("library");
  const [selected, setSelected] = useState("");
  const [summary, setSummary] = useState("");
  const [dictating, setDictating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [signup, setSignup] = useState(false);
  const [results, setResults] = useState<
    { key: string; title: string; author_name?: string[]; cover_i?: number }[]
  >([]);
  const [attempt, setAttempt] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [practice, setPractice] = useState(false);
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
  async function save(body: object | FormData) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
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
  const due = data.questions.filter((q) => q.due <= Date.now());
  const queue = practice ? data.questions : due;
  const q = queue[0];
  function open(b: Book) {
    setSelected(b.id);
    setSummary(b.summary);
    setView("book");
    setNotice("");
    setError("");
  }
  async function form(e: React.FormEvent<HTMLFormElement>, action: string) {
    e.preventDefault();
    const el = e.currentTarget;
    const fields = Object.fromEntries(new FormData(el));
    if (await save({ action, book: selected, ...fields })) el.reset();
  }
  return (
    <>
      <header>
        <a className="brand" href="/">
          ◈{" "}
          <span>
            entrelinhas<small>SUA BIBLIOTECA VIVA</small>
          </span>
        </a>
        {session && (
          <button
            className="subtle"
            onClick={async () => {
              await auth.signOut();
              setSelected("");
              setSummary("");
              setView("library");
            }}
          >
            Sair · {session.user.name}
          </button>
        )}
      </header>
      {offline && (
        <aside className="offline" role="status">
          Você está sem conexão. Reconecte para carregar e salvar. O texto
          aberto permanece nesta tela; não feche a página.
        </aside>
      )}
      <main>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
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
            <nav aria-label="Principal">
              {[
                ["library", "Biblioteca"],
                ["map", "Mapa de ideias"],
                ["review", `Revisões · ${due.length}`],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={view === id ? "active" : "subtle"}
                  onClick={() => {
                    setView(id);
                    setNotice("");
                    setError("");
                    setRevealed(false);
                    setAttempt("");
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
            {view === "library" && (
              <>
                <div className="heading">
                  <div>
                    <p className="eyebrow">SEU ACERVO PESSOAL</p>
                    <h1>Entre uma página e outra.</h1>
                    <p>Reúna suas leituras. Faça espaço para novas conexões.</p>
                  </div>
                  <span className="count">{data.books.length} livros</span>
                </div>
                <div className="columns">
                  <section>
                    <h2>Sua estante</h2>
                    {!data.books.length && (
                      <div className="empty">
                        Sua estante começa com uma leitura.
                        <p>Busque um livro ou adicione o seu ao lado.</p>
                      </div>
                    )}
                    <div className="shelf">
                      {data.books.map((b, i) => (
                        <button
                          className="book-card"
                          key={b.id}
                          onClick={() => open(b)}
                        >
                          <BookCover book={b} index={i} />
                          <strong>{b.title}</strong>
                          <small>{b.author}</small>
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="panel">
                    <h2>Adicionar uma leitura</h2>
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
                            onClick={() =>
                              save({
                                action: "book",
                                cover_id: r.cover_i,
                                title: r.title,
                                author:
                                  r.author_name?.join(", ") ||
                                  "Autor desconhecido",
                              })
                            }
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
                  </section>
                </div>
              </>
            )}
            {view === "book" && book && (
              <>
                <button className="subtle" onClick={() => setView("library")}>
                  ← Voltar à estante
                </button>
                <p className="eyebrow">CADERNO DE LEITURA</p>
                <h1>{book.title}</h1>
                <p>{book.author}</p>
                <div className="columns">
                  <section>
                    <div className="panel">
                      <h2>O que ficou da leitura</h2>
                      <label>
                        Resumo e transcrição
                        <textarea
                          rows={9}
                          value={summary}
                          onChange={(e) => setSummary(e.target.value)}
                          placeholder="Escreva com suas palavras ou cole uma transcrição…"
                        />
                      </label>
                      <Dictation
                        key={book.id}
                        disabled={busy || offline}
                        onText={(text) => {
                          setSummary((previous) =>
                            appendDictation(previous, text),
                          );
                          setNotice("");
                        }}
                        onActiveChange={setDictating}
                      />
                      <button
                        disabled={busy || dictating}
                        onClick={() =>
                          save({ action: "summary", book: selected, summary })
                        }
                      >
                        Salvar resumo
                      </button>
                    </div>
                    <div className="panel cover-editor">
                      <h2>Capa do livro</h2>
                      <BookCover book={book} />
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
                        <small>JPEG, PNG ou WebP · até 8 MB</small>
                        <button disabled={busy}>Salvar imagem da capa</button>
                      </form>
                    </div>
                    <div className="panel">
                      <h2>Fotos das anotações</h2>
                      <p>JPEG, PNG ou WebP · até 8 MB por foto</p>
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
                          Escolher na galeria
                          <input
                            type="file"
                            name="photo"
                            accept="image/jpeg,image/png,image/webp"
                            required
                          />
                        </label>
                        <button disabled={busy}>Enviar foto</button>
                      </form>
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
                          Fotografar com a câmera
                          <input
                            type="file"
                            name="photo"
                            accept="image/jpeg,image/png,image/webp"
                            capture="environment"
                            required
                          />
                        </label>
                        <button disabled={busy}>Enviar fotografia</button>
                      </form>
                      <div className="photos">
                        {data.photos
                          .filter((p) => p.book === selected)
                          .map((p) => (
                            <a
                              key={p.id}
                              href={"/api/photos/" + p.id}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <img
                                src={"/api/photos/" + p.id}
                                alt="Foto de anotação do livro"
                              />
                            </a>
                          ))}
                      </div>
                    </div>
                  </section>
                  <section>
                    <div className="panel">
                      <h2>Ideias que merecem ficar</h2>
                      {data.ideas
                        .filter((i) => i.book === selected)
                        .map((i) => (
                          <article key={i.id}>
                            <h3>{i.title}</h3>
                            <p className="pre">{i.description}</p>
                          </article>
                        ))}
                      <form onSubmit={(e) => form(e, "idea")}>
                        <label>
                          Título da ideia
                          <input name="title" required maxLength={500} />
                        </label>
                        <label>
                          Descrição
                          <textarea name="description" required rows={3} />
                        </label>
                        <button disabled={busy}>Guardar ideia</button>
                      </form>
                    </div>
                    <div className="panel">
                      <h2>Perguntas de revisão</h2>
                      <p>
                        {
                          data.questions.filter((q) => q.book === selected)
                            .length
                        }{" "}
                        perguntas · primeira revisão em 1 dia
                      </p>
                      <form onSubmit={(e) => form(e, "question")}>
                        <label>
                          Pergunta
                          <textarea name="prompt" required />
                        </label>
                        <label>
                          Resposta
                          <textarea name="answer" required />
                        </label>
                        <button disabled={busy}>Criar pergunta</button>
                      </form>
                    </div>
                  </section>
                </div>
              </>
            )}
            {view === "map" && (
              <>
                <p className="eyebrow">PENSAMENTOS EM CONVERSA</p>
                <h1>Uma ideia puxa outra.</h1>
                <p>
                  Conecte ideias de um mesmo livro ou de leituras diferentes.
                </p>
                <section className="panel">
                  <form
                    className="connect"
                    onSubmit={(e) => form(e, "connection")}
                  >
                    {["source", "target"].map((name, index) => (
                      <label key={name}>
                        {index ? "Conectar com" : "Ideia de origem"}
                        <select name={name} required defaultValue="">
                          <option value="" disabled>
                            Escolha uma ideia
                          </option>
                          {data.ideas.map((i) => (
                            <option value={i.id} key={i.id}>
                              {i.title} ·{" "}
                              {data.books.find((b) => b.id === i.book)?.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <button disabled={busy}>Conectar</button>
                  </form>
                </section>
                {!data.ideas.length ? (
                  <div className="empty">
                    Adicione ideias na página de um livro para começar seu mapa.
                  </div>
                ) : (
                  <>
                    <div className="map">
                      <svg
                        viewBox={`0 0 900 ${Math.max(400, Math.ceil(data.ideas.length / 3) * 160)}`}
                        role="img"
                        aria-label="Mapa visual de ideias conectadas"
                      >
                        {data.connections.map((c) => {
                          const a = data.ideas.findIndex(
                              (i) => i.id === c.source,
                            ),
                            b = data.ideas.findIndex((i) => i.id === c.target);
                          return (
                            <line
                              key={c.id}
                              x1={150 + (a % 3) * 300}
                              y1={70 + Math.floor(a / 3) * 160}
                              x2={150 + (b % 3) * 300}
                              y2={70 + Math.floor(b / 3) * 160}
                              stroke="#b3a174"
                              strokeWidth="3"
                            />
                          );
                        })}
                        {data.ideas.map((i, n) => (
                          <g
                            key={i.id}
                            transform={`translate(${20 + (n % 3) * 300},${20 + Math.floor(n / 3) * 160})`}
                          >
                            <rect
                              width="260"
                              height="100"
                              rx="12"
                              fill="#fffdf6"
                              stroke="#244f43"
                            />
                            <foreignObject
                              x="14"
                              y="12"
                              width="232"
                              height="78"
                            >
                              <div className="node">
                                <strong>{i.title}</strong>
                                <small>
                                  {
                                    data.books.find((b) => b.id === i.book)
                                      ?.title
                                  }
                                </small>
                              </div>
                            </foreignObject>
                          </g>
                        ))}
                      </svg>
                    </div>
                    <div className="panel">
                      <h2>Conexões</h2>
                      {data.connections.length ? (
                        data.connections.map((c) => (
                          <p key={c.id}>
                            {data.ideas.find((i) => i.id === c.source)?.title} ↔{" "}
                            {data.ideas.find((i) => i.id === c.target)?.title}
                          </p>
                        ))
                      ) : (
                        <p>
                          Escolha duas ideias acima para criar a primeira
                          conexão.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
            {view === "review" && (
              <>
                <p className="eyebrow">UM POUCO A CADA DIA</p>
                <h1>Reencontre o que aprendeu.</h1>
                <p>
                  {due.length} revisões disponíveis, incluindo as atrasadas.
                </p>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={practice}
                    onChange={(e) => {
                      setPractice(e.target.checked);
                      setAttempt("");
                      setRevealed(false);
                    }}
                  />{" "}
                  Incluir perguntas futuras para praticar (a avaliação reagenda)
                </label>
                {q ? (
                  <section className="panel review">
                    <small>
                      {data.books.find((b) => b.id === q.book)?.title} ·{" "}
                      {new Date(q.due).toLocaleDateString("pt-BR")}
                    </small>
                    <h2>{q.prompt}</h2>
                    <label>
                      Sua tentativa
                      <textarea
                        value={attempt}
                        onChange={(e) => setAttempt(e.target.value)}
                        placeholder="Tente lembrar antes de conferir…"
                        rows={4}
                      />
                    </label>
                    {!revealed ? (
                      <button
                        disabled={!attempt.trim()}
                        onClick={() => setRevealed(true)}
                      >
                        Conferir resposta
                      </button>
                    ) : (
                      <>
                        <div className="answer">
                          <small>RESPOSTA</small>
                          <p className="pre">{q.answer}</p>
                        </div>
                        <p>Como foi lembrar?</p>
                        <div className="ratings">
                          {[
                            ["forgot", "Não lembrei"],
                            ["hard", "Lembrei com dificuldade"],
                            ["good", "Lembrei bem"],
                          ].map(([rating, label]) => (
                            <button
                              key={rating}
                              disabled={busy}
                              onClick={async () => {
                                if (
                                  await save({
                                    action: "review",
                                    id: q.id,
                                    rating,
                                  })
                                ) {
                                  setAttempt("");
                                  setRevealed(false);
                                  setPractice(false);
                                }
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </section>
                ) : (
                  <div className="empty">
                    Tudo em dia.
                    <p>
                      Crie perguntas nos seus livros. Elas ficam disponíveis em
                      1 dia.
                    </p>
                  </div>
                )}
                <p className="muted">
                  Intervalos: 1, 3, 7, 14 e 30 dias. Boa recordação avança;
                  dificuldade mantém; esquecimento volta a 1 dia.
                </p>
              </>
            )}
          </>
        )}
      </main>
      <footer>entrelinhas · Seu espaço para cultivar conhecimento.</footer>
    </>
  );
}
