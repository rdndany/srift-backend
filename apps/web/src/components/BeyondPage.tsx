'use client';

import { B, BEYOND_BIOMES, GAME_VERSION, type BeyondBiome, type BiomeFamily } from '@solrift/shared';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AccountPanel } from './AccountPanel';
import { Blocks } from './BlockCube';
import { COPY, COUNTS, DEEDS, FAMILIES, PLACES, RARITY_LABEL, REALMS, CAVES, biomesIn, caveName, caveText, familyName, placeText, rarityCounts } from './beyondGuide';
import { SHOTS, shotUrl, type Shot } from './beyondShots';
import { ClickSparks, Embers, Reveal, Spot, useFrontMotion } from './fx';
import { lobbyUrl } from '../game/route';
import { SCROLL_KEY, goMarket, goToken, goFarm, goShop } from './frontNav';
import { ART } from './homeAssets';
import './home.css';
import './front.css';
import './classPage.css';
import './beyondPage.css';
import './responsive.css';

/** The heading of a section: a small numbered label, then the title (the word to light up goes in <em>). */
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

/** Goes to a part of the front page (its menu leads there too). */
const toFront = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(SCROLL_KEY, id);
  } catch {
    /* no storage: the page just opens at the top */
  }
  location.assign('/');
};

const rarityClass = (r: string): string => `r-${r.replace('_', '-')}`;

/** A capture of the game: a framed picture that opens large when it is clicked. */
function Frame({ shot, onOpen, className = '', sizes }: { shot: Shot; onOpen: (s: Shot) => void; className?: string; sizes?: string }) {
  return (
    <figure className={`bp-shot ${className}`}>
      <button type="button" className="fp-px" onClick={() => onOpen(shot)} aria-label={`Open the capture: ${shot.title}`}>
        <img src={shotUrl(shot)} alt={shot.alt ?? shot.title} width={1600} height={900} loading="lazy" decoding="async" sizes={sizes} />
        <span className="bp-zoom" aria-hidden="true" />
      </button>
      <figcaption>
        <b>{shot.title}</b>
        {shot.note && <span>{shot.note}</span>}
        {shot.rarity && <em className={`bp-rar ${rarityClass(shot.rarity)}`}>{RARITY_LABEL[shot.rarity]}</em>}
      </figcaption>
    </figure>
  );
}

/** The big picture of the top of the page: a few captures that dissolve into each other. */
function Stage({ shots, onOpen }: { shots: readonly Shot[]; onOpen: (s: Shot) => void }) {
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (hover || shots.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % shots.length), 5200);
    return () => clearInterval(t);
  }, [hover, shots.length]);
  const cur = shots[i];
  return (
    <figure className="bp-stage" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} aria-label="Captures of the World Beyond">
      <i className="cp-aura" aria-hidden="true" />
      <div className="bp-stage-frame fp-px">
        <div className="bp-stage-pics">
          {shots.map((s, k) => (
            <img key={s.file} src={shotUrl(s)} alt={s.alt ?? s.title} width={1600} height={900} className={k === i ? 'on' : ''} loading={k === 0 ? 'eager' : 'lazy'} decoding="async" />
          ))}
        </div>
        <button type="button" className="bp-stage-open" onClick={() => onOpen(cur)} aria-label={`Open the capture: ${cur.title}`} />
        <figcaption>
          <b>{cur.title}</b>
          {cur.note && <span>{cur.note}</span>}
        </figcaption>
      </div>
      <ol className="bp-dots" aria-label="Which capture">
        {shots.map((s, k) => (
          <li key={s.file}>
            <button type="button" className={k === i ? 'on' : ''} aria-label={s.title} aria-current={k === i} onClick={() => setI(k)} />
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** A capture shown full size over the page. Esc, a click or the button closes it; the arrows move through the group. */
function Lightbox({ group, at, onClose, onMove }: { group: readonly Shot[]; at: number; onClose: () => void; onMove: (d: number) => void }) {
  const s = group[at];
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onMove(1);
      else if (e.key === 'ArrowLeft') onMove(-1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose, onMove]);
  return (
    <div className="bp-lb" role="dialog" aria-modal="true" aria-label={s.title} onClick={onClose}>
      <figure onClick={(e) => e.stopPropagation()}>
        <img src={shotUrl(s)} alt={s.alt ?? s.title} />
        <figcaption>
          <b>{s.title}</b>
          {s.note && <span>{s.note}</span>}
          <small>
            {at + 1} / {group.length}
          </small>
        </figcaption>
      </figure>
      <button type="button" className="bp-lb-x" onClick={onClose} aria-label="Close">
        &times;
      </button>
      {group.length > 1 && (
        <>
          <button
            type="button"
            className="bp-lb-n prev"
            onClick={(e) => {
              e.stopPropagation();
              onMove(-1);
            }}
            aria-label="Previous capture"
          >
            &lsaquo;
          </button>
          <button
            type="button"
            className="bp-lb-n next"
            onClick={(e) => {
              e.stopPropagation();
              onMove(1);
            }}
            aria-label="Next capture"
          >
            &rsaquo;
          </button>
        </>
      )}
    </div>
  );
}

const biomeOf = (key: string): BeyondBiome | undefined => BEYOND_BIOMES.find((b) => b?.key === key);

/** `/beyond`: a page about the World Beyond: what it is, its lands, realms, places, caverns and weather, and how to start. */
export function BeyondPage() {
  const root = useRef<HTMLDivElement>(null);
  const [family, setFamily] = useState<BiomeFamily>(FAMILIES[0]);
  const [view, setView] = useState<{ group: readonly Shot[]; at: number } | null>(null);
  useFrontMotion(root);
  const counts = rarityCounts();
  const scrollTo = (to: string) => document.getElementById(to)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const open = useCallback((group: readonly Shot[]) => (s: Shot) => setView({ group, at: Math.max(0, group.findIndex((x) => x.file === s.file)) }), []);
  const move = useCallback((d: number) => setView((v) => (v ? { ...v, at: (v.at + d + v.group.length) % v.group.length } : v)), []);
  const close = useCallback(() => setView(null), []);

  // The page opens at the top, whatever the last page was scrolled to.
  useEffect(() => {
    document.getElementById('home-layer')?.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  /** Straight into the lobby, with The World Beyond already chosen. */
  const play = () => {
    void import('./GameLobby').then(({ saveLobbyChoice }) => {
      saveLobbyChoice({ way: 'single', mode: 'survival', world: 'beyond' });
      location.assign(lobbyUrl({ way: 'single', mode: 'survival', world: 'beyond' }));
    });
  };

  const inFamily = SHOTS.biomes.filter((s) => biomeOf(s.key ?? '')?.family === family);
  const familyShots = inFamily.length ? inFamily : SHOTS.biomes.slice(0, 2);
  const allShots = SHOTS.featured;

  return (
    <div className="fp cp bp" ref={root} style={{ '--c': '#4fe0c0' } as CSSProperties}>
      <ClickSparks />
      {view && <Lightbox group={view.group} at={view.at} onClose={close} onMove={move} />}

      <div className="fp-rail" data-no-play>
        <button className="fp-brand" onClick={() => toFront(null)} aria-label="SolRift, to the front page"><img src="/art/solrift-token-logo.png" alt="SolRift" draggable={false} /></button>
          <header className="fp-nav fp-px">
          <span className="fp-brand-gap" aria-hidden="true" />
          <nav className="site-nav fp-links" aria-label="Menu">
            <button className="fp-link-play" onClick={play}>
              Play
            </button>
            <button aria-current="page" onClick={() => document.getElementById('home-layer')?.scrollTo({ top: 0, behavior: 'smooth' })}>The World</button>
            <button onClick={() => toFront('site-features')}>Classes</button>
            <button onClick={() => toFront('l-expansions')}>Expansions</button>
            <button className="fp-link-farm" onClick={goFarm}>Farm</button>
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

      {/* ------------------------------------------------------------------ the top */}
      <section className="cp-hero bp-hero" id="bp-top">
        <div className="fp-art" aria-hidden="true">
          <div className="fp-art-m">
            <div className="fp-art-kb" style={{ backgroundImage: `url(${ART.hero})` }} />
          </div>
        </div>
        <div className="fp-rays" aria-hidden="true" />
        <div className="cp-wash" aria-hidden="true" />
        <Embers />
        <div className="cp-hero-in">
          <div className="cp-hero-copy">
            <nav className="cp-crumbs" aria-label="Where you are">
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('home-layer')?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                The World
              </a>
              <span aria-hidden="true">/</span>
              <b>The World Beyond</b>
            </nav>
            <p className="cp-role">A world of its own</p>
            <h1 className="cp-name bp-name" id="beyond-name">
              The World <em>Beyond</em>
            </h1>
            <p className="cp-tagline">An endless planet, made from a seed</p>
            <p className="cp-lead">{COPY.lead}</p>
            <ul className="cp-badges">
              <li>{COUNTS.biomes} biomes</li>
              <li>{COUNTS.realms} signature realms</li>
              <li>{COUNTS.places} ancient places</li>
            </ul>
            <div className="cp-actions">
              <span className="fp-glow">
                <button className="fp-play fp-px" id="beyond-play" onClick={play}>
                  <span>
                    <i aria-hidden="true" />
                    Enter the Beyond
                  </span>
                </button>
              </span>
              <button className="fp-ghost fp-px" onClick={() => scrollTo('bp-lands')}>
                <span>See the lands</span>
              </button>
            </div>
          </div>
          <Stage shots={SHOTS.hero} onOpen={open(SHOTS.hero)} />
        </div>
        <ul className="cp-jump" aria-label="On this page">
          {[
            ['bp-about', 'The world'],
            ['bp-lands', 'The lands'],
            ['bp-realms', 'Ten realms'],
            ['bp-places', 'Ancient places'],
            ['bp-below', 'Below'],
            ['bp-air', 'The air'],
            ['bp-codex', 'The Codex'],
            ['bp-start', 'How to begin'],
          ].map(([to, label]) => (
            <li key={to}>
              <button onClick={() => scrollTo(to)}>{label}</button>
            </li>
          ))}
        </ul>
      </section>

      <main className="fp-below">
        <div className="fp-orbs" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>

        {/* ---------------------------------------------------------------- the numbers */}
        <ul className="bp-counts" aria-label="The World Beyond in numbers">
          {[
            [COUNTS.biomes, 'biomes'],
            [COUNTS.families, 'families of land'],
            [COUNTS.realms, 'signature realms'],
            [COUNTS.places, 'ancient places'],
            [COUNTS.caverns, 'kinds of cavern'],
            [COUNTS.deeds, 'deeds to earn'],
          ].map(([n, label], i) => (
            <Reveal as="li" key={label} delay={i * 0.05}>
              <b>{n}</b>
              <span>{label}</span>
            </Reveal>
          ))}
        </ul>

        {/* ---------------------------------------------------------------- what it is */}
        <section className="fp-sec" id="bp-about">
          <Head n="01" label="The world" blocks={[B.GRASS, B.STONE, B.SAND]}>
            A planet, not a <em>map</em>
          </Head>
          <div className="cp-two">
            <Reveal className="cp-prose">
              {COPY.intro.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </Reveal>
            <Reveal delay={0.1} className="bp-side">
              <Frame shot={SHOTS.about} onOpen={open([SHOTS.about])} sizes="(max-width: 900px) 100vw, 40vw" />
            </Reveal>
          </div>
          <ul className="cp-three bp-rules">
            {COPY.rules.map(([t, text], i) => (
              <Reveal as="li" key={t} delay={(i % 3) * 0.08} className="cp-card-wrap">
                <Spot className="fp-card cp-note fp-px">
                  <small>Rule {i + 1}</small>
                  <h3>{t}</h3>
                  <p>{text}</p>
                </Spot>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------------- the lands */}
        <section className="fp-sec" id="bp-lands">
          <Head n="02" label="The lands" blocks={[B.GRASS, B.SNOW_BLOCK, B.SAND]}>
            A hundred and ten <em>biomes</em>
          </Head>
          <Reveal className="cp-intro">
            <p>
              The land comes in {COUNTS.families - 1} families, from meadows to coral seas. Each biome has its own ground, its own trees, its own animals, its own sky and its own sounds. How often you meet one depends on how rare it is.
            </p>
          </Reveal>
          <Reveal className="bp-rarity" delay={0.05}>
            <ol aria-label="How rare a biome is">
              {COPY.rarity.map(([name, text], i) => {
                const r = (['common', 'uncommon', 'rare', 'very_rare', 'legendary'] as const)[i];
                return (
                  <li key={name} className={rarityClass(r)}>
                    <b>
                      <i aria-hidden="true" />
                      {name}
                      <small>{counts[r]}</small>
                    </b>
                    <span>{text}</span>
                  </li>
                );
              })}
            </ol>
          </Reveal>

          <div className="bp-tabs" role="tablist" aria-label="Families of land">
            {FAMILIES.map((f) => (
              <button key={f} type="button" role="tab" id={`family-${f}`} aria-selected={f === family} className={f === family ? 'on' : ''} onClick={() => setFamily(f)}>
                {familyName(f)}
                <small>{biomesIn(f).length}</small>
              </button>
            ))}
          </div>
          <div className="bp-family" role="tabpanel" aria-labelledby={`family-${family}`} key={family}>
            <div className="bp-family-pics">
              <p className="bp-family-text">{COPY.families[family]}</p>
              <div className="bp-family-grid" data-n={Math.min(familyShots.length, 4)}>
                {familyShots.slice(0, 4).map((s) => (
                  <Frame key={s.file} shot={s} onOpen={open(familyShots)} sizes="(max-width: 900px) 100vw, 34vw" />
                ))}
              </div>
            </div>
            <ul className="bp-biomes" aria-label={familyName(family)}>
              {biomesIn(family).map((b) => (
                <li key={b.id} className={rarityClass(b.rarity)}>
                  <b>
                    <i aria-hidden="true" />
                    {b.name}
                  </b>
                  <em>{RARITY_LABEL[b.rarity]}</em>
                  <span>{b.desc}</span>
                </li>
              ))}
            </ul>
          </div>

          <Reveal className="cp-kit-head">
            <h3>More from the road</h3>
            <p>Captures from the game itself. Click one to see it large; the arrow keys move through them.</p>
          </Reveal>
          <ul className="bp-wall">
            {allShots.map((s, i) => (
              <Reveal as="li" key={s.file} delay={(i % 3) * 0.06}>
                <Frame shot={s} onOpen={open(allShots)} sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw" />
              </Reveal>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------------- the realms */}
        <section className="fp-sec" id="bp-realms">
          <Head n="03" label="Signature realms" blocks={[B.OBSIDIAN, B.DIAMOND_ORE, B.GLOWSTONE]}>
            Ten places found <em>nowhere else</em>
          </Head>
          <Reveal className="cp-intro">
            <p>
              Among the ordinary land lie ten realms, each a region of its own, hundreds of blocks across and unlike anything around it. They are all legendary. A seed has them scattered far apart, and not every one is near where you start, so finding the ten is a journey.
            </p>
          </Reveal>
          <ol className="bp-realms">
            {REALMS.map((r, i) => {
              const shots = SHOTS.realms[r.key] ?? [];
              return (
                <Reveal as="li" key={r.key} delay={0.04} className={i % 2 ? 'flip' : ''}>
                  <article className="bp-realm fp-card fp-px" id={`realm-${r.key}`}>
                    <div className="bp-realm-pics" data-n={Math.min(shots.length, 2)}>
                      {shots.slice(0, 2).map((s) => (
                        <Frame key={s.file} shot={s} onOpen={open(shots)} sizes="(max-width: 900px) 100vw, 40vw" />
                      ))}
                    </div>
                    <div className="bp-realm-text">
                      <small>Realm {i + 1}</small>
                      <h3>{r.name}</h3>
                      <p>{COPY.realms[r.key] ?? r.desc}</p>
                      <p className="bp-quote">{r.desc}</p>
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </ol>
        </section>

        {/* ---------------------------------------------------------------- the places */}
        <section className="fp-sec" id="bp-places">
          <Head n="04" label="Ancient places" blocks={[B.STONE_BRICKS, B.BOOKSHELF, B.GOLD_ORE]}>
            Ruins, temples and <em>old bones</em>
          </Head>
          <Reveal className="cp-intro">
            <p>
              Scattered over the land are {COUNTS.places} kinds of place: camps and standing stones, villages and crypts, temples, fortresses, libraries, giant statues, shipwrecks and reefs, and the bones of dragons. The rarer the place, the farther apart they are. What stands where depends on the biome: a desert temple is only ever in a desert, a lighthouse only on a coast. Most hold chests, and the rarest hold the best things.
            </p>
          </Reveal>
          <ul className="bp-wall bp-places-wall">
            {SHOTS.places.map((s, i) => (
              <Reveal as="li" key={s.file} delay={(i % 3) * 0.06}>
                <Frame shot={s} onOpen={open(SHOTS.places)} sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw" />
              </Reveal>
            ))}
          </ul>
          <Reveal className="cp-kit-head">
            <h3>Every kind of place</h3>
            <p>As the Codex lists them, from the commonest to the rarest.</p>
          </Reveal>
          <ul className="bp-place-list">
            {PLACES.map((p) => (
              <li key={p.key} className={rarityClass(p.rarity)}>
                <b>
                  <i aria-hidden="true" />
                  {p.name}
                </b>
                <em>{RARITY_LABEL[p.rarity]}</em>
                <span>{placeText(p.key)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------------- below */}
        <section className="fp-sec" id="bp-below">
          <Head n="05" label="Underground" blocks={[B.COAL_ORE, B.IRON_ORE, B.DIAMOND_ORE]}>
            The world <em>below</em>
          </Head>
          <ol className="cp-steps bp-layers">
            {COPY.layers.map(([t, where, text], i) => (
              <Reveal as="li" key={t} delay={i * 0.08}>
                <span className="n">{i + 1}</span>
                <h3>{t}</h3>
                <small>{where}</small>
                <p>{text}</p>
              </Reveal>
            ))}
          </ol>
          <Reveal className="cp-intro bp-rock">
            <p>{COPY.rock}</p>
          </Reveal>

          <Reveal className="cp-kit-head">
            <h3>Five kinds of cavern</h3>
            <p>Every one of them is a page in the Codex.</p>
          </Reveal>
          <ul className="bp-caves">
            {CAVES.map((c, i) => (
              <Reveal as="li" key={c} delay={(i % 2) * 0.08}>
                <article className="bp-cave fp-card fp-px">
                  {SHOTS.caves[c] && <Frame shot={SHOTS.caves[c]} onOpen={open(Object.values(SHOTS.caves))} sizes="(max-width: 900px) 100vw, 30vw" />}
                  <div>
                    <h4>{caveName(c)}</h4>
                    <p>{caveText(c)}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </ul>

          <Reveal className="cp-kit-head">
            <h3>Minerals found only here</h3>
            <p>Six ores that the overworld does not have. Where each is richest depends on the land above.</p>
          </Reveal>
          <ul className="bp-ores">
            {COPY.ores.map(([n, where], i) => (
              <Reveal as="li" key={n} delay={i * 0.05}>
                <b>{n}</b>
                <span>{where}</span>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------------- the air */}
        <section className="fp-sec" id="bp-air">
          <Head n="06" label="Sky and weather" blocks={[B.SNOW_BLOCK, B.GLOWSTONE, B.SAND]}>
            Air that <em>lives</em>
          </Head>
          <div className="cp-two bp-air-two">
            <ul className="bp-air-list">
              {COPY.air.map(([t, text], i) => (
                <Reveal as="li" key={t} delay={i * 0.07}>
                  <h3>{t}</h3>
                  <p>{text}</p>
                </Reveal>
              ))}
            </ul>
            <ul className="bp-air-pics">
              {SHOTS.air.map((s, i) => (
                <Reveal as="li" key={s.file} delay={(i % 2) * 0.08}>
                  <Frame shot={s} onOpen={open(SHOTS.air)} sizes="(max-width: 900px) 100vw, 30vw" />
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------------- the Codex */}
        <section className="fp-sec" id="bp-codex">
          <Head n="07" label="The Codex" blocks={[B.BOOKSHELF, B.PLANKS, B.GLOWSTONE]}>
            A book that <em>fills</em> as you go
          </Head>
          <div className="cp-two">
            <Reveal className="cp-prose">
              <p>{COPY.codex}</p>
              <p>It has four tabs: Biomes, Places, Caverns and Deeds. What you have not found yet shows as three question marks. Finding it fills the line in, with a few words about the place.</p>
            </Reveal>
            <Reveal delay={0.1} className="bp-side">
              <Frame shot={SHOTS.codex} onOpen={open([SHOTS.codex])} sizes="(max-width: 900px) 100vw, 40vw" />
            </Reveal>
          </div>
          <Reveal className="cp-kit-head">
            <h3>{COUNTS.deeds} deeds</h3>
            <p>Each one unlocks by itself as you explore.</p>
          </Reveal>
          <ul className="bp-deeds">
            {DEEDS.map((d, i) => (
              <Reveal as="li" key={d.id} delay={(i % 4) * 0.04}>
                <b>{d.name}</b>
                <span>{d.desc}</span>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------------- start */}
        <section className="fp-sec" id="bp-start">
          <Head n="08" label="How to begin" blocks={[B.PLANKS, B.GRASS, B.DIAMOND_ORE]}>
            Three steps to the <em>edge</em>
          </Head>
          <ol className="cp-steps">
            {COPY.start.map(([t, text], i) => (
              <Reveal as="li" key={t} delay={i * 0.08}>
                <span className="n">{i + 1}</span>
                <h3>{t}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </ol>
          <Reveal className="bp-link">
            <p>
              Already know the seed? Open <code>/?world=beyond&amp;seed=1</code> and change the number. A server can run the World Beyond for everyone in it too.
            </p>
          </Reveal>
        </section>

        <section className="fp-sec fp-end">
          <Reveal>
            <div className="fp-pile">
              <Blocks ids={[B.GRASS, B.DIAMOND_ORE, B.PLANKS, B.GLOWSTONE, B.STONE]} size={72} />
            </div>
            <h2>
              Walk off the <em>map</em>
            </h2>
            <p>Free in your browser. Walk in as a guest, or sign in with a wallet and keep your champion.</p>
            <span className="fp-glow">
              <button className="fp-play fp-px" onClick={play}>
                <span>
                  <i aria-hidden="true" />
                  Enter the Beyond
                </span>
              </button>
            </span>
          </Reveal>
        </section>

        <footer className="fp-foot" data-no-play>
          <b>SolRift</b>
          <span>
            A voxel world in your browser, powered by Solana. Version {GAME_VERSION}.
          </span>
        </footer>
      </main>
    </div>
  );
}
