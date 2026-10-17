export const intervals = [1, 3, 7, 14, 30];
export function schedule(stage, rating, now = Date.now()) {
  if (!["forgot", "hard", "good"].includes(rating))
    throw new Error("Avaliação inválida");
  const next =
    rating === "forgot"
      ? 0
      : rating === "good"
        ? Math.min(stage + 1, 4)
        : stage;
  return { stage: next, due: now + intervals[next] * 86400000 };
}
