// Hebrew-friendly search: ignores quote styles (ק"ג / ק״ג / קג), punctuation and
// extra spaces; every typed word must appear somewhere in the text.
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/["'״׳`]/g, '')
    .replace(/[^\p{L}\p{N}%.]+/gu, ' ')
    .trim();
}

export function searchItems<T>(items: T[], query: string, getText: (item: T) => string, limit = 40): T[] {
  const q = normalizeSearch(query);
  if (!q) return items.slice(0, limit);
  const words = q.split(' ');
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const text = normalizeSearch(getText(item));
    if (!words.every(w => text.includes(w))) continue;
    // Prefer names that start with the query, then shorter names.
    const score = (text.startsWith(q) ? 0 : text.includes(q) ? 1000 : 2000) + text.length;
    scored.push({ item, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map(s => s.item);
}
