export type MapPoint = { x: number; y: number };
export type MapIdea = { id: string; book: string; title: string; description: string; map_x?: number | null; map_y?: number | null };
export const nodeWidth = 240, nodeHeight = 110;
export const minZoom = 0.0001, maxZoom = 2.5;
export function validPosition(x: unknown, y: unknown): x is number {
  return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 100000 && Math.abs(y) <= 100000;
}
export function gridPositions(ideas: MapIdea[]): Record<string, MapPoint> {
  const sorted = [...ideas].sort((a, b) => a.book.localeCompare(b.book) || a.title.localeCompare(b.title, "pt-BR") || a.id.localeCompare(b.id));
  const columns = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
  return Object.fromEntries(sorted.map((idea, index) => [idea.id, { x: 30 + (index % columns) * 290, y: 30 + Math.floor(index / columns) * 160 }]));
}
export function initialPositions(ideas: MapIdea[]): Record<string, MapPoint> {
  const defaults = gridPositions(ideas);
  return Object.fromEntries(ideas.map(idea => [idea.id, validPosition(idea.map_x, idea.map_y) ? { x: idea.map_x!, y: idea.map_y! } : defaults[idea.id]]));
}
export function fitMap(points: MapPoint[], width: number, height: number) {
  if (!points.length) return { zoom: 1, x: 0, y: 0 };
  const left = Math.min(...points.map(point => point.x)), top = Math.min(...points.map(point => point.y));
  const right = Math.max(...points.map(point => point.x + nodeWidth)), bottom = Math.max(...points.map(point => point.y + nodeHeight));
  const zoom = Math.max(minZoom, Math.min(1, (width - 50) / (right - left), (height - 50) / (bottom - top)));
  return { zoom, x: (width - (right - left) * zoom) / 2 - left * zoom, y: (height - (bottom - top) * zoom) / 2 - top * zoom };
}
export function zoomMap(view: { zoom: number; x: number; y: number }, factor: number, anchor: MapPoint) {
  const zoom = Math.max(minZoom, Math.min(maxZoom, view.zoom * factor));
  return { zoom, x: anchor.x - (anchor.x - view.x) * zoom / view.zoom, y: anchor.y - (anchor.y - view.y) * zoom / view.zoom };
}
export function screenToMap(point: MapPoint, view: { zoom: number; x: number; y: number }): MapPoint {
  return { x: (point.x - view.x) / view.zoom, y: (point.y - view.y) / view.zoom };
}
