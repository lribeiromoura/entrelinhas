import { auth } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { schedule } from "../../../lib/review.mjs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s)
    return Response.json({ error: "Entre na sua conta." }, { status: 401 });
  const owner = s.user.id;
  return Response.json(
    {
      books: db.prepare("SELECT * FROM books WHERE owner=?").all(owner),
      ideas: db.prepare("SELECT * FROM ideas WHERE owner=?").all(owner),
      connections: db
        .prepare("SELECT * FROM connections WHERE owner=?")
        .all(owner),
      questions: db.prepare("SELECT * FROM questions WHERE owner=?").all(owner),
      photos: db
        .prepare("SELECT id,book FROM photos WHERE owner=? AND kind='note'")
        .all(owner),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s)
    return Response.json({ error: "Entre na sua conta." }, { status: 401 });
  if (req.headers.get("origin") !== new URL(req.url).origin)
    return Response.json({ error: "Origem inválida" }, { status: 403 });
  const owner = s.user.id;
  try {
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("photo");
      const book = String(form.get("book"));
      if (
        !db
          .prepare("SELECT id FROM books WHERE id=? AND owner=?")
          .get(book, owner)
      )
        throw Error("Livro não encontrado");
      if (
        !(file instanceof File) ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 8 * 1024 * 1024
      )
        throw Error("Escolha JPEG, PNG ou WebP de até 8 MB.");
      const bytes = Buffer.from(await file.arrayBuffer());
      const valid =
        file.type === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216
          : file.type === "image/png"
            ? bytes
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : bytes.toString("ascii", 0, 4) === "RIFF" &&
              bytes.toString("ascii", 8, 12) === "WEBP";
      if (!valid) throw Error("Imagem inválida");
      const id = crypto.randomUUID();
      const kind = form.get("kind") === "cover" ? "cover" : "note";
      db.transaction(() => {
        db.prepare(
          "INSERT INTO photos(id,owner,book,mime,bytes,kind) VALUES(?,?,?,?,?,?)",
        ).run(id, owner, book, file.type, bytes, kind);
        if (kind === "cover")
          db.prepare(
            "UPDATE books SET cover_photo=? WHERE id=? AND owner=?",
          ).run(id, book, owner);
      })();
    } else {
      const b = await req.json();
      const str = (key: string, max = 20000) => {
        if (typeof b[key] !== "string" || !b[key].trim() || b[key].length > max)
          throw Error("Preencha os campos corretamente.");
        return b[key].trim();
      };
      const book = () => {
        if (
          !db
            .prepare("SELECT id FROM books WHERE id=? AND owner=?")
            .get(b.book, owner)
        )
          throw Error("Livro não encontrado");
      };
      if (b.action === "book")
        db.prepare(
          "INSERT INTO books(id,owner,title,author,summary,cover_id) VALUES(?,?,?,?,?,?)",
        ).run(
          crypto.randomUUID(),
          owner,
          str("title", 500),
          str("author", 500),
          "",
          Number.isSafeInteger(b.cover_id) && b.cover_id > 0
            ? b.cover_id
            : null,
        );
      else if (b.action === "findCover") {
        book();
        const row = db
          .prepare("SELECT title,author FROM books WHERE id=? AND owner=?")
          .get(b.book, owner) as { title: string; author: string };
        const url = new URL("https://openlibrary.org/search.json");
        url.searchParams.set("title", row.title.replace(/[\u0000-\u001f\u007f-\u009f]/g, ""));
        url.searchParams.set("author", row.author.split(",")[0].trim());
        url.searchParams.set("fields", "cover_i");
        url.searchParams.set("limit", "5");
        let id: number | undefined;
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!r.ok) throw Error();
          const result = await r.json();
          id = result.docs?.find(
            (d: { cover_i?: number }) =>
              Number.isSafeInteger(d.cover_i) && Number(d.cover_i) > 0,
          )?.cover_i;
        } catch {
          throw Error(
            "Não foi possível buscar a capa. Tente novamente ou envie uma imagem.",
          );
        }
        if (!id)
          throw Error("Nenhuma capa encontrada. Você pode enviar uma imagem.");
        db.prepare(
          "UPDATE books SET cover_id=?,cover_photo=NULL WHERE id=? AND owner=?",
        ).run(id, b.book, owner);
      } else if (b.action === "summary") {
        book();
        if (typeof b.summary !== "string" || b.summary.length > 100000)
          throw Error("Resumo muito longo");
        db.prepare("UPDATE books SET summary=? WHERE id=? AND owner=?").run(
          b.summary,
          b.book,
          owner,
        );
      } else if (b.action === "idea") {
        book();
        db.prepare("INSERT INTO ideas VALUES(?,?,?,?,?)").run(
          crypto.randomUUID(),
          owner,
          b.book,
          str("title", 500),
          str("description"),
        );
      } else if (b.action === "connection") {
        if (b.source === b.target)
          throw Error("Escolha duas ideias diferentes");
        for (const id of [b.source, b.target])
          if (
            !db
              .prepare("SELECT id FROM ideas WHERE id=? AND owner=?")
              .get(id, owner)
          )
            throw Error("Ideia não encontrada");
        const [a, c] = [b.source, b.target].sort();
        db.prepare("INSERT INTO connections VALUES(?,?,?,?)").run(
          crypto.randomUUID(),
          owner,
          a,
          c,
        );
      } else if (b.action === "question") {
        book();
        db.prepare("INSERT INTO questions VALUES(?,?,?,?,?,?,?)").run(
          crypto.randomUUID(),
          owner,
          b.book,
          str("prompt"),
          str("answer"),
          0,
          Date.now() + 86400000,
        );
      } else if (b.action === "review") {
        const q = db
          .prepare("SELECT stage FROM questions WHERE id=? AND owner=?")
          .get(b.id, owner) as { stage: number } | undefined;
        if (!q) throw Error("Pergunta não encontrada");
        const next = schedule(q.stage, b.rating);
        db.prepare(
          "UPDATE questions SET stage=?,due=? WHERE id=? AND owner=?",
        ).run(next.stage, next.due, b.id, owner);
      } else throw Error("Operação inválida");
    }
    return Response.json({ ok: true });
  } catch (e) {
    const code = (e as { code?: string }).code;
    return Response.json(
      {
        error:
          code === "SQLITE_CONSTRAINT_UNIQUE"
            ? "Esta conexão já existe."
            : code
              ? "Não foi possível salvar. Tente novamente."
              : e instanceof Error
                ? e.message
                : "Não foi possível salvar.",
      },
      { status: 400 },
    );
  }
}
