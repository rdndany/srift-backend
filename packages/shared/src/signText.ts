/**
 * What is written on a sign: four lines of at most fifteen letters, as in the original. The text is a thing a player typed, so every line
 * passes through `cleanSignLines` before it is kept or shown: nothing but plain, printable text gets through, and what is too long is cut.
 */

export const SIGN_LINES = 4;
export const SIGN_LINE_MAX = 15;

/** Everything that is not plain text: control characters, line breaks, tags and the invisible marks that reorder or hide letters. */
const UNSAFE = /[\u0000-\u001f\u007f-\u009f<>\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;

/** One line of a sign: plain text, no longer than the board takes. */
export function cleanSignLine(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return [...raw.replace(UNSAFE, '').replace(/\s+/g, ' ').trim()].slice(0, SIGN_LINE_MAX).join('').trimEnd();
}

/** The four lines of a sign, cleaned: null when what was sent is not four lines at all. */
export function cleanSignLines(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length > SIGN_LINES) return null;
  const out: string[] = [];
  for (let i = 0; i < SIGN_LINES; i++) out.push(cleanSignLine(raw[i] ?? ''));
  return out;
}

/** Is there nothing written? */
export const isBlankSign = (lines: readonly string[]): boolean => lines.every((l) => l.trim() === '');

/** A name that has to fit on one line of a sign: cut at the board's width, with a dot where it was cut. */
export function fitSignLine(text: string): string {
  const s = cleanSignLine(text);
  const chars = [...String(text).replace(UNSAFE, '').replace(/\s+/g, ' ').trim()];
  return chars.length <= SIGN_LINE_MAX ? s.trim() : `${chars.slice(0, SIGN_LINE_MAX - 1).join('').trimEnd()}.`;
}
