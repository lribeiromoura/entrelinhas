import type { DataStore } from "./db";
import { validPosition } from "./idea-map";
export async function saveMapLayout(db: DataStore, owner: string, input: unknown) {
  if (!Array.isArray(input) || !input.length || input.length > 5000) throw Error("Posições do mapa inválidas.");
  const seen = new Set<string>();
  const positions = input.map(row => {
    if (!row || typeof row.id !== "string" || row.id.length > 128 || seen.has(row.id) || !validPosition(row.x, row.y)) throw Error("Posições do mapa inválidas.");
    seen.add(row.id);
    return { id: row.id, x: Math.round(row.x), y: Math.round(row.y) };
  });
  await db.transaction(async tx => {
    const active = await tx.all<{ id: string }>("SELECT i.id FROM ideas i JOIN books b ON b.id=i.book AND b.owner=i.owner WHERE i.owner=? AND i.deleted_at IS NULL AND b.deleted_at IS NULL", owner);
    const allowed = new Set(active.map(row => row.id));
    if (positions.some(row => !allowed.has(row.id))) throw Error("Uma ideia do mapa não está disponível. Atualize a biblioteca.");
    for (let offset = 0; offset < positions.length; offset += 100) {
      const batch = positions.slice(offset, offset + 100), cases = batch.map(() => "WHEN ? THEN CAST(? AS INTEGER)").join(" ");
      await tx.run(`UPDATE ideas SET map_x=CASE id ${cases} END,map_y=CASE id ${cases} END WHERE owner=? AND id IN (${batch.map(() => "?").join(",")})`,
        ...batch.flatMap(row => [row.id, row.x]), ...batch.flatMap(row => [row.id, row.y]), owner, ...batch.map(row => row.id));
    }
  });
}
