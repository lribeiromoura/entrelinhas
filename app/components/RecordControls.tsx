"use client";
import { useState } from "react";
type Field = { name: string; label: string; value: string; multiline?: boolean };
export default function RecordControls({ kind, id, title, fields = [], busy, save, onRemoved }: {
  kind: string; id: string; title: string; fields?: Field[]; busy: boolean;
  save: (body: object) => Promise<boolean>; onRemoved?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return <div className="record-controls">
    {!!fields.length && <button className="subtle" disabled={busy} onClick={() => setEditing(!editing)}>{editing ? "Cancelar edição" : "Editar"}</button>}
    <button className="subtle" disabled={busy} onClick={async () => {
      if (!window.confirm(`Mover “${title}” para a lixeira? ${kind === "book" ? "As anotações, fotos e revisões ficarão ocultas até restaurar o livro. Salve seu resumo antes de continuar." : "Você poderá restaurar depois."}`)) return;
      if (await save({ action: "trash", kind, id })) onRemoved?.();
    }}>Mover para lixeira</button>
    {editing && <form key={fields.map(field => field.value).join("\u0000")} onSubmit={async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      if (await save({ ...values, action: "edit", kind, id })) setEditing(false);
    }}>
      {fields.map(field => <label key={field.name}>{field.label}
        {field.multiline ? <textarea name={field.name} defaultValue={field.value} required maxLength={20000} />
          : <input name={field.name} defaultValue={field.value} required maxLength={500} />}
      </label>)}
      <button disabled={busy}>Salvar alterações</button>
    </form>}
  </div>;
}
