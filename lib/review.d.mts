export const intervals: number[];
export function schedule(
  stage: number,
  rating: string,
  now?: number,
): { stage: number; due: number };
