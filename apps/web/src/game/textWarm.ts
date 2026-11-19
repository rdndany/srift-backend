/**
 * The first time the game draws a word, the browser builds that font's letters on the spot and the picture
 * stops. This draws a sample of every letter at the sizes the game uses, a little at a time, while the
 * world is still loading.
 */

const SAMPLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 +-.!?,;:\'"x<>()/';

const FACES: { css: string; load: string | null }[] = [
  { css: '24px Monocraft, "Courier New", monospace', load: '24px Monocraft' },
  { css: '22px Monocraft, monospace', load: '22px Monocraft' },
  { css: '14px Monocraft, monospace', load: '14px Monocraft' },
  { css: 'bold 64px "Trebuchet MS", Verdana, sans-serif', load: 'bold 64px "Trebuchet MS"' },
  { css: 'bold 56px "Trebuchet MS", Verdana, sans-serif', load: 'bold 56px "Trebuchet MS"' },
  { css: 'bold 54px "Trebuchet MS", Verdana, sans-serif', load: null },
  { css: 'bold 50px "Trebuchet MS", Verdana, sans-serif', load: null },
  { css: 'bold 30px Georgia, serif', load: 'bold 30px Georgia' },
  { css: '20px Georgia, serif', load: '20px Georgia' },
  { css: 'bold 56px Georgia, serif', load: 'bold 56px Georgia' },
  { css: '14px/1.35 system-ui, sans-serif', load: null },
];

let started = false;
let fontsReady = false;
let index = 0;
let canvas: HTMLCanvasElement | null = null;

function begin(): void {
  started = true;
  if (typeof document === 'undefined') {
    fontsReady = true;
    index = FACES.length;
    return;
  }
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;left:-9999px;top:0;pointer-events:none;';
  for (const face of FACES) {
    const line = document.createElement('div');
    line.style.font = face.css;
    line.textContent = SAMPLE;
    host.appendChild(line);
  }
  document.body.appendChild(host);
  void host.offsetWidth;
  host.remove();
  const loads = FACES.map((f) => f.load).filter((s): s is string => !!s);
  const pending = document.fonts?.load ? Promise.all(loads.map((s) => document.fonts.load(s))) : Promise.resolve();
  void pending.then(
    () => {
      fontsReady = true;
    },
    () => {
      fontsReady = true;
    },
  );
}

/** Draw the next face. Returns true when every face has been drawn. */
export function warmText(budgetMs = 6): boolean {
  if (!started) begin();
  if (!fontsReady || typeof document === 'undefined') return fontsReady && index >= FACES.length;
  canvas = canvas ?? document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  const t0 = performance.now();
  while (index < FACES.length && performance.now() - t0 < budgetMs) {
    const face = FACES[index++];
    canvas.width = 768;
    canvas.height = 80;
    ctx.font = face.css;
    ctx.textBaseline = 'middle';
    ctx.fillText(SAMPLE, 4, 40);
    ctx.measureText(SAMPLE);
  }
  return index >= FACES.length;
}
