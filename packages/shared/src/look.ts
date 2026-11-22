/**
 * What a player looks like, as a handful of choices from fixed lists (skin tone, hair colour and style, eyes,
 * shirt and trousers). The choices fit in one small integer (`lookCode`), which is what is stored with an
 * account and sent over the wire: the server never has to trust colours or art made up by a client, and
 * every client paints the same person. Custom skins can come later as a separate field.
 */

export const SKIN_TONES = ['#f6d9bd', '#f1c9a5', '#e0a979', '#d9a273', '#c68a5c', '#a56b43', '#7c4a2c', '#5a3420'] as const;
export const HAIR_COLORS = ['#1c1c22', '#3a2a1e', '#4a3020', '#7a4b26', '#b0782f', '#d6b45a', '#e8d9a0', '#8c3a22', '#9a9aa4', '#d8d8e0', '#3a6ab0', '#b04a8a'] as const;
export const EYE_COLORS = ['#3b6aa8', '#4a8a4a', '#6a4a2a', '#2f2f3a', '#6a7a8a', '#8a5aa8'] as const;
export const SHIRT_COLORS = ['#c8553d', '#d9822b', '#d6b13a', '#4f8f3a', '#2f8f8a', '#3b6aa8', '#2c3e7a', '#7a4fa8', '#c45a8f', '#e6e6e6', '#6b6f78', '#2a2a30'] as const;
export const PANTS_COLORS = ['#36425e', '#2b2b33', '#4a3a2a', '#5a5f6a', '#3a5a3a', '#6a2f2f', '#7a6a4a', '#2f4a6a'] as const;
export const HAIR_STYLE_NAMES = ['Short', 'Messy', 'Long'] as const;

/** One pick from each list, as indexes. */
export interface CharacterLook {
  skin: number;
  hair: number;
  style: number;
  eyes: number;
  shirt: number;
  pants: number;
}

export type LookPart = keyof CharacterLook;

/** How many choices each part has, in the order the code is built. */
export const LOOK_SIZES: Record<LookPart, number> = {
  skin: SKIN_TONES.length,
  hair: HAIR_COLORS.length,
  style: HAIR_STYLE_NAMES.length,
  eyes: EYE_COLORS.length,
  shirt: SHIRT_COLORS.length,
  pants: PANTS_COLORS.length,
};

const ORDER: LookPart[] = ['skin', 'hair', 'style', 'eyes', 'shirt', 'pants'];

/** Every possible look has a code below this. */
export const LOOK_COUNT = ORDER.reduce((n, k) => n * LOOK_SIZES[k], 1);

/** The look of someone who has not chosen yet: an orange hoodie and slate trousers. */
export const DEFAULT_LOOK: Readonly<CharacterLook> = { skin: 3, hair: 1, style: 0, eyes: 0, shirt: 0, pants: 0 };

export function lookCode(look: CharacterLook): number {
  let code = 0;
  for (const k of ORDER) code = code * LOOK_SIZES[k] + clampIndex(look[k], LOOK_SIZES[k]);
  return code;
}

/** The look for a code, or null when the code is not one (fractions, negatives, out of range). */
export function parseLookCode(code: unknown): CharacterLook | null {
  if (typeof code !== 'number' || !Number.isInteger(code) || code < 0 || code >= LOOK_COUNT) return null;
  const look = { ...DEFAULT_LOOK };
  let rest = code;
  for (let i = ORDER.length - 1; i >= 0; i--) {
    const k = ORDER[i];
    look[k] = rest % LOOK_SIZES[k];
    rest = Math.floor(rest / LOOK_SIZES[k]);
  }
  return look;
}

/**
 * Any code at all (a bad one gives the default look). A code with an outfit on it (see outfits.ts: `look + LOOK_COUNT * n`) is read as its
 * plain look; `parseLookCode` above stays strict, so it is still only a plain look that a client may send or an account may save.
 */
export const lookOfCode = (code: unknown): CharacterLook => parseLookCode(typeof code === 'number' && Number.isInteger(code) && code >= 0 ? code % LOOK_COUNT : code) ?? { ...DEFAULT_LOOK };

function clampIndex(v: unknown, size: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0;
  return Math.min(size - 1, Math.max(0, n));
}

/** A look with every part forced into its list. */
export function normalizeLook(look: Partial<CharacterLook>): CharacterLook {
  const out = { ...DEFAULT_LOOK };
  for (const k of ORDER) out[k] = clampIndex(look[k] ?? DEFAULT_LOOK[k], LOOK_SIZES[k]);
  return out;
}

/** A look chosen by a random function returning [0, 1). */
export function randomLook(rand: () => number = Math.random): CharacterLook {
  const out = { ...DEFAULT_LOOK };
  for (const k of ORDER) out[k] = Math.min(LOOK_SIZES[k] - 1, Math.floor(rand() * LOOK_SIZES[k]));
  return out;
}

const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** The same stranger every time: a look made from a name, for players who sent none (old clients, bots). */
export function lookFromName(name: string): CharacterLook {
  let h = hashString(name);
  const next = (): number => {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    return h / 4294967296;
  };
  return randomLook(next);
}

/** Same hair, skin and clothes? */
export const sameLook = (a: CharacterLook, b: CharacterLook): boolean => ORDER.every((k) => a[k] === b[k]);

// ---- names -----------------------------------------------------------------------------------------

export const MIN_NAME_LENGTH = 3;
export const MAX_PLAYER_NAME = 16;

/** Letters, digits, spaces and `_ . -`, trimmed, single spaces, capped. */
export function cleanPlayerName(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, MAX_PLAYER_NAME)
    .trim();
}

/** Why a name cannot be used, or null when it is fine. */
export function playerNameProblem(raw: string): string | null {
  if (/[^\p{L}\p{N} _.-]/u.test(raw)) return 'Names can use letters, digits, spaces and _ . - only.';
  const name = cleanPlayerName(raw);
  if (name.length < MIN_NAME_LENGTH) return `Pick a name with at least ${MIN_NAME_LENGTH} characters.`;
  if (!/[\p{L}\p{N}]{2}/u.test(name)) return 'A name needs letters or digits.';
  if (raw.trim().length > MAX_PLAYER_NAME) return `Names are at most ${MAX_PLAYER_NAME} characters.`;
  return null;
}
