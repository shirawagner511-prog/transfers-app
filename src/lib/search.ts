// Hebrew-friendly "smart" search.
//
// Every typed word (or part of a word) must be found somewhere in the item, in
// any order: "מתוקה" finds "שמנת מתוקה 42%", "שמנ חמו" finds "שמנת חמוצה".
// Matching is forgiving:
//   • quote styles and punctuation are ignored (ק"ג = ק״ג = קג)
//   • final letters equal regular ones (ם=מ, ן=נ, ץ=צ, ף=פ, ך=כ)
//   • spelling with or without ו/י is the same (קרואסון = קראסון)
//   • a common prefix letter is allowed (שמנת finds "בשמנת", "והשמנת")
//   • one typo per word of 4+ letters is tolerated (שמנט → שמנת)
// Results are ranked: name starts with the query → a word starts with what
// was typed → exact substring → looser matches.

const FINALS: Record<string, string> = { 'ם': 'מ', 'ן': 'נ', 'ץ': 'צ', 'ף': 'פ', 'ך': 'כ' };

export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‎‏‪-‮]/g, '')
    .replace(/[םןץףך]/g, c => FINALS[c])
    .replace(/["'״׳`]/g, '')
    .replace(/[^\p{L}\p{N}%.]+/gu, ' ')
    .trim();
}

// Drop the "soft" letters Hebrew spells inconsistently.
const skeleton = (w: string) => (w.length > 2 ? w.replace(/[וי]/g, '') : w);

interface Prepared { full: string; words: string[]; skel: string[] }

function prepare(text: string): Prepared {
  const full = normalizeSearch(text);
  const words = full.split(' ').filter(Boolean);
  return { full, words, skel: words.map(skeleton) };
}

// Is `a` within one edit (insert/delete/substitute) of some prefix of `b`?
function nearPrefix(a: string, b: string): boolean {
  for (const len of [a.length - 1, a.length, a.length + 1]) {
    if (len < 1 || len > b.length) continue;
    const p = b.slice(0, len);
    if (editDistanceAtMost1(a, p)) return true;
  }
  return false;
}

function editDistanceAtMost1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const PREFIXES = /^[והבלמשכ]{1,2}/;

// Score how well one typed word matches the item; lower is better, null = no match.
function wordScore(q: string, item: Prepared): number | null {
  if (item.words.some(w => w.startsWith(q))) return 0;
  if (item.words.some(w => w.replace(PREFIXES, '').startsWith(q))) return 1;
  if (item.full.includes(q)) return 2;
  const qs = skeleton(q);
  if (qs.length >= 2 && item.skel.some(w => w.includes(qs))) return 3;
  if (q.length >= 4 && item.words.some(w => nearPrefix(q, w) || nearPrefix(q, w.replace(PREFIXES, '')))) return 5;
  return null;
}

export function searchItems<T>(items: T[], query: string, getText: (item: T) => string, limit = 40): T[] {
  const q = normalizeSearch(query);
  if (!q) return items.slice(0, limit);
  const qWords = q.split(' ').filter(Boolean);
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const prepared = prepare(getText(item));
    let score = 0;
    for (const w of qWords) {
      const s = wordScore(w, prepared);
      if (s === null) { score = -1; break; }
      score += s;
    }
    if (score < 0) continue;
    // Bonus tiers: whole query at the very start / anywhere in the name.
    const tier = prepared.full.startsWith(q) ? 0 : prepared.full.includes(q) ? 1 : 2;
    scored.push({ item, score: tier * 1000 + score * 100 + Math.min(prepared.full.length, 99) });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map(s => s.item);
}
