'use client';

import { useState } from 'react';
import {
  BEYOND_ACHIEVEMENTS,
  BEYOND_BIOME_COUNT,
  BIOME_RARITY_NAMES,
  CAVE_ECO_NAMES,
  FAMILY_NAMES,
  STRUCTURES,
  beyondBiome,
  biomesOfFamily,
  caveDiscovery,
  codexPage,
  structureDiscovery,
  type BiomeFamily,
  type CaveEco,
  type StructureKey,
} from '@solrift/shared';
import { useUi } from '../ui/store';
import './social.css';
import './codex.css';

type Tab = 'biomes' | 'places' | 'caves' | 'deeds';

const FAMILY_ORDER = Object.keys(FAMILY_NAMES) as BiomeFamily[];
const STRUCTURE_KEYS = Object.keys(STRUCTURES) as StructureKey[];
const CAVE_KEYS = (Object.keys(CAVE_ECO_NAMES) as CaveEco[]).filter((k) => k !== 'none');

/** One line of the book: a name and what is known of it, or a question mark for what has not been found. */
function Entry({ found, name, rarity, text, here, children }: { found: boolean; name: string; rarity: string; text: string; here?: boolean; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`soc-row codex-row${found ? '' : ' unknown'}${here ? ' here' : ''}`} data-found={found} onClick={() => found && children && setOpen(!open)}>
      <div className="codex-head">
        <b className="codex-name">{found ? name : '???'}</b>
        <span className={`codex-rarity r-${rarity.toLowerCase().replace(' ', '-')}`}>{found ? rarity : ''}</span>
        {here && <span className="codex-here">you are here</span>}
      </div>
      <div className="codex-text">{found ? text : 'Not found yet.'}</div>
      {found && open && children}
    </div>
  );
}

function BiomeDetail({ id }: { id: number }) {
  const page = codexPage(id);
  if (!page) return null;
  return (
    <div className="codex-detail">
      {page.wildlife.length > 0 && (
        <p>
          <b>Creatures:</b> {page.wildlife.join(', ').replace(/_/g, ' ')}
        </p>
      )}
      {page.lore.length > 0 && (
        <p>
          <b>Lore:</b> {page.lore.join(', ')}
        </p>
      )}
      {page.structures.length > 0 && (
        <p>
          <b>Places:</b> {page.structures.join(', ')}
        </p>
      )}
      <p>
        <b>Air:</b> {page.atmosphere.replace(/_/g, ' ')}
      </p>
    </div>
  );
}

/** The Codex window (B): everything found in the World Beyond so far. */
function CodexWindow() {
  const open = useUi((s) => s.codexOpen);
  const codex = useUi((s) => s.codex);
  const api = useUi((s) => s.api);
  const [tab, setTab] = useState<Tab>('biomes');
  if (!open || !codex || !api) return null;
  const biomes = new Set(codex.biomes);
  const places = new Set(codex.structures);
  const caves = new Set(codex.caves);
  const deeds = new Set(codex.achievements);
  const tabs: { id: Tab; label: string; n: string }[] = [
    { id: 'biomes', label: 'Biomes', n: `${biomes.size}/${BEYOND_BIOME_COUNT}` },
    { id: 'places', label: 'Places', n: `${places.size}/${STRUCTURE_KEYS.length}` },
    { id: 'caves', label: 'Caverns', n: `${caves.size}/${CAVE_KEYS.length}` },
    { id: 'deeds', label: 'Deeds', n: `${deeds.size}/${BEYOND_ACHIEVEMENTS.length}` },
  ];
  const here = beyondBiome(codex.here);

  return (
    <div id="codex-window" data-testid="codex-window" onContextMenu={(e) => e.preventDefault()}>
      <div className="log-card party-card soc-card codex-card">
        <div className="title">Codex of the Beyond</div>
        <button className="wow-close" onClick={() => api.toggleCodex(false)} aria-label="Close">
          &times;
        </button>
        <div className="codex-where">{here ? `You are in ${here.name}.` : ''}</div>
        <div className="soc-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} data-tab={t.id} className={`soc-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label} <i>{t.n}</i>
            </button>
          ))}
        </div>
        <div className="soc-body codex-body">
          {tab === 'biomes' &&
            FAMILY_ORDER.map((f) => (
              <section key={f}>
                <h3 className="codex-family">
                  {FAMILY_NAMES[f]} <i>{biomesOfFamily(f).filter((b) => biomes.has(b.id)).length}/{biomesOfFamily(f).length}</i>
                </h3>
                {biomesOfFamily(f).map((b) => (
                  <Entry key={b.id} found={biomes.has(b.id)} name={b.name} rarity={BIOME_RARITY_NAMES[b.rarity]} text={b.desc} here={b.id === codex.here}>
                    <BiomeDetail id={b.id} />
                  </Entry>
                ))}
              </section>
            ))}
          {tab === 'places' &&
            STRUCTURE_KEYS.map((k) => {
              const d = structureDiscovery(k);
              return <Entry key={k} found={places.has(k)} name={d.name} rarity={BIOME_RARITY_NAMES[STRUCTURES[k].rarity]} text={d.desc} />;
            })}
          {tab === 'caves' &&
            CAVE_KEYS.map((k) => {
              const d = caveDiscovery(k)!;
              return <Entry key={k} found={caves.has(k)} name={d.name} rarity={BIOME_RARITY_NAMES[d.rarity]} text={d.desc} />;
            })}
          {tab === 'deeds' &&
            BEYOND_ACHIEVEMENTS.map((a) => (
              <div key={a.id} className={`soc-row codex-row${deeds.has(a.id) ? ' done' : ' unknown'}`} data-found={deeds.has(a.id)}>
                <div className="codex-head">
                  <b className="codex-name">{deeds.has(a.id) ? a.name : '???'}</b>
                </div>
                <div className="codex-text">{a.desc}</div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

/** Finds and achievements slide in at the top for a few seconds. */
function BeyondNotes() {
  const notes = useUi((s) => s.beyondNotes);
  if (notes.length === 0) return null;
  return (
    <div id="beyond-notes" data-testid="beyond-notes">
      {notes.map((n) => (
        <div key={n.key} className={`beyond-note ${n.kind}`}>
          <span className="bn-kind">{n.kind === 'achievement' ? 'Achievement' : 'Discovered'}</span>
          <b className="bn-title">{n.title}</b>
          <span className="bn-text">{n.text}</span>
        </div>
      ))}
    </div>
  );
}

export function CodexUI() {
  const active = useUi((s) => s.codex !== null);
  if (!active) return null;
  return (
    <>
      <BeyondNotes />
      <CodexWindow />
    </>
  );
}

