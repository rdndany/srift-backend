import type { HollowDeepKind, MobKind, MobSound } from '@solrift/shared';

/**
 * The voices of the six monsters of the Hollow Deep (see mobDeep.ts), made from the same two tools as every other mob's in audio.ts: a
 * pitched voice sweeping from one note to another, and a puff of filtered noise. `mob` in audio.ts hands a deep monster's sound to
 * `deepMobSound` before anything else; it says whether it made one.
 *
 * What the server's sounds mean here (see mobs.ts): `hiss` is the warning before a move (the lurker waking, the puff swelling, the wraith
 * gathering a fireball, the knight winding up its charge), `shoot` the move itself (the fireball, the dash, the curse bolt), `yes` the priest's
 * healing, `no` its call for skeletons, `teleport` the shade's blink.
 */
export interface DeepTools {
  voice(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, lowpass?: number, wobble?: number): void;
  blip(freq: number, q: number, dur: number, gain: number, type: BiquadFilterType, sweep?: number): void;
}

const later = (fn: () => void, ms: number): void => void setTimeout(fn, ms);

export const isDeepVoice = (kind: MobKind): kind is HollowDeepKind =>
  kind === 'moss_lurker' || kind === 'spore_puff' || kind === 'ember_wraith' || kind === 'ashen_knight' || kind === 'hollow_priest' || kind === 'shade';

/** `v` is the loudness (0..1, already attenuated for the distance), `r` a small random detune (about 0.9..1.1). Returns whether it made a sound. */
export function deepMobSound(kind: HollowDeepKind, action: MobSound, v: number, r: number, t: DeepTools): boolean {
  switch (kind) {
    case 'moss_lurker':
      // Wet, slow and low: a creak of old roots, with the rustle of leaves under it.
      if (action === 'say') {
        t.voice('sawtooth', 72 * r, 54, 0.95, 0.2 * v, 260, 5);
        t.blip(900, 0.5, 0.5, 0.1 * v, 'bandpass', 0.7);
      } else if (action === 'hurt') {
        t.voice('sawtooth', 120 * r, 62, 0.3, 0.3 * v, 420);
        t.blip(2400, 0.9, 0.18, 0.2 * v, 'bandpass', 0.6);
      } else if (action === 'death') {
        t.voice('sawtooth', 92 * r, 34, 1.2, 0.3 * v, 230, 8);
        t.blip(700, 0.5, 0.9, 0.2 * v, 'bandpass', 0.4);
      } else if (action === 'hiss') {
        // It wakes: the moss heaves up.
        t.voice('sawtooth', 52 * r, 140, 0.6, 0.26 * v, 300, 6);
        t.blip(600, 0.4, 0.6, 0.26 * v, 'bandpass', 2.2);
      } else return false;
      return true;
    case 'spore_puff':
      // Soft and wet: little blubs; swelling with a rising bubbling; the burst a muffled whump and a hiss.
      if (action === 'say') {
        t.voice('sine', 380 * r, 520, 0.09, 0.14 * v, 1400);
        later(() => t.voice('sine', 460 * r, 340, 0.1, 0.11 * v, 1400), 90);
      } else if (action === 'hurt') {
        t.voice('sine', 720 * r, 300, 0.12, 0.2 * v, 1600);
        t.blip(2600, 1, 0.1, 0.1 * v, 'bandpass');
      } else if (action === 'death') {
        t.blip(500, 0.6, 0.5, 0.4 * v, 'lowpass', 0.3);
        t.voice('sine', 190 * r, 55, 0.35, 0.3 * v, 600);
        t.blip(3200, 0.7, 0.7, 0.2 * v, 'highpass', 0.5);
      } else if (action === 'hiss') {
        t.voice('sine', 300 * r, 900, 0.55, 0.16 * v, 2000, 28);
        t.blip(1800, 0.8, 0.5, 0.1 * v, 'bandpass', 2);
      } else return false;
      return true;
    case 'ember_wraith':
      // An airy wail over crackling fire.
      if (action === 'say') {
        t.voice('sine', 520 * r, 380, 1.0, 0.14 * v, 0, 30);
        t.blip(2400, 0.8, 0.7, 0.1 * v, 'highpass', 0.8);
      } else if (action === 'hurt') {
        t.voice('sawtooth', 900 * r, 400, 0.22, 0.2 * v, 2400, 40);
        t.blip(3000, 0.8, 0.2, 0.2 * v, 'highpass');
      } else if (action === 'death') {
        t.voice('sine', 640 * r, 85, 1.1, 0.24 * v, 1800, 40);
        t.blip(1800, 0.5, 0.9, 0.28 * v, 'bandpass', 0.3);
      } else if (action === 'hiss') {
        // The flames gather in its hands.
        t.blip(800, 0.7, 0.6, 0.28 * v, 'bandpass', 3);
        t.voice('sine', 200 * r, 520, 0.6, 0.14 * v, 1200, 20);
      } else if (action === 'shoot') {
        t.blip(400, 0.6, 0.35, 0.38 * v, 'lowpass', 2);
        t.voice('sawtooth', 260 * r, 120, 0.25, 0.2 * v, 900);
      } else return false;
      return true;
    case 'ashen_knight':
      // Armour: a low growl in a helm, with clanks of metal.
      if (action === 'say') {
        t.voice('sawtooth', 82 * r, 64, 0.5, 0.24 * v, 360);
        t.blip(3500, 4, 0.12, 0.1 * v, 'bandpass');
      } else if (action === 'hurt') {
        t.voice('triangle', 420 * r, 300, 0.12, 0.26 * v);
        t.blip(2600, 6, 0.2, 0.32 * v, 'bandpass');
        t.voice('sawtooth', 110 * r, 70, 0.2, 0.26 * v, 400);
      } else if (action === 'death') {
        t.voice('sawtooth', 100 * r, 35, 0.9, 0.3 * v, 300);
        t.blip(2800, 6, 0.2, 0.3 * v, 'bandpass');
        later(() => t.blip(2200 * r, 5, 0.18, 0.24 * v, 'bandpass'), 180);
        later(() => t.blip(3100 * r, 6, 0.16, 0.2 * v, 'bandpass'), 360);
      } else if (action === 'hiss') {
        // The wind-up: a growl rising, a blade scraped on the shield.
        t.voice('sawtooth', 70 * r, 140, 0.55, 0.26 * v, 500, 10);
        t.blip(4200, 5, 0.4, 0.2 * v, 'bandpass', 0.6);
      } else if (action === 'shoot') {
        // The dash: a rush of air and the clatter of plate.
        t.blip(900, 0.7, 0.5, 0.34 * v, 'bandpass', 2.5);
        t.voice('sawtooth', 90 * r, 180, 0.4, 0.24 * v, 500);
        later(() => t.blip(2400 * r, 5, 0.12, 0.22 * v, 'bandpass'), 120);
        later(() => t.blip(2900 * r, 5, 0.12, 0.22 * v, 'bandpass'), 240);
      } else return false;
      return true;
    case 'hollow_priest':
      // A whispered chant in two notes a fifth apart, breathy; the curse a low dark pluck.
      if (action === 'say') {
        t.voice('sawtooth', 130 * r, 118, 0.9, 0.12 * v, 500, 5);
        t.voice('sine', 195 * r, 185, 0.9, 0.1 * v, 0, 8);
        t.blip(5000, 0.5, 0.5, 0.07 * v, 'highpass');
      } else if (action === 'hurt') {
        t.voice('sawtooth', 330 * r, 180, 0.25, 0.22 * v, 900, 12);
        t.voice('sine', 495 * r, 270, 0.22, 0.12 * v);
      } else if (action === 'death') {
        t.voice('sawtooth', 160 * r, 150, 0.5, 0.18 * v, 500, 6);
        later(() => t.voice('sawtooth', 130 * r, 120, 0.5, 0.18 * v, 450, 6), 450);
        later(() => t.voice('sawtooth', 100 * r, 55, 0.9, 0.2 * v, 350, 8), 900);
      } else if (action === 'shoot') {
        t.voice('sine', 180 * r, 70, 0.3, 0.3 * v, 800);
        t.voice('sawtooth', 90 * r, 60, 0.3, 0.2 * v, 400);
        t.blip(3000, 1, 0.15, 0.1 * v, 'highpass', 0.5);
      } else if (action === 'yes') {
        // The healing: two notes climbing, thin and cold.
        t.voice('sine', 520 * r, 780, 0.45, 0.16 * v, 0, 6);
        later(() => t.voice('sine', 780 * r, 1040, 0.5, 0.14 * v, 0, 6), 110);
      } else if (action === 'no') {
        // The call: a deep drone and a low bell as the dead are woken.
        t.voice('sawtooth', 70 * r, 52, 1.0, 0.26 * v, 250, 4);
        t.voice('sine', 262 * r, 255, 1.2, 0.12 * v, 0, 3);
        t.blip(500, 0.5, 0.8, 0.14 * v, 'bandpass', 0.5);
      } else if (action === 'hiss') {
        t.blip(5200, 0.6, 0.6, 0.2 * v, 'highpass', 0.6);
      } else return false;
      return true;
    case 'shade':
      // Thin and breathy: a rasp of air and a high whine; a shriek when hurt; the blink a pop with a hiss backwards.
      if (action === 'say') {
        t.blip(3800, 1.5, 0.7, 0.16 * v, 'bandpass', 0.5);
        t.voice('sine', 1200 * r, 900, 0.6, 0.05 * v, 0, 20);
      } else if (action === 'hurt') {
        t.voice('sawtooth', 1800 * r, 500, 0.15, 0.2 * v, 3000, 60);
        t.blip(5000, 1, 0.12, 0.2 * v, 'highpass');
      } else if (action === 'death') {
        t.voice('sawtooth', 1500 * r, 100, 0.9, 0.22 * v, 2500, 50);
        t.blip(4200, 0.8, 0.9, 0.18 * v, 'bandpass', 0.2);
      } else if (action === 'teleport') {
        t.voice('sine', 1900 * r, 200, 0.15, 0.22 * v, 0, 40);
        t.blip(6000, 0.6, 0.12, 0.2 * v, 'highpass', 0.4);
        later(() => t.blip(900, 0.8, 0.12, 0.14 * v, 'bandpass', 3), 60);
      } else return false;
      return true;
  }
}
