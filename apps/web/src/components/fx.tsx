'use client';

/*
 * Small motion effects for the front page, in the spirit of React Bits (reveal on scroll, blur-in words, count up,
 * spotlight and tilt cards, floating particles, click sparks). Written here with no dependency:
 * each is a few lines of DOM and CSS (see front.css, the `fx-` classes).
 */

import { B } from '@solrift/shared';
import { createElement, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from 'react';

import { BlockCube } from './BlockCube';

/** The blocks between the words of the strip. */
const BLOCK_RING = [B.GRASS, B.STONE, B.PLANKS, B.DIAMOND_ORE, B.GOLD_ORE, B.CRAFTING_TABLE, B.OBSIDIAN, B.TNT, B.BOOKSHELF] as const;

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True once the element has scrolled into view. */
export function useInView<T extends Element>(margin = '0px 0px -8% 0px') {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: margin, threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return [ref, seen] as const;
}

type Tag = 'div' | 'li' | 'section' | 'article' | 'header' | 'figure';

/** Fades and lifts its content in when it scrolls into view. */
export function Reveal({ children, delay = 0, className = '', as = 'div', style }: { children: ReactNode; delay?: number; className?: string; as?: Tag; style?: CSSProperties }) {
  const [ref, seen] = useInView<HTMLElement>();
  return createElement(as, { ref, className: `fx-reveal${seen ? ' in' : ''} ${className}`, style: { ...style, '--d': `${delay}s` } }, children);
}

/** A line of text whose words blur in one after the other (on load). */
export function BlurWords({ text, className = '', delay = 0, step = 0.08 }: { text: string; className?: string; delay?: number; step?: number }) {
  return (
    <span className={`fx-words ${className}`} aria-label={text}>
      {text.split(' ').map((w, i) => (
        <span key={i} className="fx-word" aria-hidden="true" style={{ animationDelay: `${delay + i * step}s` }}>
          {w}
        </span>
      ))}
    </span>
  );
}

/** A number that counts up when it scrolls into view. */
export function CountUp({ to, duration = 1400 }: { to: number; duration?: number }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reduced()) {
      setV(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, to, duration]);
  return <span ref={ref}>{v}</span>;
}

/** A card with a light that follows the pointer along its edge and face, and (optionally) a gentle 3D tilt. */
export function Spot({ children, className = '', as = 'div', tilt = false, style }: { children: ReactNode; className?: string; as?: Tag; tilt?: boolean; style?: CSSProperties }) {
  const move = (e: PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    el.style.setProperty('--mx', `${x}px`);
    el.style.setProperty('--my', `${y}px`);
    if (tilt && !reduced()) {
      el.style.setProperty('--ry', `${((x / r.width - 0.5) * 9).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${((0.5 - y / r.height) * 9).toFixed(2)}deg`);
    }
  };
  const leave = (e: PointerEvent<HTMLElement>) => {
    e.currentTarget.style.setProperty('--rx', '0deg');
    e.currentTarget.style.setProperty('--ry', '0deg');
    e.currentTarget.style.setProperty('--mx', '-400px');
  };
  return createElement(as, { className: `fx-spot${tilt ? ' fx-tilt' : ''} ${className}`, style, onPointerMove: move, onPointerLeave: leave }, children);
}

/** Moves a few CSS variables on the root as the page scrolls and the pointer moves: `--sy`, `--sp`, `--px`, `--py`. */
export function useFrontMotion(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    const layer = document.getElementById('home-layer');
    if (!el || !layer) return;
    let raf = 0;
    let cx = 0;
    let cy = 0;
    const apply = () => {
      raf = 0;
      const sy = layer.scrollTop;
      const max = Math.max(1, layer.scrollHeight - layer.clientHeight);
      el.style.setProperty('--sy', sy.toFixed(0));
      el.style.setProperty('--sp', (sy / max).toFixed(4));
      el.style.setProperty('--px', cx.toFixed(3));
      el.style.setProperty('--py', cy.toFixed(3));
      el.dataset.scrolled = sy > 24 ? '1' : '0';
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const move = (e: globalThis.PointerEvent) => {
      cx = (e.clientX / innerWidth) * 2 - 1;
      cy = (e.clientY / innerHeight) * 2 - 1;
      queue();
    };
    layer.addEventListener('scroll', queue, { passive: true });
    if (!reduced()) window.addEventListener('pointermove', move, { passive: true });
    apply();
    return () => {
      layer.removeEventListener('scroll', queue);
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(raf);
    };
  }, [root]);
}

// ---------- particles ----------

const EMBERS = ['#ffd27a', '#ff9a3d', '#ff6a3a', '#ffe8b0'];

interface Mote {
  x: number;
  y: number;
  z: number;
  size: number;
  vy: number;
  sway: number;
  phase: number;
  c: number;
}

/** Embers drifting up over the key art. Pauses when off screen. */
export function Embers() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    const host = cv?.parentElement;
    if (!cv || !ctx || !host) return;
    const still = reduced();
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let onScreen = true;
    let mx = 0;
    let my = 0;
    let sx = 0;
    let sy = 0;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    const make = (anywhere: boolean): Mote => {
      const z = rnd(0.25, 1);
      return {
        x: rnd(0, w),
        y: anywhere ? rnd(0, h) : h + rnd(10, 80),
        z,
        size: rnd(1.2, 3.2),
        vy: rnd(18, 54) * z,
        sway: rnd(6, 26),
        phase: rnd(0, 6.28),
        c: Math.floor(rnd(0, EMBERS.length)),
      };
    };
    let motes: Mote[] = [];

    const size = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      w = host.clientWidth;
      h = host.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      const count = Math.round(Math.min(70, Math.max(26, w / 22)));
      motes = Array.from({ length: count }, () => make(true)).sort((a, b) => a.z - b.z);
    };
    size();

    const draw = (t: number, dt: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      sx += (mx - sx) * 0.05;
      sy += (my - sy) * 0.05;
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        if (!still) m.y -= m.vy * dt;
        if (m.y < -30) motes[i] = make(false);
        const x = m.x + Math.sin(t * 0.0006 + m.phase) * m.sway - sx * 28 * m.z;
        const y = m.y - sy * 18 * m.z;
        const flick = 0.55 + 0.45 * Math.sin(t * 0.004 + m.phase * 3);
        ctx.globalAlpha = (0.25 + 0.7 * m.z) * flick;
        ctx.fillStyle = EMBERS[m.c];
        ctx.fillRect(x, y, m.size, m.size);
      }
      ctx.globalAlpha = 1;
    };

    let last = performance.now();
    const loop = (t: number) => {
      raf = 0;
      if (!onScreen || document.hidden) return;
      draw(t, Math.min(0.05, (t - last) / 1000));
      last = t;
      if (!still) raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!raf && onScreen) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    kick();

    const move = (e: globalThis.PointerEvent) => {
      mx = (e.clientX / innerWidth) * 2 - 1;
      my = (e.clientY / innerHeight) * 2 - 1;
    };
    const io = new IntersectionObserver((es) => {
      onScreen = es.some((e) => e.isIntersecting);
      kick();
    });
    io.observe(host);
    const ro = new ResizeObserver(size);
    ro.observe(host);
    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('visibilitychange', kick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('pointermove', move);
      document.removeEventListener('visibilitychange', kick);
    };
  }, []);
  return <canvas ref={ref} className="fx-field" aria-hidden="true" />;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
}

/** A burst of little squares where the page is clicked. */
export function ClickSparks() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx || reduced()) return;
    let dpr = 1;
    let raf = 0;
    let sparks: Spark[] = [];
    let last = 0;
    const size = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round(innerWidth * dpr);
      cv.height = Math.round(innerHeight * dpr);
    };
    size();
    const colors = ['#ffd27a', '#ff9a3d', '#c9b2ff', '#a6f1ff', '#ffffff'];
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      sparks = sparks.filter((s) => s.life > 0);
      for (const s of sparks) {
        s.life -= dt * 1.7;
        s.vy += 380 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        ctx.globalAlpha = Math.max(0, s.life);
        ctx.fillStyle = s.color;
        const q = s.size * (0.4 + s.life * 0.6);
        ctx.fillRect(s.x - q / 2, s.y - q / 2, q, q);
      }
      ctx.globalAlpha = 1;
      raf = sparks.length ? requestAnimationFrame(tick) : 0;
      if (!sparks.length) ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    const down = (e: globalThis.PointerEvent) => {
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
        const v = 90 + Math.random() * 190;
        sparks.push({ x: e.clientX, y: e.clientY, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 90, life: 1, size: 4 + Math.random() * 5, color: colors[Math.floor(Math.random() * colors.length)] });
      }
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    window.addEventListener('pointerdown', down, { passive: true });
    window.addEventListener('resize', size);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('resize', size);
    };
  }, []);
  return <canvas ref={ref} className="fx-sparks" aria-hidden="true" />;
}

/** An endless strip of words that slides sideways. The second copy is for the loop only. */
export function Marquee({ items }: { items: readonly string[] }) {
  const row = (hidden: boolean) => (
    <ul className="fx-marquee-row" aria-hidden={hidden || undefined}>
      {items.map((t, i) => (
        <li key={t}>
          <BlockCube id={BLOCK_RING[i % BLOCK_RING.length]} size={30} />
          {t}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="fx-marquee">
      <div className="fx-marquee-track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
