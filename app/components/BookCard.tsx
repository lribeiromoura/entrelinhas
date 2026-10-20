"use client";
import { useEffect, useRef, type ReactNode } from "react";
export default function BookCard({ title, onOpen, onOptions, children }: { title: string; onOpen: () => void; onOptions: () => void; children: ReactNode }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), held = useRef(false), start = useRef({ x: 0, y: 0 });
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => clear, []);
  return <div className="book-card-wrap">
    <button className="book-card" aria-label={`Abrir ${title}`} onPointerDown={event => {
      if (event.button !== 0) return;
      clear(); held.current = false; start.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => { held.current = true; onOptions(); }, 600);
    }} onPointerMove={event => { if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 10) clear(); }} onPointerUp={clear} onPointerCancel={clear} onPointerLeave={clear}
      onContextMenu={event => { event.preventDefault(); clear(); held.current = true; onOptions(); }}
      onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { clear(); held.current = false; } }}
      onClick={event => { if (held.current) { event.preventDefault(); held.current = false; } else onOpen(); }}>{children}</button>
    <button type="button" className="book-options subtle" aria-label={`Opções de ${title}`} onClick={onOptions}>···</button>
  </div>;
}
