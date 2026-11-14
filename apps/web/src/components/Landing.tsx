'use client';

import { useEffect, useRef, useState } from 'react';
import { AccountPanel } from './AccountPanel';
import { CONTENT_LABEL, EXPANSIONS, STATUS_LABEL, expansionTitle, nextExpansion, type Expansion } from '@solrift/shared';
import { EXPANSION_SHOT, HERO_SLIDES, MODE_SHOT, SHOT } from './homeAssets';
import { MODES, type HomeMode } from './modes';

const FEATURES: { id?: string; title: string; kicker: string; text: string; shot: string; chips: string[] }[] = [
  {
    kicker: 'A living world',
    title: 'Golden hours and moonlit nights',
    text: 'The sun climbs, burns gold and sets. The moon takes over and torches glow against the dark. Shadows follow the light across the ground, rain rolls in and thunder follows.',
    shot: SHOT.dusk,
    chips: ['Day and night', 'Sun and moon shadows', 'Rain and storms'],
  },
  {
    kicker: 'Explore',
    title: 'Villages, caves and forgotten dungeons',
    text: 'Walk from snowy peaks to sunny islands. Find villages with markets and farms, trade with the villagers, then go below ground to mineshafts, dungeons and temples full of loot.',
    shot: SHOT.isle,
    chips: ['Villages', 'Caves and mineshafts', 'Dungeons and temples'],
  },
  {
    kicker: 'Craft and fight',
    title: 'Forge your gear. Face the night.',
    text: 'Mine ore, smelt it and craft tools and armor. Enchant your sword, repair it on an anvil, and hold the line against zombies, skeletons and creepers. Draw a bow, load a crossbow or raise a shield.',
    shot: SHOT.mobs,
    chips: ['Crafting', 'Armor and enchanting', 'Bows, crossbows and shields', 'Hostile mobs'],
  },
  {
    id: 'l-adventure',
    kicker: 'Adventure',
    title: 'Dawnwatch needs you',
    text: 'Every adventurer starts in the village of Dawnwatch. Talk to its people, take up quests from a proper quest log, follow them on the tracker beside the minimap, and get paid in XP, items and Auren, the coin of the realm. Spend it with the merchants.',
    shot: SHOT.quests,
    chips: ['Quest log and tracker', 'Nine villagers to meet', 'Merchants and Auren', 'XP rewards'],
  },
  {
    kicker: 'Classes',
    title: 'Warrior, Mage or Ranger',
    text: 'Pick a class and the game bends around it: a Warrior fights on Stamina with a shield on the off hand, a Mage casts from Mana with an orb, a Ranger shoots on Focus. Each class has four abilities on the keys Z, X, C and G. You start knowing none: find the skill books on monsters and in quests, or buy them from the merchants, then right-click a book to learn it. All written in the spellbook.',
    shot: SHOT.spellbook,
    chips: ['Warrior, Mage, Ranger', 'Four abilities each', 'Learn from skill books', 'Spellbook'],
  },
  {
    kicker: 'Gear',
    title: 'A character sheet that shows your build',
    text: 'Your character stands in the inventory with four armor slots, an off hand and a backpack. Next to it are your numbers: health, damage by kind, defense, armor, speed and critical hits, plus the coins in your purse. Hover any item for a full tooltip.',
    shot: SHOT.inventory,
    chips: ['Armor slots', 'Off-hand items', 'Stats and Armor', 'Item tooltips'],
  },
  {
    kicker: 'Craft',
    title: 'A recipe book that knows what you have',
    text: 'Open the recipe book at any crafting table. Search it, sort it by kind, switch on Can make to see only what your backpack allows, and point at a recipe to see what is missing. A click fills the grid for you.',
    shot: SHOT.recipes,
    chips: ['Search and tabs', 'Can make filter', 'Fills the grid', 'Closes with the window'],
  },
  {
    kicker: 'Navigate',
    title: 'Never lose your way home',
    text: 'A square minimap sits in the corner with your position and the quest givers marked on it. Hold a map to see the whole land, and press J to hide the minimap when you want a clean screen.',
    shot: SHOT.hud,
    chips: ['Minimap', 'Held world map', 'Quest markers', 'Class and XP bars'],
  },
  {
    id: 'l-together',
    kicker: 'Together',
    title: 'Bring your friends. Share the world.',
    text: 'Join the online realm and build, trade and explore side by side. Form a party of up to four, see each other\u2019s health on the party frame, and walk into the Hollow Cellar together. Sign in with a Solana wallet if you like, or just jump in as a guest.',
    shot: SHOT.party,
    chips: ['Online realm', 'Parties of four', 'In-game chat', 'Optional wallet sign-in'],
  },
];

/** Fades its children in once they scroll into view. */
function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return setSeen(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${seen ? 'seen' : ''} ${className}`}>
      {children}
    </div>
  );
}

/** One chapter of the game, laid out like a boxed expansion: its name, its status and what it adds. */
function ExpansionCard({ e }: { e: Expansion }) {
  const live = e.status === 'live';
  return (
    <article className={`xp-card ${e.status}`} id={`expansion-${e.id}`} style={{ '--accent': e.accent } as React.CSSProperties}>
      <div className="xp-art" style={{ backgroundImage: `url(${EXPANSION_SHOT[e.id]})` }}>
        <span className="xp-status">{STATUS_LABEL[e.status]}</span>
      </div>
      <div className="xp-body">
        <div className="xp-logo">
          <span className="xp-game">
            Sol<b>Rift</b>
          </span>
          <span className="xp-name">{e.subtitle ?? 'The open world'}</span>
        </div>
        <p className="xp-tag">{e.tagline}</p>
        <p className="xp-text">{e.blurb}</p>
        <ul className="xp-content">
          {e.content.map((c) => (
            <li key={c.name} className={c.playable ? 'on' : ''}>
              <span className="xp-kind">{CONTENT_LABEL[c.kind]}</span>
              <span className="xp-item">
                <b>{c.name}</b>
                <i>{c.blurb}</i>
              </span>
            </li>
          ))}
        </ul>
        <span className={`xp-note ${live ? 'on' : ''}`}>{live ? 'Included. Play it now.' : 'Not playable yet. This is what we are building.'}</span>
      </div>
    </article>
  );
}

function PlayButton({ onClick, label = 'Play game' }: { onClick: () => void; label?: string }) {
  return (
    <button className="wow-play" onClick={onClick}>
      <span>{label}</span>
    </button>
  );
}

/** The front page: a slideshow of the game, a big PLAY GAME button, and what the game offers. */
export function Landing({ onPlay, onMode }: { onPlay: () => void; onMode: (mode: HomeMode) => void }) {
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % HERO_SLIDES.length), 7000);
    return () => clearInterval(t);
  }, []);

  const next = nextExpansion();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="landing">
      <nav className="lnav" data-no-play>
        <a className="lnav-logo" href="." onClick={(e) => e.preventDefault()}>
          Sol<b>Rift</b>
        </a>
        <div className="lnav-links">
          <button onClick={() => scrollTo('l-modes')}>Game modes</button>
          <button onClick={() => scrollTo('l-expansions')}>Expansions</button>
          <button onClick={() => scrollTo('l-world')}>The world</button>
          <button onClick={() => scrollTo('l-adventure')}>Adventure</button>
          <button onClick={() => scrollTo('l-together')}>Multiplayer</button>
        </div>
        <div className="lnav-account">
          <AccountPanel />
        </div>
      </nav>

      <header className="hero">
        <div className="hero-slides" aria-hidden>
          {HERO_SLIDES.map((src, i) => (
            <div key={src} className={`hero-slide ${i === slide ? 'on' : ''}`} style={{ backgroundImage: `url(${src})` }} />
          ))}
        </div>
        <div className="hero-shade" aria-hidden />
        <div className="embers" aria-hidden>
          {Array.from({ length: 16 }, (_, i) => (
            <i key={i} style={{ left: `${(i * 37 + 8) % 100}%`, animationDelay: `${-(i * 1.7) % 11}s`, animationDuration: `${9 + (i % 5) * 2}s` }} />
          ))}
        </div>
        <div className="hero-inner">
          <div className="hero-emblem">A voxel sandbox adventure</div>
          <h1 className="hero-logo">
            Sol<b>Rift</b>
          </h1>
          <p className="hero-tag">Mine. Build. Survive. Together.</p>
          <PlayButton onClick={onPlay} />
          {next && (
            <button className="hero-next" id="hero-next" data-no-play onClick={() => scrollTo('l-expansions')} style={{ '--accent': next.accent } as React.CSSProperties}>
              <span>{STATUS_LABEL[next.status]}</span> {expansionTitle(next).replace('SolRift: ', '')}
            </button>
          )}
          <p className="hero-sub">Free in your browser. No download. Single player and multiplayer.</p>
        </div>
        <button className="hero-scroll" onClick={() => scrollTo('l-modes')} aria-label="Scroll down" data-no-play>
          <span />
        </button>
        <div className="hero-dots" data-no-play>
          {HERO_SLIDES.map((src, i) => (
            <button key={src} className={i === slide ? 'on' : ''} onClick={() => setSlide(i)} aria-label={`Screenshot ${i + 1}`} />
          ))}
        </div>
      </header>

      <section id="l-modes" className="lsec">
        <Reveal>
          <h2 className="lsec-title">Choose your path</h2>
          <p className="lsec-lead">Three ways to play. Each one is a different adventure.</p>
        </Reveal>
        <div className="path-grid">
          {MODES.map((m, i) => (
            <Reveal key={m.id} className={`d${i}`}>
              <button className={`path-card ${m.id}`} onClick={() => onMode(m.id)}>
                <span className="path-img" style={{ backgroundImage: `url(${MODE_SHOT[m.id]})` }} />
                <span className="path-body">
                  <span className="path-name">{m.name}</span>
                  <span className="path-tag">{m.tagline}</span>
                  <span className="path-text">{m.blurb}</span>
                  <span className="path-go">Play {m.name}</span>
                </span>
              </button>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="l-expansions" className="lsec">
        <Reveal>
          <h2 className="lsec-title">Expansions</h2>
          <p className="lsec-lead">SolRift grows chapter by chapter. Each expansion brings new zones, bosses, instances and dungeons.</p>
        </Reveal>
        <div className="xp-grid">
          {EXPANSIONS.map((e, i) => (
            <Reveal key={e.id} className={`d${i % 3}`}>
              <ExpansionCard e={e} />
            </Reveal>
          ))}
        </div>
      </section>

      <section id="l-world" className="lsec lsec-dark">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} className={`feature ${i % 2 ? 'flip' : ''}`}>
            <div id={f.id} className="feature-shot" style={{ backgroundImage: `url(${f.shot})` }} />
            <div className="feature-text">
              <div className="kicker">{f.kicker}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
              <ul className="chips">
                {f.chips.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </Reveal>
        ))}
      </section>

      <section className="lsec cta">
        <div className="cta-bg" style={{ backgroundImage: `url(${SHOT.night})` }} aria-hidden />
        <Reveal className="cta-inner">
          <h2 className="lsec-title">Your world is waiting</h2>
          <p className="lsec-lead">Pick a seed, grab a pickaxe, and see what the night brings.</p>
          <PlayButton onClick={onPlay} />
        </Reveal>
      </section>

      <footer className="lfoot" data-no-play>
        <span>
          Sol<b>Rift</b>
        </span>
        <span>A voxel sandbox in your browser, powered by Solana.</span>
      </footer>
    </div>
  );
}
