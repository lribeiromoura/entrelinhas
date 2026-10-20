"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
export default function Modal({ title, busy = false, onClose, children }: { title: string; busy?: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null), heading = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = overflow; requestAnimationFrame(() => { if (opener?.isConnected) opener.focus(); }); };
  }, []);
  return <dialog ref={ref} className="app-modal" aria-labelledby={heading} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose(); } }}>
    <div className="modal-heading"><h2 id={heading}>{title}</h2><button type="button" className="subtle" aria-label="Fechar janela" disabled={busy} onClick={onClose}>×</button></div>
    {children}
  </dialog>;
}
