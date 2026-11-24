'use client';

import { B, CLASSES, CLASS_IDS, EXPANSIONS, GAME_VERSION, I, STATUS_LABEL, latestExpansion, toolId, type ClassId, type ContentKind, type Expansion, type ExpansionContent } from '@solrift/shared';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ClassSkills } from './ClassSkills';
import { AccountPanel } from './AccountPanel';
import { COUNTS } from './beyondGuide';
import { Blocks } from './BlockCube';
import { BlurWords, ClickSparks, CountUp, Embers, Marquee, Reveal, Spot, useFrontMotion } from './fx';
import { ItemSprite } from './ItemSprite';
import { SCROLL_KEY, goMarket, goToken, goCamp, goShop } from './frontNav';
import { ART, SHOT } from './homeAssets';
import { MODES, type HomeMode } from './modes';
import { WayDialog, type Way } from './WayDialog';
import './front.css';
import './responsive.css';

/** Pictures of the World Beyond (small copies in /public/beyond/thumbs) under the two worlds, to show what is there. */
const REEL = [
  { file: 'realm-crystal_expanse-4', title: 'The Crystal Expanse' },
  { file: 'place-sky_temple', title: 'A Sky Temple' },
  { file: 'biome-ice_spikes', title: 'Ice Spikes' },
  { file: 'biome-giant_mushroom_forest', title: 'Giant Mushroom Forest' },
  { file: 'air-aurora', title: 'Aurora Highlands' },
  { file: 'realm-ashen_kingdom-5', title: 'The Ashen Kingdom' },
] as const;

/** The six tiles of "what you do". `span` is how many of six columns a tile takes. */
const FEATURES: { title: string; text: string; shot: string; span: number }[] = [
  { title: 'Embark on quests', text: 'Dawnwatch has nine people to talk to, a quest log, and a coin of its own called Auren.', shot: SHOT.quests, span: 4 },
  { title: 'Three ways to fight', text: 'Warrior, Mage or Ranger. Each has a resource bar and four abilities, learned from skill books.', shot: SHOT.spellbook, span: 2 },
  { title: 'Forge your gear', text: 'Mine, smelt, craft and enchant. The recipe book shows what your bags can make.', shot: SHOT.recipes, span: 2 },
  { title: 'A world that changes', text: 'The sun sets, rain rolls in, and torches hold the dark. Rifts tear open, and every half hour a golden tide sweeps the land.', shot: SHOT.dusk, span: 4 },
  { title: 'Bring your friends', text: 'One shared realm, a party of four, and the Hollow Cellar to walk into together.', shot: SHOT.party, span: 3 },
  { title: 'Never lose the way', text: 'A map you can hold and unfold, a compass, and quest markers on the map.', shot: SHOT.hud, span: 3 },
];

const ROMAN = ['', 'I', 'II', 'III', 'IV'] as const;

const STRIP = ['Mine', 'Craft', 'Build', 'Quest', 'Fish', 'Trade', 'Raid dungeons', 'Slay bosses', 'Seal rifts', 'Take to the air', 'Play with friends'] as const;

/** The little picture on each mode's badge. */
const MODE_ICON: Record<HomeMode, number> = {
  survival: toolId('sword', 'iron'),
  creative: toolId('pickaxe', 'diamond'),
  hardcore: I.BONE,
};

/** The heading of a section: a small numbered label, then the title (put the word to light up in <em>). */
function Head({ n, label, blocks, children }: { n: string; label: string; blocks: readonly number[]; children: ReactNode }) {
  return (
    <Reveal className="fp-head">
      <div>
        <small>
          <b>{n}</b>
          {label}
        </small>
        <h2>{children}</h2>
      </div>
      <Blocks ids={blocks} />
    </Reveal>
  );
}

/** The front page: key art with the logo and the way in, then the game laid out below it. */
export function Landing({ onEnter }: { onEnter: (way: Way, mode: HomeMode | null) => void }) {
  const root = useRef<HTMLDivElement>(null);
  // Every PLAY button asks first: single player or multiplayer, then (single player) the mode. `false`: not asking; a mode: the badge it came from.
  const [asking, setAsking] = useState<HomeMode | null | false>(false);
  const onPlay = () => setAsking(null);
  useFrontMotion(root);
  const chapters = EXPANSIONS.filter((e) => e.order > 0);
  const latest = latestExpansion();
  const featured = chapters.find((e) => e.id === 'hollow-king') ?? chapters[0];
  const later = chapters.filter((e) => e !== featured);
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Coming from another page (the character lobby's menu): go straight to the part of the page that was asked for.
  useEffect(() => {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(SCROLL_KEY);
    } catch {
      /* no storage: the page just opens at the top */
    }
    // (From the game's host the session does not reach this page, so the part comes in the address: `/?to=site-world`.)
    const asked = new URLSearchParams(location.search).get('to');
    if (!id && asked && /^[\w-]{1,40}$/.test(asked)) id = asked;
    if (!id) return;
    // (The key is taken once the page has scrolled: the development server runs this effect twice, and the first run is undone.)
    const t = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(SCROLL_KEY);
      } catch {
        /* nothing to remove */
      }
      if (asked) {
        const q = new URLSearchParams(location.search);
        q.delete('to');
        history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}${location.hash}`);
      }
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    }, 350);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="fp" ref={root}>
      <ClickSparks />
      {asking !== false && <WayDialog mode={asking} onDone={onEnter} onClose={() => setAsking(false)} />}
      <div className="fp-rail" data-no-play>
        <button className="fp-brand" onClick={() => scrollTo('fp-top')} aria-label="SolRift, to the top"><img src="/art/solrift-token-logo.png" alt="SolRift" draggable={false} /></button>
          <header className="fp-nav fp-px">
          <span className="fp-brand-gap" aria-hidden="true" />
          <nav className="site-nav fp-links" aria-label="Menu">
            <button className="fp-link-play" onClick={onPlay}>
              Play
            </button>
            <button onClick={() => scrollTo('site-world')}>The World</button>
            <button onClick={() => scrollTo('site-features')}>Classes</button>
            <button onClick={() => scrollTo('l-expansions')}>Expansions</button>
            <button className="fp-link-camp" onClick={goCamp}>Camp</button>
            <button className="fp-link-market" onClick={goMarket}>Market</button>
            <button className="fp-link-shop" onClick={goShop}>Shop</button>
            <button className="fp-link-token" onClick={goToken}>Token</button>
          </nav>
          <div className="fp-account">
            <AccountPanel bar />
          </div>
          <i className="fp-progress" aria-hidden="true" />
        </header>
      </div>

      <section className="fp-hero" id="fp-top">
        <div className="fp-art" aria-hidden="true">
          <div className="fp-art-m">
            <div className="fp-art-kb" style={{ backgroundImage: `url(${ART.hero})` }} />
          </div>
        </div>
        <div className="fp-rays" aria-hidden="true" />
        <Embers />
        <div className="fp-shade" aria-hidden="true" />

        <div className="fp-center">
          <div className="fp-chips">
            <p className="fp-chip">
              <i aria-hidden="true" />
              Powered by Solana
            </p>
            <p className="fp-chip fp-ver" id="game-version" title="Game version">
              Version {GAME_VERSION}
            </p>
          </div>
          <h1 className="fp-logo hero-logo">
            <img src="/art/solrift-logo.png" alt="SolRift" draggable={false} />
          </h1>
          {latest && (
            <p className="fp-xp" id="hero-expansion" style={{ ['--xp' as string]: latest.accent }}>
              <span className="fp-xp-kicker">Expansion {ROMAN[latest.order]}</span>
              <span className="fp-xp-name">{latest.subtitle}</span>
            </p>
          )}
          <p className="fp-tag">
            <BlurWords text="Mine. Craft. Conquer the rift." delay={0.55} />
          </p>
          <p className="fp-lead">
            An open-world voxel MMORPG. Build and mine, take quests in the village of Dawnwatch, and battle monsters with your friends. Free in your browser, no download.
          </p>
          <div className="fp-actions">
            <span className="fp-glow">
              <button className="wow-play fp-play fp-px" onClick={onPlay}>
                <span>
                  <i aria-hidden="true" />
                  Play now
                </span>
              </button>
            </span>
            <button className="fp-ghost fp-px" onClick={() => scrollTo('site-world')}>
              <span>Explore</span>
            </button>
          </div>
          <ul className="fp-badges">
            {MODES.map((m) => (
              <li key={m.id}>
                <button className="fp-badge fp-px" onClick={() => setAsking(m.id)}>
                  <ItemSprite id={MODE_ICON[m.id]} size={24} />
                  <span>
                    <small>Play</small>
                    {m.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <button className="fp-cue" onClick={() => scrollTo('fp-strip')} aria-label="Scroll down">
          <i />
        </button>
      </section>

      <main className="fp-below">
        <div className="fp-orbs" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>

        <div id="fp-strip">
          <Marquee items={STRIP} />
        </div>

        <ul className="fp-stats">
          {(
            [
              [3, 'Classes to master'],
              [4, 'Heroes in a party'],
              [120, 'Players per realm'],
              [9, 'Villagers with quests'],
            ] as const
          ).map(([n, label], i) => (
            <Reveal as="li" key={label} delay={i * 0.08}>
              <b>
                <CountUp to={n} />
              </b>
              <span>{label}</span>
            </Reveal>
          ))}
        </ul>

        <section className="fp-sec" id="site-world">
          <Head n="01" label="The world" blocks={[B.GRASS, B.CRAFTING_TABLE]}>
            Two worlds to <em>explore</em>
          </Head>
          <div className="fp-worlds">
            <Reveal className="fp-worlds-cell">
              <Spot className="fp-tile fp-world-tile fp-px">
                <i className="fp-tile-art" style={{ '--art': `url(${SHOT.dusk})` } as CSSProperties} />
                <div className="fp-tile-copy">
                  <small className="fp-world-kicker">The realm</small>
                  <h3>Dawnwatch</h3>
                  <p>Descend into a world of stone, caves and torchlight. Mine the hills, raise a house before the sun goes down, and hold the night against zombies, skeletons and creepers.</p>
                  <p>Talk to the people of Dawnwatch, take their quests, and spend what you earn with the merchants.</p>
                  <div className="fp-world-cta">
                    <button className="fp-ghost fp-px" onClick={onPlay}>
                      <span>Enter the realm</span>
                    </button>
                  </div>
                </div>
              </Spot>
            </Reveal>
            <Reveal className="fp-worlds-cell" delay={0.1}>
              <Spot className="fp-tile fp-world-tile fp-beyond fp-px" style={{ '--ember': '#4fe0c0' } as CSSProperties}>
                <i className="fp-tile-art" style={{ '--art': 'url(/beyond/biome-cherry_blossom_forest.webp)' } as CSSProperties} />
                <div className="fp-tile-copy">
                  <small className="fp-world-kicker">Past the edge of the map</small>
                  <h3>The World Beyond</h3>
                  <p>A second world: an endless planet made from a seed, with a layered underground, ancient places to loot and weather that is always on its way.</p>
                  <ul className="fp-world-facts">
                    <li>
                      <b>{COUNTS.biomes}</b> biomes
                    </li>
                    <li>
                      <b>{COUNTS.realms}</b> realms
                    </li>
                    <li>
                      <b>{COUNTS.places}</b> ancient places
                    </li>
                  </ul>
                  <div className="fp-world-cta">
                    <a className="fp-more fp-world-go" href="/beyond" id="world-beyond-more" style={{ '--c': '#4fe0c0' } as CSSProperties}>
                      See the World Beyond <span aria-hidden="true">&rarr;</span>
                    </a>
                  </div>
                </div>
                <a className="fp-tile-hit" href="/beyond" tabIndex={-1} aria-hidden="true" />
              </Spot>
            </Reveal>
          </div>
          <Reveal className="fp-reel" delay={0.15}>
            <ul>
              {REEL.map((r) => (
                <li key={r.file}>
                  <a href="/beyond" tabIndex={-1} aria-label={`${r.title}, in the World Beyond`}>
                    <img src={`/beyond/thumbs/${r.file}.webp`} alt="" width={420} height={236} loading="lazy" decoding="async" />
                    <span>{r.title}</span>
                  </a>
                </li>
              ))}
            </ul>
            <a className="fp-more" href="/beyond" style={{ '--c': '#4fe0c0' } as CSSProperties}>
              Every land, realm and ruin, with pictures from the game <span aria-hidden="true">&rarr;</span>
            </a>
          </Reveal>
        </section>
        <section className="fp-sec" id="site-features">
          <Head n="02" label="Classes" blocks={[B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE]}>
            Choose your <em>class</em>
          </Head>
          <ul className="fp-classes">
            {CLASS_IDS.map((id: ClassId, i) => {
              const c = CLASSES[id];
              return (
                <Reveal as="li" key={id} delay={i * 0.1}>
                  <Spot tilt className="fp-card fp-class fp-px" style={{ '--c': c.color } as CSSProperties}>
                    <div className="fp-medal">
                      <ItemSprite id={c.startingWeapon} size={56} title={c.name} />
                    </div>
                    <h3>{c.name}</h3>
                    <p className="fp-role">{c.role}</p>
                    <p className="fp-text">{c.description}</p>
                    <ClassSkills id={id} />
                    <a className="fp-more" href={`/classes/${id}`} id={`class-more-${id}`}>
                      Read the {c.name} guide <span aria-hidden="true">&rarr;</span>
                    </a>
                  </Spot>
                </Reveal>
              );
            })}
          </ul>
        </section>

        <section className="fp-sec">
          <Head n="03" label="Adventure" blocks={[B.FURNACE, B.BOOKSHELF, B.STONE_BRICKS]}>
            What you <em>do</em>
          </Head>
          <ul className="fp-features">
            {FEATURES.map((f, i) => (
              <Reveal as="li" key={f.title} delay={(i % 2) * 0.08} style={{ gridColumn: `span ${f.span}` }}>
                <Spot className="fp-tile fp-px">
                  <i className="fp-tile-art" style={{ '--art': `url(${f.shot})` } as CSSProperties} />
                  <div className="fp-tile-copy">
                    <h3>{f.title}</h3>
                    <p>{f.text}</p>
                  </div>
                </Spot>
              </Reveal>
            ))}
          </ul>
        </section>

        {featured && (
          <section className="fp-exp" id="l-expansions">
            <div className="fp-exp-in">
              <Reveal className="fp-head">
                <div>
                  <small>
                    <b>04</b>Expansions
                  </small>
                  <h2>
                    The first <em>expansion</em>
                  </h2>
                </div>
                <Blocks ids={[B.OBSIDIAN, B.GLOWSTONE, B.TNT]} />
              </Reveal>
              <KingFeature e={featured} onPlay={onPlay} />
              {later.length > 0 && (
                <>
                  <Reveal className="fp-road-head">
                    <small>On the horizon</small>
                  </Reveal>
                  <ul className="fp-road">
                    {later.map((e, i) => (
                      <Reveal as="li" key={e.id} delay={i * 0.1}>
                        <Spot className="fp-next fp-px" style={{ '--c': e.accent } as CSSProperties}>
                          <span className="fp-lock" aria-hidden="true" />
                          <small>
                            Expansion {ROMAN[e.order]} &middot; {STATUS_LABEL[e.status]}
                          </small>
                          <h3>{e.subtitle}</h3>
                          <p>{e.tagline}</p>
                        </Spot>
                      </Reveal>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>
        )}

        <section className="fp-sec fp-end">
          <Reveal>
            <div className="fp-pile">
              <Blocks ids={[B.GRASS, B.DIAMOND_ORE, B.PLANKS, B.GLOWSTONE, B.STONE]} size={72} />
            </div>
            <h2>
              The rift is <em>open</em>
            </h2>
            <p>Free in your browser. Walk in as a guest, or sign in with a wallet and keep your champion.</p>
            <span className="fp-glow">
              <button className="fp-play fp-px" onClick={onPlay}>
                <span>
                  <i aria-hidden="true" />
                  Play now
                </span>
              </button>
            </span>
          </Reveal>
        </section>

        <footer className="fp-foot" data-no-play>
          <b>SolRift</b>
          <span>A voxel world in your browser, powered by Solana.</span>
        </footer>
      </main>
    </div>
  );
}

/** The first expansion, in a frame of its own: obsidian with glowing cracks and ember studs, not the wood of the rest. */
function KingFeature({ e, onPlay }: { e: Expansion; onPlay: () => void }) {
  const boss = [...e.content].reverse().find((c) => c.kind === 'boss');
  const count = (kind: ContentKind) => e.content.filter((c) => c.kind === kind).length;
  const live = e.status === 'live';
  const of = (...kinds: ContentKind[]) => e.content.filter((c) => kinds.includes(c.kind));
  const groups: { label: string; kind: string; items: ExpansionContent[]; blurbs?: boolean }[] = [
    { label: 'Dungeons', kind: 'dungeon', items: of('dungeon', 'instance', 'raid') },
    { label: 'Bosses', kind: 'boss', items: of('boss'), blurbs: true },
    { label: 'Also included', kind: 'more', items: of('zone', 'feature') },
  ].filter((g) => g.items.length > 0);
  const facts: [number, string][] = [
    [count('dungeon'), 'Dungeons'],
    [count('boss'), 'Bosses'],
    [count('zone') + count('feature'), 'Systems'],
  ];
  return (
    <Reveal as="article" className="fp-king">
      <div className="fp-forge">
        <Spot className="fp-lava fp-king-art fp-px">
          <i className="fp-king-img" style={{ '--art': `url(${ART.hollowKing})` } as CSSProperties} />
          <div className="fp-king-copy">
            <div className="fp-king-tags">
              <span className={`fp-live${live ? ' on' : ''}`}>
                <i aria-hidden="true" />
                {live ? 'Playable at launch' : STATUS_LABEL[e.status]}
              </span>
              <span className="fp-chip-i">Expansion {ROMAN[e.order]}</span>
            </div>
            <h3>{boss?.name ?? e.subtitle}</h3>
            <p className="fp-chapter">{e.subtitle}</p>
            <p className="fp-king-text">{e.blurb}</p>
            <ul className="fp-king-facts">
              {facts.map(([n, label]) => (
                <li key={label}>
                  <b>{n}</b>
                  <span>{label}</span>
                </li>
              ))}
            </ul>
            {live && (
              <span className="fp-glow">
                <button className="fp-play fp-px" onClick={onPlay}>
                  <span>
                    <i aria-hidden="true" />
                    Play the expansion
                  </span>
                </button>
              </span>
            )}
          </div>
        </Spot>
      </div>
      <div className="fp-forge">
        <div className="fp-lava fp-slab fp-px">
          <div className="fp-slab-art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ART.hollowKingFight} alt={`${boss?.name ?? 'The boss'} rising over the burning halls`} />
          </div>
          <div className="fp-slab-groups">
            {groups.map((g) => (
              <section key={g.label} className={`fp-group k-${g.kind}`}>
                <h4>{g.label}</h4>
                <ul>
                  {g.items.map((c) => (
                    <li key={c.name} title={c.blurb}>
                      <b>{c.name}</b>
                      {g.blurbs && <span>{c.blurb}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </Reveal>
  );
}
