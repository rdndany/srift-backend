'use client';

import { B, CLASSES, abilityCost, CLASS_IDS, CLASS_LEVELS, GAME_VERSION, abilitiesOf, getItem, outfitItems, skillBookId, type AbilityDef, type ClassId } from '@solrift/shared';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AbilityIcon } from './AbilityIcon';
import { AccountPanel } from './AccountPanel';
import { Blocks } from './BlockCube';
import { CharacterPreview } from './CharacterPreview';
import { ABILITY_GUIDE, ABILITY_KEY_LABELS, GUIDE, LEVEL_GAINS, abilityFacts, bookPrice, itemTitle, num, statRows, unlockSteps } from './classGuide';
import { ClickSparks, Embers, Reveal, Spot, useFrontMotion } from './fx';
import { lobbyUrl } from '../game/route';
import { SCROLL_KEY, goMarket } from './frontNav';
import { ART } from './homeAssets';
import { ItemSprite } from './ItemSprite';
import type { HomeMode } from './modes';
import { WayDialog, type Way } from './WayDialog';
import './home.css';
import './front.css';
import './classPage.css';

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

const KIND_LABEL = { melee: 'Melee damage', ranged: 'Ranged damage', spell: 'Spell damage' } as const;

/** Goes to a part of the front page (its menu leads there too). */
const toFront = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(SCROLL_KEY, id);
  } catch {
    /* no storage: the page just opens at the top */
  }
  location.assign('/');
};

/** One ability, in full: what it is, its numbers, what it is for, a tip and where to get its book. */
function AbilityCard({ a, i, color }: { a: AbilityDef; i: number; color: string }) {
  const cls = CLASSES[a.classId];
  const guide = ABILITY_GUIDE[a.id];
  const facts = abilityFacts(a);
  return (
    <Reveal as="article" className="cp-ab-wrap" delay={(i % 2) * 0.08}>
      <Spot className="fp-card cp-ab fp-px" style={{ '--c': color } as CSSProperties}>
        <header className="cp-ab-head" id={`ability-${a.id}`}>
          <span className="cp-ab-icon">
            <AbilityIcon id={a.id} size={52} />
            <kbd title={`Press ${ABILITY_KEY_LABELS[a.slot]} to cast`}>{ABILITY_KEY_LABELS[a.slot]}</kbd>
          </span>
          <div>
            <small>
              Ability {i + 1} &middot; key {ABILITY_KEY_LABELS[a.slot]}
            </small>
            <h3>{a.name}</h3>
          </div>
        </header>
        <ul className="cp-chips" aria-label={`${a.name} at a glance`}>
          <li className="lv">Level {a.unlockLevel}</li>
          <li style={{ '--r': cls.resource.color } as CSSProperties} className="cost">
            {abilityCost(a.cost)} {cls.resource.name}
          </li>
          <li>{num(a.cooldown)} s cooldown</li>
          <li>{a.effect.t === 'guard' ? 'Defense' : KIND_LABEL[a.kind]}</li>
        </ul>
        <p className="cp-ab-desc">{a.description}</p>
        <p className="cp-ab-use">{guide.use}</p>
        <dl className="cp-facts">
          {facts.map((f, k) => (
            <div key={`${f.label}${k}`}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
        <p className="cp-ab-tip">
          <b>Tip</b>
          {guide.tip}
        </p>
        <p className="cp-ab-book">
          <ItemSprite id={skillBookId(a.id)} size={28} />
          <span>
            <b>Skill book</b>
            Sold by the merchants of Dawnwatch for {bookPrice(a.id)} Auren. Monsters drop it now and then, and quests give it out.
          </span>
        </p>
      </Spot>
    </Reveal>
  );
}

/** `/classes/<id>`: a page for one class: who it is, how it plays, and every ability in detail. */
export function ClassPage({ id }: { id: ClassId }) {
  const root = useRef<HTMLDivElement>(null);
  const [asking, setAsking] = useState(false);
  useFrontMotion(root);
  const c = CLASSES[id];
  const guide = GUIDE[id];
  const abilities = abilitiesOf(id);
  const rows = statRows(id);
  const steps = unlockSteps(id);
  const others = CLASS_IDS.filter((x) => x !== id);
  const scrollTo = (to: string) => document.getElementById(to)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // The page opens at the top, whatever the last page was scrolled to.
  useEffect(() => {
    document.getElementById('home-layer')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [id]);

  const play = (way: Way, mode: HomeMode | null) => {
    void import('./GameLobby').then(({ saveLobbyChoice }) => {
      saveLobbyChoice({ way, mode: mode ?? 'survival' });
      location.assign(lobbyUrl({ way, mode: mode ?? 'survival' }));
    });
  };

  return (
    <div className="fp cp" ref={root} style={{ '--c': c.color } as CSSProperties} data-class={id}>
      <ClickSparks />
      {asking && <WayDialog mode={null} onDone={play} onClose={() => setAsking(false)} />}

      <div className="fp-rail" data-no-play>
        <button className="fp-brand" onClick={() => toFront(null)} aria-label="SolRift, to the front page"><img src="/art/solrift-token-logo.png" alt="SolRift" draggable={false} /></button>
          <header className="fp-nav fp-px">
          <span className="fp-brand-gap" aria-hidden="true" />
          <nav className="site-nav fp-links" aria-label="Menu">
            <button className="fp-link-play" onClick={() => setAsking(true)}>
              Play
            </button>
            <button onClick={() => toFront('site-world')}>The World</button>
            <button onClick={() => toFront('site-features')}>Classes</button>
            <button onClick={() => toFront('l-expansions')}>Expansions</button>
            <button className="fp-link-market" onClick={goMarket}>Market</button>
          </nav>
          <div className="fp-account">
            <AccountPanel />
          </div>
          <i className="fp-progress" aria-hidden="true" />
        </header>
      </div>

      {/* ------------------------------------------------------------------ the class */}
      <section className="cp-hero" id="cp-top">
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
                  toFront('site-features');
                }}
              >
                Classes
              </a>
              <span aria-hidden="true">/</span>
              <b>{c.name}</b>
            </nav>
            <p className="cp-role">{c.role}</p>
            <h1 className="cp-name" id="class-name">
              {c.name}
            </h1>
            <p className="cp-tagline">{c.tagline}</p>
            <p className="cp-lead">{c.description}</p>
            <ul className="cp-badges">
              <li style={{ '--r': c.resource.color } as CSSProperties}>
                <i aria-hidden="true" />
                {c.resource.name}
              </li>
              <li>{abilities.length} abilities</li>
              <li>Up to level {CLASS_LEVELS.max}</li>
            </ul>
            <div className="cp-actions">
              <span className="fp-glow">
                <button className="fp-play fp-px" id="class-play" onClick={() => setAsking(true)}>
                  <span>
                    <i aria-hidden="true" />
                    Play as {c.name}
                  </span>
                </button>
              </span>
              <button className="fp-ghost fp-px" onClick={() => scrollTo('cp-abilities')}>
                <span>The abilities</span>
              </button>
            </div>
          </div>
          <figure className="cp-stage" aria-label={`A ${c.name} in the clothes of the class`}>
            <i className="cp-aura" aria-hidden="true" />
            <CharacterPreview armor={outfitItems(id)} grounded turntable />
            <figcaption>Drag to turn</figcaption>
          </figure>
        </div>
        <ul className="cp-jump" aria-label="On this page">
          {[
            ['cp-about', 'The class'],
            ['cp-play', 'How it plays'],
            ['cp-abilities', 'Abilities'],
            ['cp-stats', 'The numbers'],
            ['cp-learn', 'Learning them'],
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

        {/* ---------------------------------------------------------------- who */}
        <section className="fp-sec" id="cp-about">
          <Head n="01" label="The class" blocks={[B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE]}>
            Who the <em>{c.name}</em> is
          </Head>
          <div className="cp-two">
            <Reveal className="cp-prose">
              {guide.intro.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </Reveal>
            <Reveal delay={0.1} className="cp-pros">
              <section className="cp-list good">
                <h3>Strengths</h3>
                <ul>
                  {c.strengths.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </section>
              <section className="cp-list bad">
                <h3>Weaknesses</h3>
                <ul>
                  {c.weaknesses.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </section>
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------------------------- how it plays */}
        <section className="fp-sec" id="cp-play">
          <Head n="02" label="Playstyle" blocks={[B.FURNACE, B.CRAFTING_TABLE, B.BOOKSHELF]}>
            How the <em>class</em> plays
          </Head>
          <div className="cp-three">
            <Reveal as="article" className="cp-card-wrap">
              <Spot className="fp-card cp-note fp-px">
                <small>Your attack</small>
                <h3>{guide.basic.title}</h3>
                <p>{guide.basic.text}</p>
              </Spot>
            </Reveal>
            <Reveal as="article" delay={0.08} className="cp-card-wrap">
              <Spot className="fp-card cp-note fp-px">
                <small>Your resource</small>
                <h3 className="cp-res">
                  <i style={{ background: c.resource.color }} aria-hidden="true" />
                  {c.resource.name}
                </h3>
                <p>{guide.resource}</p>
              </Spot>
            </Reveal>
            <Reveal as="article" delay={0.16} className="cp-card-wrap">
              <Spot className="fp-card cp-note fp-px">
                <small>In a party</small>
                <h3>Your place</h3>
                <p>{guide.party}</p>
              </Spot>
            </Reveal>
          </div>
          <Reveal className="cp-kit-head">
            <h3>You start with</h3>
            <p>Every new {c.name} gets this, and a class never stops anyone from using any other item.</p>
          </Reveal>
          <ul className="cp-kit">
            {c.startingKit.map((k, i) => (
              <Reveal as="li" key={k.id} delay={i * 0.07}>
                <ItemSprite id={k.id} size={44} />
                <span>
                  <b>
                    {itemTitle(getItem(k.id).name)}
                    {k.count > 1 ? ` x${k.count}` : ''}
                  </b>
                  {guide.kit[i]}
                </span>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------------- abilities */}
        <section className="fp-sec" id="cp-abilities">
          <Head n="03" label="Abilities" blocks={[B.OBSIDIAN, B.GLOWSTONE, B.TNT]}>
            Every <em>ability</em>
          </Head>
          <Reveal className="cp-intro">
            <p>
              A new {c.name} knows none of them. Each ability is learned from its skill book (see below), and then it sits on a key of the ability bar: <kbd>Z</kbd> <kbd>X</kbd> <kbd>C</kbd> <kbd>G</kbd>. Damage is shown before and after the {c.name}&rsquo;s own bonus; a zombie has 20 health, a skeleton 20 and a spider 16.
            </p>
          </Reveal>
          <ul className="cp-ab-nav" aria-label="Jump to an ability">
            {abilities.map((a) => (
              <li key={a.id}>
                <button onClick={() => scrollTo(`ability-${a.id}`)}>
                  <AbilityIcon id={a.id} size={26} />
                  {a.name}
                </button>
              </li>
            ))}
          </ul>
          <div className="cp-abs">
            {abilities.map((a, i) => (
              <AbilityCard key={a.id} a={a} i={i} color={c.color} />
            ))}
          </div>

          <Reveal className="cp-kit-head">
            <h3>Put them together</h3>
            <p>An ability is good on its own and better after another one.</p>
          </Reveal>
          <ul className="cp-combos">
            {guide.combos.map((combo, i) => (
              <Reveal as="li" key={combo.name} delay={i * 0.1}>
                <h4>{combo.name}</h4>
                <ol aria-label={`${combo.name}: the order`}>
                  {combo.steps.map((s, k) => {
                    const def = abilities.find((x) => x.id === s);
                    return def ? (
                      <li key={`${s}${k}`}>
                        <AbilityIcon id={s} size={32} />
                        <span>{def.name}</span>
                      </li>
                    ) : null;
                  })}
                </ol>
                <p>{combo.text}</p>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------------- numbers */}
        <section className="fp-sec" id="cp-stats">
          <Head n="04" label="The numbers" blocks={[B.STONE_BRICKS, B.GOLD_ORE]}>
            The <em>{c.name}</em> in numbers
          </Head>
          <div className="cp-two">
            <Reveal className="cp-stats">
              <ul>
                {rows.map((r) => (
                  <li key={r.key} data-stat={r.key}>
                    <span className="n">
                      {r.label}
                      <small>{r.note}</small>
                    </span>
                    <i>
                      <b style={{ '--w': `${Math.round(Math.max(0.06, Math.min(1, r.fill)) * 100)}%` } as CSSProperties} />
                    </i>
                    <em>
                      {r.start}
                      {r.cap ? <small>level {CLASS_LEVELS.max}: {r.cap}</small> : null}
                    </em>
                  </li>
                ))}
              </ul>
              <p className="cp-foot">Bars compare the three classes at level 1. Damage figures are a share of the weapon&rsquo;s own damage (100% is the weapon as it comes).</p>
            </Reveal>
            <Reveal delay={0.1} className="cp-grow">
              <section className="cp-list">
                <h3>Every class level adds</h3>
                <ul className="cp-gains">
                  {LEVEL_GAINS.map((g) => (
                    <li key={g.label}>
                      <span>{g.label}</span>
                      <b>{g.value}</b>
                    </li>
                  ))}
                </ul>
                <p>
                  The class level goes up with kills and quests, and tops out at {CLASS_LEVELS.max}. It is separate from the experience level of the world.
                </p>
              </section>
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------------------------- learning */}
        <section className="fp-sec" id="cp-learn">
          <Head n="05" label="Learning them" blocks={[B.BOOKSHELF, B.PLANKS, B.GRASS]}>
            Where abilities <em>come from</em>
          </Head>
          <ol className="cp-steps">
            {[
              ['Find the book', 'Every ability has its own skill book. Merchants in Dawnwatch sell them, monsters drop them now and then, and quests hand them out. Only the book of your own class can be learned.'],
              ['Read it', 'Right-click the book. It is learned only if your class level is high enough (its level is on the card above). A book you cannot read yet is kept, not lost.'],
              ['Cast it', 'The ability goes onto the bar. Press Z, X, C or G to cast it, as long as you have the resource and it is off cooldown.'],
            ].map(([t, text], i) => (
              <Reveal as="li" key={t} delay={i * 0.08}>
                <span className="n">{i + 1}</span>
                <h3>{t}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </ol>
          <Reveal className="cp-kit-head">
            <h3>When you can learn what</h3>
          </Reveal>
          <ol className="cp-ladder">
            {steps.map((s, i) => (
              <Reveal as="li" key={s.level} delay={i * 0.08}>
                <span className="lv">
                  <small>Level</small>
                  {s.level}
                </span>
                <span className="who">
                  {s.abilities.map((a) => (
                    <button key={a.id} onClick={() => scrollTo(`ability-${a.id}`)}>
                      <AbilityIcon id={a.id} size={30} />
                      <span>{a.name}</span>
                    </button>
                  ))}
                </span>
              </Reveal>
            ))}
          </ol>
          <Reveal className="cp-kit-head">
            <h3>Tips from the field</h3>
          </Reveal>
          <ul className="cp-tips">
            {guide.tips.map((t, i) => (
              <Reveal as="li" key={t} delay={(i % 2) * 0.08}>
                {t}
              </Reveal>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------------- the other classes */}
        <section className="fp-sec" id="cp-others">
          <Head n="06" label="The other classes" blocks={[B.IRON_ORE, B.DIAMOND_ORE]}>
            Not <em>this one</em>?
          </Head>
          <ul className="cp-others">
            {others.map((o, i) => {
              const oc = CLASSES[o];
              return (
                <Reveal as="li" key={o} delay={i * 0.1}>
                  <a className="cp-other" href={`/classes/${o}`} style={{ '--c': oc.color } as CSSProperties}>
                    <span className="medal">
                      <ItemSprite id={oc.startingWeapon} size={40} />
                    </span>
                    <span className="txt">
                      <b>{oc.name}</b>
                      <em>{oc.tagline}</em>
                      <small>{oc.role}</small>
                    </span>
                    <span className="go" aria-hidden="true">
                      &rarr;
                    </span>
                  </a>
                </Reveal>
              );
            })}
          </ul>
        </section>

        <section className="fp-sec fp-end">
          <Reveal>
            <div className="fp-pile">
              <Blocks ids={[B.GRASS, B.DIAMOND_ORE, B.PLANKS, B.GLOWSTONE, B.STONE]} size={72} />
            </div>
            <h2>
              Take up the <em>{c.name === 'Mage' ? 'wand' : c.name === 'Ranger' ? 'bow' : 'sword'}</em>
            </h2>
            <p>Free in your browser. Walk in as a guest, or sign in with a wallet and keep your champion.</p>
            <span className="fp-glow">
              <button className="fp-play fp-px" onClick={() => setAsking(true)}>
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
          <span>
            A voxel world in your browser, powered by Solana. Version {GAME_VERSION}.
          </span>
        </footer>
      </main>
    </div>
  );
}
