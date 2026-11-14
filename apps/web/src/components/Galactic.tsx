import { useMemo } from 'react';

/**
 * The enchanting table's alien script: every letter is a few straight strokes on a small lattice, drawn
 * from a fixed recipe so the same letter always looks the same. (Made up for this game; it only borrows
 * the idea of a strange alphabet that the original shows in the table's offers.)
 */
const W = 4;
const H = 6;

function glyph(n: number): string {
  let s = (n * 2654435761 + 12345) >>> 0;
  const next = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const pt = (): [number, number] => [Math.floor(next() * (W + 1)), Math.floor(next() * (H + 1))];
  const strokes = 3 + Math.floor(next() * 2);
  let d = '';
  let cur = pt();
  for (let i = 0; i < strokes; i++) {
    let to = pt();
    if (to[0] === cur[0] && to[1] === cur[1]) to = [(to[0] + 2) % (W + 1), (to[1] + 3) % (H + 1)];
    d += `M${cur[0]} ${cur[1]}L${to[0]} ${to[1]}`;
    // Some strokes continue from where the last ended, others start somewhere new.
    cur = next() < 0.55 ? to : pt();
  }
  return d;
}

const GLYPHS = Array.from({ length: 36 }, (_, i) => glyph(i + 1));

function indexOf(ch: string): number {
  const c = ch.toLowerCase();
  if (c >= 'a' && c <= 'z') return c.charCodeAt(0) - 97;
  if (c >= '0' && c <= '9') return 26 + (c.charCodeAt(0) - 48);
  return -1;
}

/** Text in the table's alien script (anything that is not a letter or digit becomes a gap). */
export function Galactic({ text, size = 16, length }: { text: string; size?: number; length?: number }) {
  const cells = useMemo(() => {
    if (length === undefined) return [...text].map((ch) => indexOf(ch));
    // A short fixed-length run of glyphs that depends on the text: the same clue always looks the same.
    let h = 2166136261;
    for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    const out: number[] = [];
    for (let i = 0; i < length; i++) {
      h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
      out.push(i === 4 ? -1 : h % 26); // one gap, like two short words
    }
    return out;
  }, [text, length]);
  return (
    <span className="galactic" aria-hidden="true" style={{ height: size }}>
      {cells.map((g, i) =>
        g < 0 ? (
          <span key={i} className="galactic-gap" style={{ width: size * 0.5 }} />
        ) : (
          <svg key={i} viewBox={`-0.6 -0.6 ${W + 1.2} ${H + 1.2}`} width={(size * (W + 1.2)) / (H + 1.2)} height={size} fill="none" stroke="currentColor" strokeWidth="0.75" strokeLinecap="square">
            <path d={GLYPHS[g]} />
          </svg>
        ),
      )}
    </span>
  );
}
