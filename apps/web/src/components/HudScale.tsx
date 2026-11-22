'use client';

import { useEffect, type RefObject } from 'react';

/**
 * The game's HUD is drawn in pixels for a screen about 1280 x 720. On a smaller one (a small laptop, a window, a tablet held sideways)
 * it would crowd the picture and the windows would reach over each other, so everything on it is scaled down to what fits (`zoom`, see
 * hud-scale.css): the frames in the corners, the hotbar, the bags and the chat by `--hud`, and each window of the inventory screen by
 * how much room it has (`useWindowFit`). A big screen keeps the HUD at its drawn size. Nothing here touches the 3D picture.
 */

/** The screen the HUD was drawn for. */
const DESIGN_W = 1280;
const DESIGN_H = 720;
/** Smaller than this the letters are too small to read, so the HUD stops shrinking (the rest scrolls or wraps). */
const HUD_MIN = 0.55;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** In steps of 5%: a scale that is not a round number blurs the pixel art. */
const step = (v: number): number => Math.round(v * 20) / 20;

/** How much of the HUD's own size the screen shows: 1 on a 1280 x 720 screen or bigger, less on a smaller one. */
export function hudScale(w: number, h: number): number {
  return step(clamp(Math.min(w / DESIGN_W, h / DESIGN_H), HUD_MIN, 1));
}

function viewport(): { w: number; h: number } {
  const v = window.visualViewport;
  return { w: Math.round(v?.width ?? window.innerWidth), h: Math.round(v?.height ?? window.innerHeight) };
}

function publish(): void {
  const { w, h } = viewport();
  const s = hudScale(w, h);
  const root = document.documentElement.style;
  root.setProperty('--hud', String(s));
  // The room the HUD has, in its own pixels (a `vw` inside a zoomed box is not the same on every browser, so the CSS asks for these).
  root.setProperty('--hud-w', `${Math.floor(w / s)}px`);
  root.setProperty('--hud-h', `${Math.floor(h / s)}px`);
}

/** Keeps `--hud`, `--hud-w` and `--hud-h` on the page as the window changes (mount it once, with the game's HUD). */
export function HudScale(): null {
  useEffect(() => {
    publish();
    window.addEventListener('resize', publish);
    window.visualViewport?.addEventListener('resize', publish);
    return () => {
      window.removeEventListener('resize', publish);
      window.visualViewport?.removeEventListener('resize', publish);
      const root = document.documentElement.style;
      for (const k of ['--hud', '--hud-w', '--hud-h']) root.removeProperty(k);
    };
  }, []);
  return null;
}

/** What the sides of a window keep free for the bags (the bar of four bags and the windows above it), in the HUD's pixels. */
const BAG_ROOM = 196;
/** What is kept free under a window, in the HUD's pixels (hud-scale.css gives the screen the same padding): its tabs and the hotbar. */
const BOTTOM_ROOM = 112;
/** And over and under it all, in screen pixels: the title plate that sits on the top rim, and a margin. */
const MARGIN = 44;

/**
 * Scales the window in `ref` down until it fits the screen, with the bags beside it and the hotbar under it. Measured at its own size (the
 * zoom is taken off for a moment, which is not drawn), so it does not matter how a browser reports the size of a zoomed box. `watch` lists
 * what changes which window it is (the screen and the tab); a change of size of its content is seen on its own.
 */
export function useWindowFit(ref: RefObject<HTMLElement | null>, watch: readonly unknown[]): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const inner = el.firstElementChild as HTMLElement | null;
    const fit = (): void => {
      const { w, h } = viewport();
      const hud = hudScale(w, h);
      el.style.zoom = '1';
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) {
        el.style.zoom = '';
        return; // (not shown: the inventory is kept ready, hidden)
      }
      const across = (w - 2 * BAG_ROOM * hud - 16) / box.width;
      const down = (h - BOTTOM_ROOM * hud - MARGIN) / box.height;
      const z = clamp(Math.min(1, across, down), 0.4, 1);
      const zs = String(Math.round(z * 100) / 100);
      el.style.zoom = zs;
      // The bags use what the window leaves, in their own pixels.
      const room = ((w - box.width * z) / 2 - 24) / hud;
      document.documentElement.style.setProperty('--bag-room', `${Math.max(200, Math.floor(room))}px`);
    };
    fit();
    const watcher = new ResizeObserver(fit);
    if (inner) watcher.observe(inner);
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);
    return () => {
      watcher.disconnect();
      window.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('resize', fit);
      el.style.zoom = '';
      document.documentElement.style.removeProperty('--bag-room');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, watch);
}
