export type SummaryDraft = { text: string; base: string };
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}
const prefix = (owner: string) => `entrelinhas:summary:${encodeURIComponent(owner)}:`;
export const draftKey = (owner: string, book: string) => prefix(owner) + encodeURIComponent(book);
export function readDraft(storage: DraftStorage, key: string): SummaryDraft | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return typeof value.text === "string" && value.text.length <= 100000 &&
      typeof value.base === "string" && value.base.length <= 100000
      ? { text: value.text, base: value.base } : null;
  } catch { return null; }
}
export function clearOwnerDrafts(storage: DraftStorage, owner: string) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(prefix(owner))) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
}
// A completed request must not erase a newer draft, including one reopened while saving.
export function acknowledgeDraft(storage: DraftStorage, key: string, saved: string) {
  const draft = readDraft(storage, key);
  if (!draft) return;
  if (draft.text === saved) storage.removeItem(key);
  else storage.setItem(key, JSON.stringify({ text: draft.text, base: saved }));
}
export function hasOwnerDrafts(storage: DraftStorage, owner: string) {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(prefix(owner)) && readDraft(storage, key)) return true;
  }
  return false;
}
