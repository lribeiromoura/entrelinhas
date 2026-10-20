"use client";
import { useEffect, useRef, useState } from "react";
import { fitMap, gridPositions, initialPositions, nodeHeight, nodeWidth, screenToMap, validPosition, zoomMap, type MapIdea, type MapPoint } from "../../lib/idea-map";
type View = { zoom: number; x: number; y: number };
type Gesture = { pointer: number; start: MapPoint; view: View; id?: string; origin?: MapPoint };
export default function IdeaMap({ ideas, connections, books, busy, offline, save, onOpenBook, onUnsavedChange }: {
  ideas: MapIdea[]; connections: { id: string; source: string; target: string }[];
  books: { id: string; title: string }[]; busy: boolean; offline: boolean;
  save: (body: object) => Promise<boolean>; onOpenBook: (id: string) => void; onUnsavedChange: (unsaved: boolean) => void;
}) {
  const [positions, setPositions] = useState(() => initialPositions(ideas));
  const current = useRef(positions);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  const [size, setSize] = useState({ width: 900, height: 500 });
  const [selected, setSelected] = useState("");
  const [unsaved, setUnsaved] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(new Map<string, MapPoint>());
  const saving = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const initialized = useRef(false);
  const disabled = busy || offline;
  function moveView(next: View) { viewRef.current = next; setView(next); }
  function moveNodes(next: Record<string, MapPoint>) { current.current = next; setPositions(next); }
  useEffect(() => {
    const server = initialPositions(ideas);
    for (const [id, point] of pending.current) if (server[id]) server[id] = point;
    moveNodes(server);
    if (selected && !ideas.some(idea => idea.id === selected)) setSelected("");
  }, [ideas]);
  useEffect(() => {
    if (!svg.current) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (!width || !height) return;
      setSize({ width, height });
      if (!initialized.current) { moveView(fitMap(Object.values(current.current), width, height)); initialized.current = true; }
    });
    observer.observe(svg.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { onUnsavedChange(unsaved); return () => onUnsavedChange(false); }, [unsaved, onUnsavedChange]);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  function screen(event: { clientX: number; clientY: number }): MapPoint {
    const rect = svg.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * size.width / rect.width, y: (event.clientY - rect.top) * size.height / rect.height };
  }
  async function persist(changes: Record<string, MapPoint>) {
    for (const [id, point] of Object.entries(changes)) pending.current.set(id, point);
    setUnsaved(true);
    if (saving.current || disabled) { setMessage("As posições ainda não foram salvas. Tente novamente quando a conexão voltar."); return; }
    setMessage("Salvando posições…");
    saving.current = true;
    const snapshot = Array.from(pending.current, ([id, point]) => ({ id, ...point }));
    try {
      if (await save({ action: "mapPositions", positions: snapshot })) {
        for (const point of snapshot) {
          const latest = pending.current.get(point.id);
          if (latest?.x === point.x && latest?.y === point.y) pending.current.delete(point.id);
        }
        setUnsaved(pending.current.size > 0);
        setMessage("Posições salvas na biblioteca.");
      } else setMessage("As posições ainda não foram salvas. Mantenha esta tela aberta e tente novamente.");
    } finally { saving.current = false; }
  }
  function pointFor(id: string) { return positions[id] || { x: 0, y: 0 }; }
  const selectedIdea = ideas.find(idea => idea.id === selected);
  const neighbors = new Set(connections.flatMap(connection => connection.source === selected ? [connection.target] : connection.target === selected ? [connection.source] : []));
  return <section className="idea-map-panel" aria-label="Explorar mapa de ideias">
    <div className="map-toolbar" aria-label="Controles do mapa">
      <button className="subtle" aria-label="Diminuir zoom" onClick={() => moveView(zoomMap(viewRef.current, 1 / 1.25, { x: size.width / 2, y: size.height / 2 }))}>−</button>
      <output aria-label="Zoom atual">{view.zoom < 0.01 ? "<1" : Math.round(view.zoom * 100)}%</output>
      <button className="subtle" aria-label="Aumentar zoom" onClick={() => moveView(zoomMap(viewRef.current, 1.25, { x: size.width / 2, y: size.height / 2 }))}>+</button>
      <button className="subtle" onClick={() => moveView(fitMap(Object.values(current.current), size.width, size.height))}>Ver todas as ideias</button>
      <button className="subtle" disabled={disabled || saving.current} onClick={() => {
        const layout = gridPositions(ideas); moveNodes(layout); moveView(fitMap(Object.values(layout), size.width, size.height)); void persist(layout);
      }}>Organizar em grade</button>
      {unsaved && <button disabled={disabled} onClick={() => void persist(Object.fromEntries(pending.current))}>Tentar salvar posições</button>}
    </div>
    <p id="map-help">Arraste o fundo para navegar e as ideias para organizá-las. Use os botões para ajustar o zoom. Com uma ideia em foco, as setas movem o cartão; Shift + seta move mais. Enter mostra os detalhes.</p>
    {message && <p role="status" className={unsaved && !busy ? "error" : "notice"}>{message}</p>}
    {offline && <p role="status">Sem conexão: você pode explorar o mapa; reorganize quando a conexão voltar.</p>}
    <label>Encontrar uma ideia
      <select value={selected} onChange={event => {
        const id = event.target.value; setSelected(id);
        if (!id) moveView(fitMap(Object.values(current.current), size.width, size.height));
        else {
          const point = current.current[id];
          moveView({ zoom: 1, x: size.width / 2 - point.x - nodeWidth / 2, y: size.height / 2 - point.y - nodeHeight / 2 });
        }
      }}>
        <option value="">Todas as ideias</option>
        {ideas.map(idea => <option key={idea.id} value={idea.id}>{idea.title} · {books.find(book => book.id === idea.book)?.title}</option>)}
      </select>
    </label>
    <div className="interactive-map">
      <svg ref={svg} viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-label="Mapa interativo de ideias" aria-describedby="map-help"
        onPointerDown={event => {
          if (event.button !== 0 || gesture.current) return;
          const node = (event.target as Element).closest("[data-idea-id]");
          const id = node?.getAttribute("data-idea-id") || undefined;
          if (id) { setSelected(id); if (disabled || saving.current) return; }
          gesture.current = { pointer: event.pointerId, start: screen(event), view: viewRef.current, id, origin: id ? current.current[id] : undefined };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const drag = gesture.current;
          if (!drag || drag.pointer !== event.pointerId) return;
          const point = screen(event), dx = point.x - drag.start.x, dy = point.y - drag.start.y;
          if (drag.id && drag.origin) {
            const next = { x: Math.round(drag.origin.x + dx / drag.view.zoom), y: Math.round(drag.origin.y + dy / drag.view.zoom) };
            if (validPosition(next.x, next.y)) moveNodes({ ...current.current, [drag.id]: next });
          } else moveView({ ...drag.view, x: drag.view.x + dx, y: drag.view.y + dy });
        }}
        onPointerUp={event => {
          const drag = gesture.current;
          if (!drag || drag.pointer !== event.pointerId) return;
          gesture.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          if (drag.id && drag.origin) {
            const next = current.current[drag.id];
            if (next.x !== drag.origin.x || next.y !== drag.origin.y) void persist({ [drag.id]: next });
          }
        }}
        onPointerCancel={() => {
          const drag = gesture.current;
          if (drag?.id && drag.origin) moveNodes({ ...current.current, [drag.id]: drag.origin });
          gesture.current = null;
        }}>
        <g transform={`translate(${view.x},${view.y}) scale(${view.zoom})`}>
          {connections.map(connection => {
            const a = positions[connection.source], b = positions[connection.target];
            if (!a || !b) return null;
            const highlighted = connection.source === selected || connection.target === selected;
            return <line key={connection.id} x1={a.x + nodeWidth / 2} y1={a.y + nodeHeight / 2} x2={b.x + nodeWidth / 2} y2={b.y + nodeHeight / 2} stroke={highlighted ? "#244f43" : "#a4936b"} strokeWidth={highlighted ? 4 : 2} />;
          })}
          {ideas.map(idea => {
            const point = pointFor(idea.id), highlighted = idea.id === selected, connected = neighbors.has(idea.id);
            const title = idea.title.length > 62 ? idea.title.slice(0, 59) + "…" : idea.title;
            return <g key={idea.id} data-idea-id={idea.id} transform={`translate(${point.x},${point.y})`} role="button" tabIndex={0} aria-label={`Ideia: ${idea.title}`} aria-pressed={highlighted}
              className="map-idea" onFocus={() => setSelected(idea.id)} onClick={() => setSelected(idea.id)}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(idea.id); return; }
                const step = event.shiftKey ? 50 : 10;
                const delta: Record<string, MapPoint> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
                if (!delta[event.key]) return;
                event.preventDefault();
                if (disabled || saving.current || event.repeat) return;
                const previous = current.current[idea.id], next = { x: previous.x + delta[event.key].x, y: previous.y + delta[event.key].y };
                if (!validPosition(next.x, next.y)) return;
                moveNodes({ ...current.current, [idea.id]: next }); void persist({ [idea.id]: next });
              }}>
              <title>{idea.title} · {books.find(book => book.id === idea.book)?.title}</title>
              <rect width={nodeWidth} height={nodeHeight} rx={12} fill={highlighted ? "#244f43" : connected ? "#e1edda" : "#fffdf6"} stroke="#244f43" strokeWidth={highlighted ? 3 : 1} />
              <text x={16} y={28} fill={highlighted ? "#fffdf6" : "#244f43"} fontSize={14} fontWeight="bold" pointerEvents="none">
                <tspan x={16}>{title.slice(0, 31)}</tspan><tspan x={16} dy={21}>{title.slice(31)}</tspan>
              </text>
              <text x={16} y={88} fill={highlighted ? "#e1edda" : "#596a5f"} fontSize={12} pointerEvents="none">{(books.find(book => book.id === idea.book)?.title || "").slice(0, 31)}</text>
            </g>;
          })}
        </g>
      </svg>
    </div>
    <div className="map-pan-controls" aria-label="Navegar pelo mapa">
      {[["←", "Mover vista para a esquerda", 100, 0], ["↑", "Mover vista para cima", 0, 100], ["↓", "Mover vista para baixo", 0, -100], ["→", "Mover vista para a direita", -100, 0]].map(([label, name, x, y]) => <button key={name} className="subtle" aria-label={String(name)} onClick={() => moveView({ ...viewRef.current, x: viewRef.current.x + Number(x), y: viewRef.current.y + Number(y) })}>{label}</button>)}
    </div>
    {selectedIdea && <article className="panel map-details">
      <h2>{selectedIdea.title}</h2><p className="pre">{selectedIdea.description}</p>
      <p>{books.find(book => book.id === selectedIdea.book)?.title} · {neighbors.size} {neighbors.size === 1 ? "conexão" : "conexões"}</p>
      <button disabled={busy || unsaved} onClick={() => onOpenBook(selectedIdea.book)}>Abrir livro desta ideia</button>
      <button className="subtle" onClick={() => setSelected("")}>Limpar seleção</button>
    </article>}
  </section>;
}
