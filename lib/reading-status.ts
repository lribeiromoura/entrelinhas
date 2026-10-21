export const readingStatuses = { want: "Quero ler", reading: "Lendo", completed: "Concluído", paused: "Pausado" } as const;
export type ReadingStatus = keyof typeof readingStatuses;
export function isReadingStatus(value: unknown): value is ReadingStatus {
  return typeof value === "string" && Object.hasOwn(readingStatuses, value);
}
