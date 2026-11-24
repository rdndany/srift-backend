import type { Metadata } from 'next';
import '@/components/responsive.css';

/**
 * The presentation page: what `solrift.io` shows (see the host rewrite in `next.config.ts`). The game itself
 * lives on the play address. Reachable on any host as `/welcome`.
 */
export const metadata: Metadata = {
  title: 'SolRift: a voxel adventure in your browser',
  description: 'Mine, build, fight and ride through an endless world with your friends. No download: it runs in your browser.',
};

/** Where the "Play" buttons go: the game's own address online, the local game page in development. */
const PLAY_URL = process.env.NEXT_PUBLIC_PLAY_URL ?? (process.env.NODE_ENV === 'production' ? 'https://play.solrift.io' : '/play');

const FEATURES: { title: string; text: string }[] = [
  { title: 'An endless world', text: 'Seven biomes, caves, ores and forests, generated as far as you walk. Every seed is a different world.' },
  { title: 'Play together', text: 'Join the online realm, form a party, chat, trade with villagers and with other players.' },
  { title: 'Quests and classes', text: 'Pick a class, learn its abilities, follow the quest log from the first village to the first boss.' },
  { title: 'Gear worth chasing', text: 'Rarities, jewels, enchanting and the forge: every piece you find or make can be made better.' },
  { title: 'Ride your mount', text: 'Call a mount when you stand still and ride across the land, over steps and fences, faster than on foot.' },
  { title: 'Take to the air', text: 'Craft a pair of wings, hover over the ground, then double tap Space to fly. They unfold, beat and bank as you turn, in the manner of your class.' },
  { title: 'Rifts and the Gilded Tide', text: 'Tears in the world open near you, and every half hour golden creatures hide all over the land. Find them for the Codex of Aurelion, and keep what it opens into.' },
  { title: 'Achievements', text: 'Tiered achievements for dungeons, bosses and more, counted by the server and kept with your character.' },
  { title: 'It keeps growing', text: 'New bosses, instances and dungeons arrive as expansions, in the manner of an MMO.' },
];

export default function Welcome() {
  return (
    <main className="landing">
      <section className="landing-hero">
        <h1>
          Sol<span>Rift</span>
        </h1>
        <p className="landing-tag">A voxel sandbox adventure that runs in your browser.</p>
        <a className="landing-play" href={PLAY_URL}>
          Play now
        </a>
        <p className="landing-note">Free. No download. Works on desktop; use a mouse and keyboard.</p>
      </section>

      <section className="landing-features">
        {FEATURES.map((f) => (
          <article key={f.title}>
            <h2>{f.title}</h2>
            <p>{f.text}</p>
          </article>
        ))}
      </section>

      <section className="landing-controls">
        <h2>How to play</h2>
        <ul>
          <li>
            <b>WASD</b> move, <b>Space</b> jump, <b>Shift</b> sneak
          </li>
          <li>
            <b>Left click</b> mine and attack, <b>Right click</b> place and use
          </li>
          <li>
            <b>E</b> inventory, <b>1-9</b> hotbar, <b>T</b> chat, <b>Esc</b> pause
          </li>
        </ul>
        <a className="landing-play" href={PLAY_URL}>
          Start your adventure
        </a>
      </section>

      <footer className="landing-foot">SolRift. Solana-powered payments and ownership are planned, devnet first.</footer>
    </main>
  );
}
