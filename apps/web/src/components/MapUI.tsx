'use client';

import { useEffect, useRef } from 'react';
import type { MapData } from '../game/mapData';
import { useUi } from '../ui/store';

/** The map is 1 pixel to a block in the corner, `MINI` pixels wide, drawn at twice the size. */
const MINI = 72;
const MINI_SHOWN = MINI * 2;
/** The pins canvas reaches this far past the disc on every side, so that a pin on the rim can sit on the border (like the N). */
const RIM_PAD = 14;
const MARKS_SIZE = MINI_SHOWN + RIM_PAD * 2;
const BG = '#1a1d26';

/** The paper behind the ground: ground that has not been seen stays like this. */
function ground(g: CanvasRenderingContext2D, w: number, h: number, color: string): void {
  g.clearRect(0, 0, w, h);
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
}

/** An arrow pointing the way the player looks (yaw 0 is north, up the map). */
function arrow(g: CanvasRenderingContext2D, x: number, y: number, yaw: number, size: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(-yaw);
  g.beginPath();
  g.moveTo(0, -size);
  g.lineTo(size * 0.7, size * 0.8);
  g.lineTo(0, size * 0.4);
  g.lineTo(-size * 0.7, size * 0.8);
  g.closePath();
  g.fillStyle = '#fff6d2';
  g.strokeStyle = '#1b1208';
  g.lineWidth = Math.max(1.5, size / 5);
  g.lineJoin = 'round';
  g.stroke();
  g.fill();
  g.restore();
}

/** A round badge with a letter in it (a quest mark): `r` is its radius. */
function badge(g: CanvasRenderingContext2D, x: number, y: number, r: number, text: string, fill: string, ink: string): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.strokeStyle = '#1b1208';
  g.lineWidth = Math.max(1.5, r / 4);
  g.stroke();
  g.fill();
  g.font = `bold ${Math.round(r * 1.6)}px "Segoe UI", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = ink;
  g.fillText(text, x, y + r * 0.08);
  g.textBaseline = 'alphabetic';
}

/** A party member: a green dot with a ring. */
function partyMark(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = '#62e07a';
  g.strokeStyle = '#06260e';
  g.lineWidth = Math.max(1.5, r / 3);
  g.stroke();
  g.fill();
  g.beginPath();
  g.arc(x, y, r * 1.75, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(98, 224, 122, 0.7)';
  g.lineWidth = 1.5;
  g.stroke();
}

/** A name on the big map, with a dark edge so it reads on any ground. */
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#fff6d2'): void {
  g.font = '12px "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.lineWidth = 3;
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(10, 6, 0, 0.8)';
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}

/**
 * The pins: quest givers (a gold `!` to take a quest, a gold `?` to hand one in, a grey `?` while it is being done) and party
 * members. Party members stay on the edge of the chart when they are out of view, so they point the way; quest givers are drawn
 * only when they are on it. `round`: the chart is the corner minimap, not a sheet.
 */
function pins(g: CanvasRenderingContext2D, map: MapData, px: number, size: number, big: boolean, round: boolean): void {
  const half = size / 2;
  // The minimap is a square RIM_PAD inside its canvas; the held map is a sheet.
  const disc = round ? half - RIM_PAD : half;
  const reach = round ? disc - 8 : half - 12;
  // The quests first, so that the more urgent pins are on top of them.
  const order: Record<string, number> = { waiting: 0, offer: 1, ready: 2, party: 3 };
  for (const p of [...map.pins].sort((a, b) => order[a.kind] - order[b.kind])) {
    let dx = (p.x - map.x) * px;
    let dy = (p.z - map.z) * px;
    const edge = p.kind === 'party';
    // Far-off party members move out to the border and stay there (on the minimap, on the line itself, like the N).
    const limit = round && edge ? disc - 1.5 : reach;
    // The corner chart is a square, so distance is measured in squares, not circles.
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    const out = dist > limit;
    if (out) {
      if (!edge) continue;
      dx *= limit / dist;
      dy *= limit / dist;
    }
    const x = half + dx;
    const y = half + dy;
    const r = (big ? 9 : 6.5) * (out ? 0.8 : 1);
    if (p.kind === 'offer') badge(g, x, y, r, '!', '#ffd34d', '#4a2a00');
    else if (p.kind === 'ready') badge(g, x, y, r, '?', '#ffd34d', '#4a2a00');
    else if (p.kind === 'waiting') badge(g, x, y, r, '?', '#aeb2bb', '#2b2f38');
    else partyMark(g, x, y, r * 0.55);

    if (big) {
      const far = Math.round(Math.hypot(p.x - map.x, p.z - map.z));
      const text = p.kind === 'party' && out ? `${p.name} (${far} m)` : p.name;
      // Near an edge the name goes below or inward, so that it is not cut off.
      label(g, text, Math.max(70, Math.min(size - 70, x)), y < 34 ? y + r + 15 : y - r - 5, p.kind === 'party' ? '#b8ffc4' : '#fff6d2');
    }
  }
}

/** Other players as dots (with their names on the big map), then the pins, then you. `px` is how many drawn pixels make a block. */
function markers(g: CanvasRenderingContext2D, map: MapData, px: number, size: number, names: boolean): void {
  const half = size / 2;
  g.font = '12px "Segoe UI", sans-serif';
  g.textAlign = 'center';
  for (const o of map.others) {
    const x = half + (o.x - map.x) * px;
    const y = half + (o.z - map.z) * px;
    if (names ? x < 4 || y < 4 || x > size - 4 || y > size - 4 : Math.max(Math.abs(x - half), Math.abs(y - half)) > half - RIM_PAD - 4) continue;
    g.beginPath();
    g.arc(x, y, names ? 4 : 3, 0, Math.PI * 2);
    g.fillStyle = '#6fd3ff';
    g.strokeStyle = '#06202c';
    g.lineWidth = 1.5;
    g.stroke();
    g.fill();
    if (names) label(g, o.name, x, y - 8);
  }
  pins(g, map, px, size, names, !names);
  arrow(g, half, half, map.yaw, names ? 9 : 7);
}
/** Run `fn` about fifteen times a second while mounted. */
function useTicker(fn: () => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    ref.current();
    const id = window.setInterval(() => ref.current(), 66);
    return () => window.clearInterval(id);
  }, []);
}

/** The square chart in the corner: the ground around you, the people near you and the way you face. */
export function MiniMap() {
  const map = useUi((s) => s.map);
  const on = useUi((s) => s.minimap);
  const screen = useUi((s) => s.screen);
  const spectating = useUi((s) => s.spectating);
  const terrain = useRef<HTMLCanvasElement>(null);
  const marks = useRef<HTMLCanvasElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const hasMap = useUi((s) => s.hasMap);
  const place = useUi((s) => s.place);
  const shown = on && hasMap && !!map && !spectating && screen !== 'dead';

  // The quest tracker below it makes room.
  useEffect(() => {
    document.body.classList.toggle('minimap-on', shown);
    return () => document.body.classList.remove('minimap-on');
  }, [shown]);

  useTicker(() => {
    const m = useUi.getState().map;
    const t = terrain.current;
    const k = marks.current;
    if (!m || !t || !k || !useUi.getState().minimap) return;
    const g = t.getContext('2d')!;
    ground(g, MINI, MINI, BG);
    if (m.underground) g.putImageData(m.levelSlice(MINI), 0, 0);
    else m.draw(g, m.x, m.z, 1, MINI, MINI);
    const kg = k.getContext('2d')!;
    kg.clearRect(0, 0, MARKS_SIZE, MARKS_SIZE);
    markers(kg, m, 2, MARKS_SIZE, false);
    if (label.current) label.current.textContent = `${Math.floor(m.x)}, ${Math.floor(m.y)}, ${Math.floor(m.z)}${m.underground ? '  (below)' : ''}`;
  });

  if (!shown) return null;
  return (
    <div id="minimap" data-testid="minimap">
      <div className="minimap-disc">
        <canvas ref={terrain} width={MINI} height={MINI} className="minimap-ground" />
      </div>
      <canvas ref={marks} width={MARKS_SIZE} height={MARKS_SIZE} className="minimap-marks" />
      <span className="minimap-north">N</span>
      {place && (
        <div className="minimap-place" data-testid="minimap-place">
          {place}
        </div>
      )}
      <div ref={label} className="minimap-coords" />
    </div>
  );
}
