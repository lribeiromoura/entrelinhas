import { summaryVersions } from "../../../lib/summary-server";
import { trashService } from "../../../lib/trash-server";
import { saveMapLayout } from "../../../lib/map-layout";
import { validPhotoSignature } from "../../../lib/photo-signature";
import { changeRecord } from "../../../lib/records";
import { auth } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { requireBook, readLibrary } from "../../../lib/library";
import {
  uploadPrivate,
  removePrivate,
  maxPhotoBytes,
} from "../../../lib/storage";
import { schedule } from "../../../lib/review.mjs";
import { normalizePhoto } from "../../../lib/normalize-photo";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s)
    return Response.json({ error: "Entre na sua conta." }, { status: 401 });
  try {
    await trashService.expire(s.user.id);
    return Response.json(await readLibrary(s.user.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Não foi possível carregar sua biblioteca. Tente novamente." },
      { status: 503 },
    );
  }
}
export async function POST(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s)
    return Response.json({ error: "Entre na sua conta." }, { status: 401 });
  if (req.headers.get("origin") !== new URL(req.url).origin)
    return Response.json({ error: "Origem inválida." }, { status: 403 });
  const owner = s.user.id;
  try {
    await trashService.expire(owner);
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("photo");
      const book = String(form.get("book"));
      await requireBook(book, owner);
      if (
        !(file instanceof File) ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > maxPhotoBytes
      )
        throw Error("Envie JPEG, PNG ou WebP de até 3 MB após otimização.");
      const bytes = Buffer.from(await file.arrayBuffer());
      if (!validPhotoSignature(file.type, bytes)) throw Error("Imagem inválida.");
      const optimized = await normalizePhoto(bytes);
      const id = crypto.randomUUID();
      const kind = form.get("kind") === "cover" ? "cover" : "note";
      const path = await uploadPrivate(
        owner,
        id,
        optimized.mime,
        optimized.bytes,
      );
      try {
        await db.transaction(async (tx) => {
          await requireBook(book, owner, tx);
          await tx.run(
            "INSERT INTO photos(id,owner,book,mime,bytes,kind,storage_path) VALUES(?,?,?,?,?,?,?)",
            id,
            owner,
            book,
            optimized.mime,
            path ? null : optimized.bytes,
            kind,
            path,
          );
          if (kind === "cover")
            await tx.run(
              "UPDATE books SET cover_photo=? WHERE id=? AND owner=?",
              id,
              book,
              owner,
            );
        });
      } catch (e) {
        if (path) await removePrivate(path);
        throw e;
      }
    } else {
      const b = await req.json();
      const str = (key: string, max = 20000) => {
        if (typeof b[key] !== "string" || !b[key].trim() || b[key].length > max)
          throw Error("Preencha os campos corretamente.");
        return b[key].trim();
      };
      if (b.action === "purge") await trashService.purge(owner, b.kind, b.id);
      else if (b.action === "mapPositions") await saveMapLayout(db, owner, b.positions);
      else if (["edit", "trash", "restore"].includes(b.action))
        await changeRecord(db, owner, b);
      else if (b.action === "book")
        await db.run(
          "INSERT INTO books(id,owner,title,author,summary,cover_id) VALUES(?,?,?,?,?,?)",
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
        await requireBook(b.book, owner);
        const row = await db.get<{ title: string; author: string }>(
          "SELECT title,author FROM books WHERE id=? AND owner=?",
          b.book,
          owner,
        );
        const url = new URL("https://openlibrary.org/search.json");
        url.searchParams.set(
          "title",
          row!.title.replace(/[\u0000-\u001f\u007f-\u009f]/g, ""),
        );
        url.searchParams.set("author", row!.author.split(",")[0].trim());
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
        await requireBook(b.book, owner);
        await db.run(
          "UPDATE books SET cover_id=?,cover_photo=NULL WHERE id=? AND owner=?",
          id,
          b.book,
          owner,
        );
      } else if (b.action === "summary" || b.action === "restoreSummary") {
        await summaryVersions.save(owner, b.book, b.summary, b.action === "restoreSummary" ? b.version : undefined);
      } else if (b.action === "idea") {
        await requireBook(b.book, owner);
        await db.run(
          "INSERT INTO ideas(id,owner,book,title,description) VALUES(?,?,?,?,?)",
          crypto.randomUUID(),
          owner,
          b.book,
          str("title", 500),
          str("description"),
        );
      } else if (b.action === "connection") {
        if (b.source === b.target)
          throw Error("Escolha duas ideias diferentes.");
        for (const id of [b.source, b.target]) {
          if (
            typeof id !== "string" ||
            !(await db.get(
              "SELECT i.id FROM ideas i JOIN books b ON b.id=i.book AND b.owner=i.owner WHERE i.id=? AND i.owner=? AND i.deleted_at IS NULL AND b.deleted_at IS NULL",
              id,
              owner,
            ))
          )
            throw Error("Ideia não encontrada.");
        }
        const [a, c] = [b.source, b.target].sort();
        const existing = await db.get<{ id: string; deleted_at: number | null }>(
          "SELECT id,deleted_at FROM connections WHERE owner=? AND source=? AND target=?", owner, a, c);
        if (existing) {
          if (existing.deleted_at === null) throw Error("Esta conexão já existe.");
          await changeRecord(db, owner, { action: "restore", kind: "connection", id: existing.id });
        } else await db.run(
          "INSERT INTO connections(id,owner,source,target) VALUES(?,?,?,?)",
          crypto.randomUUID(),
          owner,
          a,
          c,
        );
      } else if (b.action === "question") {
        await requireBook(b.book, owner);
        await db.run(
          "INSERT INTO questions(id,owner,book,prompt,answer,stage,due) VALUES(?,?,?,?,?,?,?)",
          crypto.randomUUID(),
          owner,
          b.book,
          str("prompt"),
          str("answer"),
          0,
          Date.now() + 86400000,
        );
      } else if (b.action === "review") {
        const q = await db.get<{ stage: number }>(
          "SELECT q.stage FROM questions q JOIN books b ON b.id=q.book AND b.owner=q.owner WHERE q.id=? AND q.owner=? AND q.deleted_at IS NULL AND b.deleted_at IS NULL",
          b.id,
          owner,
        );
        if (!q) throw Error("Pergunta não encontrada.");
        const next = schedule(q.stage, b.rating);
        await db.run(
          "UPDATE questions SET stage=?,due=? WHERE id=? AND owner=?",
          next.stage,
          next.due,
          b.id,
          owner,
        );
      } else throw Error("Operação inválida.");
    }
    return Response.json({ ok: true });
  } catch (e) {
    const code = (e as { code?: string }).code;
    return Response.json(
      {
        error: ["SQLITE_CONSTRAINT_UNIQUE", "23505"].includes(code || "")
          ? "Esta conexão já existe."
          : code
            ? "Não foi possível salvar. Tente novamente."
            : e instanceof Error && !(e instanceof SyntaxError)
              ? e.message
              : "Não foi possível salvar. Seus campos foram preservados.",
      },
      { status: 400 },
    );
  }
}
