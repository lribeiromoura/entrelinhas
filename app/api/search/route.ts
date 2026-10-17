import { auth } from "../../../lib/auth";
export async function GET(req: Request) {
  if (!(await auth.api.getSession({ headers: req.headers })))
    return Response.json({ error: "Entre na sua conta" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length > 200)
    return Response.json(
      { error: "Digite título, autor ou ISBN." },
      { status: 400 },
    );
  try {
    const r = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=12&fields=key,title,author_name,cover_i`,
      {
        signal: AbortSignal.timeout(10000),
        headers: { "User-Agent": "EntrelinhasLocal/0.1" },
      },
    );
    if (!r.ok) throw Error();
    const d = await r.json();
    return Response.json(d.docs);
  } catch {
    return Response.json(
      {
        error:
          "A busca está indisponível. Tente novamente ou cadastre manualmente.",
      },
      { status: 503 },
    );
  }
}
