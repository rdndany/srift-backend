import { useSyncExternalStore } from 'react';

/**
 * The player's settings: sound, view, picture and mouse. They live here (and in localStorage), not in the game, so the pause screen can
 * show and change them whether or not a game is running; `game/main.ts` applies them to the audio, the camera, the mouse and the
 * world, and again whenever one changes.
 */
export interface Settings {
  /** Loudness, 0..1: everything, then the sounds of the world, the weather and the places, and the music. */
  master: number;
  effects: number;
  ambience: number;
  music: number;
  /** All sound off (the levels are kept). */
  muted: boolean;
  /** How fast the view turns with the mouse: 1 is the usual speed. */
  sensitivity: number;
  invertY: boolean;
  /** Field of view in degrees, while walking about. */
  fov: number;
  /** How many chunks around the player are drawn. */
  renderDistance: number;
  /** The sun's shadows. */
  shadows: boolean;
  /** The finishing of the picture (see postfx.ts: each has its key, F6 to F10). */
  ao: boolean;
  glow: boolean;
  grade: boolean;
  rays: boolean;
  menuBlur: boolean;
  /** Give back the expensive things by themselves when the frame rate stays low. */
  adaptive: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  master: 0.8,
  effects: 1,
  ambience: 1,
  music: 0.5,
  muted: false,
  sensitivity: 1,
  invertY: false,
  fov: 75,
  renderDistance: 8,
  shadows: true,
  ao: true,
  glow: true,
  grade: true,
  rays: true,
  menuBlur: true,
  adaptive: true,
};

/** What each number setting may be: [lowest, highest]. */
export const SETTING_RANGE = {
  master: [0, 1],
  effects: [0, 1],
  ambience: [0, 1],
  music: [0, 1],
  sensitivity: [0.25, 3],
  fov: [60, 110],
  renderDistance: [3, 16],
} as const;

const KEY = 'solrift-settings';

const clamp = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback);

const flag = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Make a usable set of settings out of whatever was stored (anything missing or wrong is the default). */
export function parseSettings(raw: unknown): Settings {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  const r = SETTING_RANGE;
  return {
    master: clamp(o.master, ...r.master, d.master),
    effects: clamp(o.effects, ...r.effects, d.effects),
    ambience: clamp(o.ambience, ...r.ambience, d.ambience),
    music: clamp(o.music, ...r.music, d.music),
    muted: o.muted === true,
    sensitivity: clamp(o.sensitivity, ...r.sensitivity, d.sensitivity),
    invertY: o.invertY === true,
    fov: Math.round(clamp(o.fov, ...r.fov, d.fov)),
    renderDistance: Math.round(clamp(o.renderDistance, ...r.renderDistance, d.renderDistance)),
    shadows: flag(o.shadows, d.shadows),
    ao: flag(o.ao, d.ao),
    glow: flag(o.glow, d.glow),
    grade: flag(o.grade, d.grade),
    rays: flag(o.rays, d.rays),
    menuBlur: flag(o.menuBlur, d.menuBlur),
    adaptive: flag(o.adaptive, d.adaptive),
  };
}

let current: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

export function getSettings(): Settings {
  if (current) return current;
  let raw: unknown = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    raw = null; // (no storage, or not ours)
  }
  // The picture's switches used to be kept apart (F6 to F10): what was chosen then stays chosen.
  try {
    const old = JSON.parse(localStorage.getItem('solrift.fx') ?? 'null');
    if (old && typeof old === 'object') raw = { ...old, ...(typeof raw === 'object' && raw !== null ? raw : {}) };
  } catch {
    /* (nothing to carry over) */
  }
  current = parseSettings(raw);
  return current;
}

export function setSettings(patch: Partial<Settings>): void {
  const next = parseSettings({ ...getSettings(), ...patch });
  if (JSON.stringify(next) === JSON.stringify(getSettings())) return;
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage may be blocked: the choice then lasts until the page is closed */
  }
  for (const fn of listeners) fn(next);
}

export function resetSettings(keys: readonly (keyof Settings)[]): void {
  const patch: Record<string, unknown> = {};
  for (const k of keys) patch[k] = DEFAULT_SETTINGS[k];
  setSettings(patch as Partial<Settings>);
}

/** Be told when a setting changes. Returns the way to stop. */
export function subscribeSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The settings, for a component: it draws again when one changes (the page is first drawn with the defaults, as the server has no storage). */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings as (cb: () => void) => () => void, getSettings, () => DEFAULT_SETTINGS);
}
