'use client';

import { WalletLinks } from './WalletLinks';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import {
  B,
  CLASSES,
  CLASS_IDS,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLE_NAMES,
  NPCS,
  PANTS_COLORS,
  QUESTS,
  SHIRT_COLORS,
  SKIN_TONES,
  CURRENCY,
  cleanPlayerName,
  companionIndex,
  companionOfItem,
  wingNumberOf,
  MAX_DEFENSE,
  computeStats,
  formatCoins,
  getItem,
  lobbyStats,
  wornDefense,
  lookCode,
  lookOfCode,
  newCharacterSheet,
  blankCharacterSheet,
  outfitItems,
  playerNameProblem,
  randomLook,
  sheetOfSave,
  toolId,
  type CharacterLook,
  type CharacterSheet as SheetData,
  type StashView,
  type CharacterBrief,
  type ClassId,
  type LookPart,
} from '@solrift/shared';
import { shortAddress, useAuth } from '../auth/store';
import { hydrateProfile, useProfile } from '../profile/store';
import { LocalSaveStore, type SavedWorld } from '../game/storage';
import { AccountPanel } from './AccountPanel';
import { TokenShop } from './TokenWallet';
import { BlockCube } from './BlockCube';
import { CharacterPreview } from './CharacterPreview';
import { CharacterSheet } from './CharacterSheet';
import { LobbyDesk } from './CampHero';
import { RealmChat } from './CampChat';
import { ClassSkills } from './ClassSkills';
import { statLines } from './ClassPicker';
import { ClickSparks, Embers, useFrontMotion } from './fx';
import { FRONT_MENU, SCROLL_KEY, frontUrl, goBeyond, goMarket, goToken, goFarm, goShop, goRanks } from './frontNav';
import { HANDOFF_KEYS, siteUrl, whereAmI } from '../game/route';
import { ART } from './homeAssets';
import { ItemSprite } from './ItemSprite';
import { CoinIcon } from './ShopUI';
import { MODES, modeInfo, modeOfSave, parseSeed, timeAgo, type HomeMode } from './modes';
import { serverUrl, useRealmStatus } from './realmStatus';
import type { Way } from './WayDialog';
import './front.css';
import './lobby.css';
import './campPage.css';
import './responsive.css';

/** What the lobby hands to the game: a world of your own, or the shared realm. */
export type PlayTarget = { kind: 'single'; seed: number; mode: HomeMode; world?: 'beyond' | 'isle' } | { kind: 'multi' };

type Who = 'guest' | 'wallet';

/** What PLAY's dialog on the front page chose (kept in the session, so that the game page has a plain address). */
const CHOICE_KEY = 'solrift-lobby';
export interface LobbyChoice {
  way: Way;
  mode: HomeMode;
  /** Which world a single-player game starts in, when the page that sent the player asked for one (the World Beyond's page does). */
  world?: 'beyond' | 'isle';
}
/** The one character of island survival, kept on this device and never mixed with a multiplayer hero. */
const ISLE_HERO = 'solrift-isle-hero';
function readIsleHero(): { name: string; look: number } | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = JSON.parse(localStorage.getItem(ISLE_HERO) ?? 'null') as { name?: unknown; look?: unknown } | null;
    if (!raw || typeof raw.name !== 'string' || typeof raw.look !== 'number') return null;
    const name = cleanPlayerName(raw.name);
    return name ? { name, look: raw.look } : null;
  } catch {
    return null;
  }
}
function writeIsleHero(hero: { name: string; look: number }): void {
  try {
    localStorage.setItem(ISLE_HERO, JSON.stringify(hero));
  } catch {
    /* storage blocked: the character lasts for this visit */
  }
}

export function saveLobbyChoice(c: LobbyChoice): void {
  try {
    sessionStorage.setItem(CHOICE_KEY, JSON.stringify(c));
  } catch {
    /* no storage: the lobby starts with single player and Survival */
  }
}
function readLobbyChoice(): LobbyChoice {
  try {
    // The website is on another host, so what PLAY chose there comes in the address (`?way=multi&mode=survival`): keep it in the session, then hide it.
    const q = new URLSearchParams(location.search);
    if (q.has('way')) {
      const way: Way = q.get('way') === 'multi' ? 'multi' : 'single';
      const mode = MODES.find((m) => m.id === q.get('mode'))?.id ?? 'survival';
      const picked = q.get('world');
      const world = picked === 'beyond' || picked === 'isle' ? picked : undefined;
      const choice: LobbyChoice = { way, mode, ...(world ? { world } : {}) };
      saveLobbyChoice(choice);
      for (const k of HANDOFF_KEYS) q.delete(k);
      history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}${location.hash}`);
      return choice;
    }
  } catch {
    /* no address to read: the session has it */
  }
  try {
    const raw = JSON.parse(sessionStorage.getItem(CHOICE_KEY) ?? 'null');
    const world = raw?.world === 'beyond' || raw?.world === 'isle' ? raw.world : undefined;
    return { way: raw?.way === 'multi' ? 'multi' : 'single', mode: MODES.find((m) => m.id === raw?.mode)?.id ?? 'survival', ...(world ? { world } : {}) };
  } catch {
    return { way: 'single', mode: 'survival' };
  }
}


/** Put a saved character on the page: its name and look are what the preview and the game use. */
function showCharacter(c: { displayName: string; look: number; outfit?: string | null }): void {
  useProfile.setState({ name: c.displayName });
  useProfile.getState().replaceLook(lookOfCode(c.look));
  useProfile.getState().setOutfit(c.outfit ?? null);
}

/** Marks a scrolling column with data-more="1" while there is more of it below what shows, so that its foot can fade out and say so. */
function useMoreBelow(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const more = el.scrollHeight - el.scrollTop - el.clientHeight > 8 ? '1' : '0';
      if (el.dataset.more !== more) el.dataset.more = more; // (only a change: the observer below watches attributes too)
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const resize = new ResizeObserver(check);
    resize.observe(el);
    const change = new MutationObserver(check);
    change.observe(el, { childList: true, subtree: true, attributes: true });
    window.addEventListener('resize', check);
    return () => {
      el.removeEventListener('scroll', check);
      resize.disconnect();
      change.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [ref]);
}

/** A step of making a character: its number, which turns into a tick once it is done. */
function Step({ n, done, htmlFor, children }: { n: number; done: boolean; htmlFor?: string; children: React.ReactNode }) {
  return (
    <label className={`gp-step ${done ? 'done' : ''}`} htmlFor={htmlFor} data-step={n}>
      <i aria-hidden="true">{done ? '\u2713' : n}</i>
      {children}
    </label>
  );
}

/** One row of colour swatches (or labelled buttons) for a part of the character. */
function Choice({
  part,
  title,
  count,
  label,
  color,
  look,
  onPick,
}: {
  part: LookPart;
  title: string;
  count: number;
  label?: (i: number) => string;
  color?: (i: number) => string;
  look: CharacterLook;
  onPick: (i: number) => void;
}) {
  return (
    <div className="lb-row" data-part={part}>
      <h3>{title}</h3>
      <div className="lb-swatches">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`${color ? 'swatch' : 'pill'} ${look[part] === i ? 'on' : ''}`}
            data-index={i}
            aria-pressed={look[part] === i}
            aria-label={label ? label(i) : `${title} ${i + 1}`}
            title={label ? label(i) : undefined}
            style={color ? { background: color(i) } : undefined}
            onClick={() => onPick(i)}
          >
            {!color && label ? label(i) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The health bar uses the same total as the stats, so a piece that adds health moves it. A full bar stays full. */
function withWornHealth(sheet: SheetData): SheetData {
  const stats = lobbyStats(sheet);
  if (!stats) return sheet;
  const maxHealth = Math.round(stats.maxHealth);
  if (maxHealth === sheet.maxHealth) return sheet;
  const full = sheet.health >= sheet.maxHealth;
  return { ...sheet, maxHealth, health: full ? maxHealth : Math.min(sheet.health, maxHealth) };
}

/** What a class is good at. For a saved character the bars follow the level, the points and everything worn and held; while a class is being chosen they are the class on its own. */
function HeroStats({ id, sheet }: { id: ClassId; sheet?: SheetData | null }) {
  const def = CLASSES[id];
  const own = sheet?.cls?.id === id ? sheet : null;
  const stats = own ? lobbyStats(own)! : computeStats(id, 1);
  const lines = statLines(stats, def.resource.name);
  const fill = (k: string): number => lines.find((l) => l.key === k)?.fill ?? 0;
  const kinds = (['melee', 'ranged', 'spell'] as const).map((k) => ({ k, fill: fill(k), value: stats.damage[k] })).sort((a, b) => b.fill - a.fill);
  const best = kinds[0];
  const rows = [
    { key: 'health', label: 'Health', fill: fill('health'), value: `${Math.round(stats.maxHealth)}` },
    { key: 'damage', label: `${best.k[0].toUpperCase()}${best.k.slice(1)} damage`, fill: best.fill, value: `x${best.value.toFixed(2).replace(/0$/, '')}` },
    { key: 'defense', label: 'Defense', fill: fill('defense'), value: `${Math.round((1 - stats.damageTaken) * 100)}%` },
    { key: 'speed', label: 'Speed', fill: fill('speed'), value: `x${stats.moveSpeed.toFixed(2).replace(/0$/, '')}` },
    { key: 'resource', label: def.resource.name, fill: fill('resource'), value: `${Math.round(stats.maxResource)}` },
  ];
  if (own) {
    const armor = wornDefense(own.armor);
    rows.splice(3, 0, { key: 'armor', label: 'Armor', fill: armor / MAX_DEFENSE, value: `${armor}/${MAX_DEFENSE}` });
  }
  return (
    <div className="gp-stats" id="hero-stats">
      {rows.map((r) => (
        <div key={r.key} className="gp-stat" data-stat={r.key}>
          <span>{r.label}</span>
          <i>
            <b style={{ width: `${Math.max(0.06, Math.min(1, r.fill)) * 100}%` }} />
          </i>
          <em>{r.value}</em>
        </div>
      ))}
    </div>
  );
}

/** The one multiplayer realm: the Adventure world, with its village, quests and dungeon. */
function RealmPill() {
  const { status, players, max } = useRealmStatus(serverUrl);
  const full = players !== null && max !== null && players >= max;
  const label = full ? `Full ${players}/${max}` : status === 'online' && players !== null ? `Online ${players}${max ? ` / ${max}` : ''}` : { checking: 'Checking...', online: 'Online', offline: 'Offline' }[status];
  return (
    <div className="gp-ctrl gp-realm" id="multi-panel">
      <h3>Dawnwatch</h3>
      <span className={`lb-status ${status}`}>
        <i /> {label}
      </span>
      {status === 'offline' && <p className="lb-warn">The server did not answer. You can still try to join.</p>}
    </div>
  );
}

/** What the realm is about, under the character. */
function RealmAbout() {
  // Open where there is room for it (not known while the page is built on the server: closed after the first paint on a short screen).
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (window.innerHeight < 1040) setOpen(false);
  }, []);
  return (
    <details className="gp-block gp-about" open={open}>
      <summary>Embers of the Hollow King &middot; preview</summary>
      <div id="adventure-about">
        <p>
          You wake with nothing in a cave under the small village of Ashbrook. Climb out, meet {NPCS.filter((n) => !n.dungeon).length} villagers, take up {QUESTS.length} quests that teach you the whole game, walk the road to the city of Dawnwatch, follow it on through five outposts and a castle in the World Beyond, and clear the Hollow Cellar together.
        </p>
        <ul>
          <li>Quest givers, a quest log (L) and a tracker</li>
          <li>Kills count for everyone nearby</li>
          <li>Talk to each other with the in-game chat (T)</li>
        </ul>
      </div>
    </details>
  );
}

/**
 * `/game`: the character lobby. What to play was chosen on the front page (single player and a mode, or the realm); here
 * a guest or a Solana wallet picks or makes a character and presses Play. The character stands in the middle.
 */
export function GameLobby({ onEnter }: { onEnter: (target: PlayTarget) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const rosterRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  useFrontMotion(root);
  useMoreBelow(rosterRef);
  useMoreBelow(heroRef);

  const { init, status, account, wallets, busy: authBusy, error: authError, login, logout, createCharacter, selectCharacter, deleteCharacter } = useAuth();
  const name = useProfile((s) => s.name);
  const look = useProfile((s) => s.look);
  const setName = useProfile((s) => s.setName);
  const setLook = useProfile((s) => s.setLook);
  const replaceLook = useProfile((s) => s.replaceLook);

  const [{ way, mode, world: chosenWorld }] = useState(readLobbyChoice);
  /** Survival single player is the island. It is not a world picked beside the overworld. */
  const island = way === 'single' && mode === 'survival';
  const [seedText, setSeedText] = useState('');
  const [worldPick, setWorldPick] = useState<'overworld' | 'beyond' | 'isle'>(chosenWorld === 'beyond' ? 'beyond' : 'overworld');
  const [isleHero, setIsleHero] = useState<{ name: string; look: number } | null>(null);
  const [worlds, setWorlds] = useState<SavedWorld[] | null>(null);
  /** Days survived on the one island, once its save has been read. */
  const [isleDay, setIsleDay] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [worldError, setWorldError] = useState<string | null>(null);

  const [who, setWho] = useState<Who>('guest');
  const [pick, setPick] = useState<ClassId | null>(null);
  const [makingNew, setMakingNew] = useState(false);
  /** The class the pointer (or the keyboard) is on while choosing: the figure and the text try it on before it is picked. */
  const [peek, setPeek] = useState<ClassId | null>(null);
  /** The figure turns by itself (it can always be dragged round). */
  const [spin, setSpin] = useState(false);
  const [touched, setTouched] = useState(false);
  /** A guest's character has been made (CREATE was pressed): it is shown with what it carries, and PLAY takes it in. */
  const [guestMade, setGuestMade] = useState(false);
  const [armed, setArmed] = useState(false);
  const [working, setWorking] = useState(false);
  /** Play (or Continue, or a world's Play) was pressed and is being carried out: only then does the button say so. */
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState('');

  // Until we know who is here (a signed-in wallet's session is asked for first), the page is a loading screen: it
  // must not show the guest's random character for a moment before the wallet's own one takes its place.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (status === 'loading') return;
    const t = window.setTimeout(() => setSettled(true), 250); // (after the effects below have put the character on the page)
    return () => window.clearTimeout(t);
  }, [status]);

  const signedIn = status === 'in' && account !== null;
  const hasCharacter = signedIn && account.look !== null;
  /** The name, look and class are being made (a guest always; a wallet when it has no character yet, or asked for one more). Island survival has one character and no class. */
  const creating = island ? isleHero === null : (who === 'guest' && !guestMade) || (signedIn && (account.look === null || makingNew));
  // The figure wears the set the hero has on in the world (it is in the hero's outfit slot).
  const wornOutfit = signedIn ? (account.outfit ?? null) : null;
  useEffect(() => {
    if (signedIn && !creating && hasCharacter) useProfile.getState().setOutfit(wornOutfit);
  }, [wornOutfit, signedIn, creating, hasCharacter]);
  const characterId = hasCharacter ? account.id : null;

  useEffect(() => init(), [init]);

  // A guest starts from what this tab remembers (or a random name).
  useEffect(() => {
    hydrateProfile();
    const profile = useProfile.getState();
    if (island) {
      const hero = readIsleHero();
      setIsleHero(hero);
      profile.setClassId(null);
      profile.setIdentity('guest');
      LocalSaveStore.setScope('isle');
      if (hero) {
        useProfile.setState({ name: hero.name });
        profile.replaceLook(lookOfCode(hero.look));
      } else useProfile.setState({ name: '' });
      return;
    }
    useProfile.setState({ name: '' });
    if (!useAuth.getState().account) profile.setIdentity('guest');
  }, [island]);

  // A signed-in wallet is who plays: its character (or the making of one) takes over the page.
  useEffect(() => {
    if (island) return;
    if (status !== 'in' || !account) return;
    setWho('wallet');
    useProfile.getState().setIdentity('wallet');
    setMakingNew(false);
    setDeleting(false);
    setTyped('');
    setError('');
    setArmed(false);
    if (account.look !== null) showCharacter({ displayName: account.displayName, look: account.look, outfit: account.outfit });
    else {
      useProfile.setState({ name: '' });
      setPick(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, account?.id, account?.look === null]);

  // Making a character and looking at it are two pages of the same column: each starts at the top.
  useEffect(() => {
    heroRef.current?.scrollTo({ top: 0 });
  }, [creating, characterId, guestMade]);

  // Whatever the player changes, a "last chance" confirmation no longer matches it.
  useEffect(() => setArmed(false), [name, look, pick]);

  // ---- saved worlds (they belong to a wallet character; a guest keeps nothing)
  const refresh = () =>
    characterId === null
      ? Promise.resolve(setWorlds([]))
      : LocalSaveStore.listWorlds().then(setWorlds, (err) => {
          console.warn('could not list worlds', err);
          setWorlds([]);
        });
  useEffect(() => {
    if (status === 'loading') return;
    if (island) {
      LocalSaveStore.setScope('isle');
      LocalSaveStore.isleWorld().then(
        (saved) => {
          setWorlds(saved ? [saved] : []);
          setIsleDay(saved ? saved.day ?? 1 : null);
        },
        (err) => {
          console.warn('could not read the island', err);
          setWorlds([]);
          setIsleDay(null);
        },
      );
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, characterId, island]);

  const removeWorld = async (seed: number) => {
    if (removing !== seed) return setRemoving(seed);
    try {
      await new LocalSaveStore(String(seed)).clear();
      setWorldError(null);
    } catch (err) {
      setWorldError(`Could not delete the world: ${err instanceof Error ? err.message : String(err)}`);
    }
    setRemoving(null);
    await refresh();
  };

  /** Forget the one island on this device. The first click asks; the second deletes it. */
  const forgetIsle = async () => {
    if (!latest || working) return;
    if (removing !== latest.seed) return setRemoving(latest.seed);
    LocalSaveStore.setScope('isle');
    try {
      await LocalSaveStore.dropIsle(latest.seed);
      setWorldError(null);
      setWorlds([]);
      setIsleDay(null);
    } catch (err) {
      setWorldError(`Could not delete the island: ${err instanceof Error ? err.message : String(err)}`);
    }
    setRemoving(null);
  };

  // ---- who: guest or wallet
  const chooseGuest = async () => {
    // A guest is nobody's account: leave a signed-in session so nothing is saved or shared by accident.
    if (useAuth.getState().status === 'in') {
      await useAuth.getState().logout();
      if (useAuth.getState().status === 'in') return;
    }
    setWho('guest');
    setMakingNew(false);
    setGuestMade(false);
    useProfile.getState().setIdentity('guest');
    useProfile.setState({ hydrated: false });
    hydrateProfile();
    useProfile.setState({ name: '' });
    setPick(null);
    setTouched(false);
    setError('');
  };
  const choose = (id: ClassId) => {
    setPick(id);
    setError('');
    if (who === 'guest') useProfile.getState().setClassId(id);
  };
  const startNewCharacter = () => {
    useProfile.setState({ name: '' });
    replaceLook(randomLook());
    setPick(null);
    setTouched(false);
    setMakingNew(true);
  };
  /** A guest makes another one (the one made is dropped: a guest keeps nothing). */
  const startNewGuest = () => {
    useProfile.setState({ name: '' });
    replaceLook(randomLook());
    setPick(null);
    setTouched(false);
    setError('');
    setGuestMade(false);
  };
  const cancelNewCharacter = () => {
    setMakingNew(false);
    if (account && account.look !== null) showCharacter({ displayName: account.displayName, look: account.look, outfit: account.outfit });
  };
  const selectSlot = async (id: string) => {
    if (working || id === account?.id) return;
    setWorking(true);
    setError('');
    try {
      await selectCharacter(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setWorking(false);
  };
  const closeDelete = () => {
    setDeleting(false);
    setTyped('');
    setError('');
  };
  const wipe = async () => {
    if (!account || working) return;
    setWorking(true);
    setError('');
    try {
      await deleteCharacter(account.displayName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setWorking(false);
  };

  // ---- play
  const cleaned = cleanPlayerName(name);
  const problem = playerNameProblem(name);
  const def = pick ? CLASSES[pick] : null;
  const latest = worlds?.find((w) => modeOfSave(w.player) === mode);
  const typedSeed = seedText.trim() === '' ? null : parseSeed(seedText);
  const clash = typedSeed !== null ? worlds?.find((w) => w.seed === typedSeed) : undefined;

  // ---- the character sheet: the realm's record (asked of the server) or the world this device would open
  const [realmSheet, setRealmSheet] = useState<SheetData | null | undefined>(undefined);
  /** What the wallet's Stash holds (shared by its characters): undefined while it is read, null when it could not be. */
  const [realmStash, setRealmStash] = useState<StashView | null | undefined>(undefined);
  /** Every character of the wallet in short (level, coins, what it carries): kept while another one is being read, so the slots do not blink. */
  const [briefs, setBriefs] = useState<CharacterBrief[]>([]);
  /** Bumped after a bag or Stash change, so the sheet is read again. */
  const [sheetGen, setSheetGen] = useState(0);
  useEffect(() => {
    setRealmSheet(undefined);
    setRealmStash(undefined);
  }, [hasCharacter, characterId, way]);
  useEffect(() => {
    if (!hasCharacter || way !== 'multi') return;
    let live = true;
    fetch('/api/auth/sheet', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(
        (b: { sheet?: SheetData | null; stash?: StashView | null; briefs?: CharacterBrief[] }) => {
          if (!live) return;
          setRealmSheet(b.sheet ?? null);
          setRealmStash(b.stash ?? null);
          setBriefs(Array.isArray(b.briefs) ? b.briefs : []);
        },
        () => {
          if (!live) return;
          setRealmSheet(null);
          setRealmStash(null);
        },
      );
    return () => {
      live = false;
    };
  }, [hasCharacter, characterId, way, sheetGen]);
  const sheetWorld = clash ?? latest;
  const accountClass = account?.class ?? null;
  const localSheet = useMemo(() => (sheetWorld ? sheetOfSave(sheetWorld.player, island ? null : accountClass) : null), [sheetWorld, accountClass, island]);
  /** What is known of the character from its saved worlds (a guest keeps none); null: nothing saved yet. */
  const savedSheet: SheetData | null | undefined = way === 'multi' ? (who === 'guest' ? null : realmSheet) : worlds === null ? undefined : localSheet;
  /** A character that has never been played carries what its class starts a survival world with: shown, so that the bags are seen before PLAY. */
  const starterClass: ClassId | null = account?.class ?? (who === 'guest' ? pick : null);
  const starter = !island && !creating && savedSheet === null && starterClass !== null && mode !== 'creative';
  const rawSheet: SheetData | null | undefined = island ? (creating ? null : (savedSheet ?? blankCharacterSheet())) : starter ? newCharacterSheet(starterClass) : savedSheet;
  /** Health follows the gear, so a piece that adds health moves the bar as well as the stats. */
  const sheet: SheetData | null | undefined = rawSheet ? withWornHealth(rawSheet) : rawSheet;
  const sheetSource = starter ? 'Starting kit' : way === 'multi' ? 'Dawnwatch realm' : sheetWorld ? `${modeInfo(modeOfSave(sheetWorld.player)).name} world ${sheetWorld.seed}` : '';

  /** What keeps PLAY from working yet, in words. */
  const blocker: string | null = island
    ? creating && problem
      ? problem
      : null
    : who === 'wallet' && !signedIn
      ? 'Sign in with a wallet, or play as a guest'
      : creating && problem
        ? problem
        : creating && !pick
          ? 'Pick a class'
          : null;

  /** CREATE: the character is made, and the page shows it with what it carries (PLAY is a separate press). A wallet character is permanent: the first press asks, the second one creates it. */
  const create = async () => {
    if (working || !creating) return;
    setTouched(true);
    if (blocker) return;
    const profile = useProfile.getState();
    if (island) {
      const hero = { name: cleaned, look: lookCode(look) };
      writeIsleHero(hero);
      setIsleHero(hero);
      profile.setIdentity('guest');
      profile.setClassId(null);
      useProfile.setState({ name: cleaned });
      setTouched(false);
      return;
    }
    if (who === 'guest') {
      profile.setIdentity('guest');
      useProfile.setState({ name: cleaned });
      if (pick) profile.setClassId(pick);
      setTouched(false);
      setGuestMade(true);
      return;
    }
    if (!account) return;
    if (!armed) return setArmed(true);
    setWorking(true);
    setError('');
    try {
      const made = await createCharacter({ displayName: cleaned, look: lookCode(look), class: pick! });
      useProfile.setState({ name: made.displayName });
      profile.setClassId(pick!);
      profile.setIdentity('wallet');
      setTouched(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setArmed(false);
    }
    setWorking(false);
  };

  /** Make the player official before a world opens (a guest is set down; a wallet character is already made). False: not yet. */
  const commit = async (): Promise<boolean> => {
    if (creating || blocker) return false;
    const profile = useProfile.getState();
    if (island) {
      if (!isleHero) return false;
      profile.setIdentity('guest');
      profile.setClassId(null);
      useProfile.setState({ name: isleHero.name });
      profile.replaceLook(lookOfCode(isleHero.look));
      LocalSaveStore.setScope('isle');
      return true;
    }
    if (who === 'guest') {
      profile.setIdentity('guest');
      useProfile.setState({ name: cleaned });
      if (pick) profile.setClassId(pick);
      return true;
    }
    if (!account) return false;
    useProfile.setState({ name: account.displayName });
    profile.setIdentity('wallet');
    return true;
  };
  const start = async (t: PlayTarget) => {
    if (working) return;
    setWorking(true);
    setStarting(true);
    const ok = await commit();
    setStarting(false);
    setWorking(false);
    if (ok) onEnter(t);
  };
  // Survival is the island. Creative and Hardcore choose the overworld or The World Beyond.
  const land: 'overworld' | 'beyond' | 'isle' = island ? 'isle' : worldPick === 'beyond' ? 'beyond' : 'overworld';
  const playNow = () => {
    if (way === 'multi') return void start({ kind: 'multi' });
    const seed = parseSeed(seedText);
    // A seed is a world's name on this device: reuse the world if it is already there.
    const existing = worlds?.find((w) => w.seed === seed);
    const go = async () => {
      // Island survival keeps one seed. A different one replaces the island that was saved.
      if (island && latest && latest.seed !== seed) {
        LocalSaveStore.setScope('isle');
        try {
          await LocalSaveStore.dropIsle(latest.seed);
        } catch {
          /* the new island still starts; the next visit keeps only the newest */
        }
      }
      void start({ kind: 'single', seed, mode: existing && land === 'overworld' ? modeOfSave(existing.player) : mode, ...(land === 'overworld' ? {} : { world: land }) });
    };
    void go();
  };

  const info = modeInfo(mode);
  const over = latest?.player.gameOver === true;
  const label = starting ? 'One moment...' : creating ? (working ? 'Creating...' : who === 'wallet' && armed ? `Yes, create ${cleaned} for good` : 'Create') : 'Play';
  /** The one big button (and Enter): CREATE while the character is being made, PLAY once it exists. */
  const primary = () => (creating ? void create() : playNow());
  const home = () => location.assign(`${siteUrl('/')}${location.search}`);
  /** A menu button of the front page: to the front page, at that part. */
  const toFront = (id: string) => {
    try {
      sessionStorage.setItem(SCROLL_KEY, id);
    } catch {
      /* no storage: the front page opens at the top */
    }
    // (The front page is on another host from the game's: there the part goes in the address.)
    if (whereAmI() === 'play') return void location.assign(frontUrl(id));
    home();
  };

  /** The other character of the account, `dir` steps on. */
  const walk = (dir: 1 | -1) => {
    if (!signedIn || creating || working) return;
    const list = account.characters;
    if (list.length < 2) return;
    const at = list.findIndex((c) => c.id === account.id);
    void selectSlot(list[(at + dir + list.length) % list.length].id);
  };
  const canWalk = signedIn && !creating && account.characters.length > 1;

  // Keys, as in a game's menu: Escape goes back, Enter plays, Up and Down walk through the characters.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === 'Escape') {
        if (deleting) {
          if (!working) closeDelete();
        } else if (typing) t.blur();
        else home();
        return;
      }
      if (typing || deleting) return;
      if (creating && !island && !working && /^[1-9]$/.test(e.key) && CLASS_IDS[Number(e.key) - 1]) {
        choose(CLASS_IDS[Number(e.key) - 1]);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!canWalk) return;
        e.preventDefault();
        walk(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter' && !(t && ['BUTTON', 'SUMMARY', 'A'].includes(t.tagName)) && !working && !deleting) {
        primary();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const shownClass: ClassId | null = island ? null : creating || who === 'guest' ? pick : (account?.class ?? null);
  const shownName = island ? isleHero?.name || cleaned || 'Nameless' : creating ? cleaned || 'Nameless' : who === 'guest' ? cleaned : (account?.displayName ?? '');
  const showFigure = island || who === 'guest' || signedIn;
  const shownDef = shownClass ? CLASSES[shownClass] : null;
  /** What the figure and the text on the right show: while choosing, the class under the pointer, else the one in use. */
  const viewClass: ClassId | null = island ? null : creating ? (peek ?? pick) : shownClass;
  const viewDef = viewClass ? CLASSES[viewClass] : null;
  /** The figure wears what the saved character really wears once that is known, else the class's own clothes. While the character is being made it wears none: the class is chosen, not put on. */
  const wornIds = !creating && sheet ? sheet.armor.flatMap((s) => (s ? [s.id] : [])) : null;
  // What the character has on besides armor: its wings and its companion show beside it, as they do in the game.
  const figureWings = !creating && sheet?.wings ? wingNumberOf(sheet.wings.id) : 0;
  const figurePet = (() => {
    const def = !creating && sheet?.companion ? companionOfItem(sheet.companion.id) : null;
    return def ? companionIndex(def.id) + 1 : 0;
  })();
  const figureArmor = creating ? [] : (wornIds ?? (viewClass ? outfitItems(viewClass) : []));
  /** What each hand carries: the hotbar slot that is selected, and the off hand. A shield is worn on the arm whichever hand it is in. */
  const figureHands = (() => {
    const starter = viewClass ? { held: CLASSES[viewClass].startingWeapon, off: CLASSES[viewClass].startingOffhand } : { held: 0, off: 0 };
    const raw = creating || !sheet ? starter : { held: sheet.hotbar[Math.max(0, Math.min(sheet.hotbar.length - 1, sheet.selected ?? 0))]?.id ?? 0, off: sheet.offhand?.id ?? 0 };
    if (raw.held && getItem(raw.held).shield) return { held: raw.off && !getItem(raw.off).shield ? raw.off : 0, off: raw.held };
    return raw;
  })();
  const weaponName = shownDef ? getItem(shownDef.startingWeapon).name.replace(/_/g, ' ') : '';
  const iconOf = (c: ClassId | null | undefined): number => (c ? CLASSES[c].startingWeapon : toolId('sword', 'diamond'));

  return (
    <div className="fp gamepage" ref={root} data-ready={settled ? '1' : '0'}>
      <div className="gp-bg" style={{ backgroundImage: `url(${island ? '/art/island-mode-survival.png' : ART.characterSelect})` }} aria-hidden="true" />
      <div className={`gp-loading ${settled ? 'done' : ''}`} id="lobby-loading" role="status" aria-live="polite" aria-hidden={settled} style={{ backgroundImage: `radial-gradient(ellipse 55% 50% at 50% 50%, rgba(5, 4, 12, 0.5), rgba(5, 4, 12, 0.15) 100%), linear-gradient(rgba(5, 4, 12, 0.55), rgba(5, 4, 12, 0.7)), url(${island ? '/art/island-mode-survival.png' : ART.characterSelect})`, backgroundSize: 'cover', backgroundPosition: 'center 30%' }}>
        <div className="gp-loading-blocks" aria-hidden="true">
          {[B.GRASS, B.PLANKS, B.STONE, B.GOLD_ORE, B.DIAMOND_ORE].map((id, i) => (
            <span key={id} style={{ animationDelay: `s` }}>
              <BlockCube id={id} size={64} />
            </span>
          ))}
        </div>
        <img className="gp-loading-logo" src="/art/solrift-logo.png" alt="SolRift" draggable={false} />
        <i className="gp-loading-bar" aria-hidden="true">
          <b />
        </i>
        <small>{island ? 'Loading' : 'Loading your characters'}</small>
      </div>
      <div className="gp-shade" aria-hidden="true" />
      <ClickSparks />

      <div className="fp-rail" data-no-play>
        <button className="fp-brand" onClick={home} aria-label="SolRift, to the front page"><img src="/art/solrift-token-logo.png" alt="SolRift" draggable={false} /></button>
          <header className="fp-nav fp-px">
          <span className="fp-brand-gap" aria-hidden="true" />
          <nav className="site-nav fp-links" aria-label="Menu">
            <button className="fp-link-play" aria-current="page">
              Play
            </button>
            <button onClick={goBeyond}>The World</button>
            {FRONT_MENU.map((m) => (
              <button key={m.id} onClick={() => toFront(m.id)}>
                {m.label}
              </button>
            ))}
            <button className="fp-link-farm" onClick={goFarm}>Farm</button>
            <button className="fp-link-ranks" onClick={goRanks}>Ranks</button>
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

      {/* The character stands on the bottom edge of the screen, behind everything else. */}
      <section className="gp-center" id="lb-character" style={{ '--c': viewDef?.color ?? '#8a5cf5' } as CSSProperties}>
        {/* A light in the class's colour behind the figure; picking another class lets it flare up again. */}
        <div className="gp-aura" key={viewClass ?? 'none'} aria-hidden="true" />
        <div className="gp-figure" id="cc-stage">
          {showFigure && settled ? (
            // Another character (or class) is built up from the feet, with a column of light and a ring on the floor.
            <div className="gp-appear" key={`${account?.id ?? 'guest'}${creating ? 'c' : `s${shownClass ?? ''}`}`}>
              <div className="gp-fx" aria-hidden="true">
                <i className="beam" />
                <i className="ring" />
              </div>
              <div className="gp-build">
                <CharacterPreview armor={figureArmor} held={figureHands.held} shield={figureHands.off} grounded stage turntable={spin} wings={figureWings} companion={figurePet} />
              </div>
            </div>
          ) : (
            <p className="gp-empty">
              <span>Sign in with your wallet</span>
              to see your characters
            </p>
          )}
        </div>
        {showFigure && settled && (
          <div className="gp-tools" id="stage-tools">
            <span>Drag to turn</span>
            <button type="button" id="stage-spin" aria-pressed={spin} onClick={() => setSpin((s) => !s)} title="Let the character turn by itself">
              Auto-turn
            </button>
          </div>
        )}
        <div className="gp-fog" aria-hidden="true" />
      </section>
      <div className="gp-embers" aria-hidden="true">
        <Embers />
      </div>

      <main className="gp-main">
        {/* (shown on touch screens only, see responsive.css) */}
        <p className="gp-touch" role="note">
          SolRift is played with a keyboard and a mouse. Look around here, and open it on a computer to play.
        </p>
        {/* ---------------------------------------------------- your characters (left) */}
        <section className="gp-roster" id="lb-slots" aria-label="Characters" ref={rosterRef}>
          {island ? (
            <header className="gp-roster-head">
              <h2>Character</h2>
              <span>{isleHero ? '1 / 1' : 'One character'}</span>
            </header>
          ) : !(who === 'wallet' && !signedIn) && (
            <header className="gp-roster-head">
              <h2>{who === 'guest' ? 'Guest' : 'Your characters'}</h2>
              {who === 'guest' ? (
                <span>Not saved</span>
              ) : signedIn ? (
                <span className="gp-slots" title={`${account.characters.length} of ${account.maxCharacters} character slots used`}>
                  <span className="gp-pips" aria-hidden="true">
                    {Array.from({ length: account.maxCharacters }, (_, i) => (
                      <i key={i} className={i < account.characters.length ? 'on' : ''} />
                    ))}
                  </span>
                  {account.characters.length} / {account.maxCharacters}
                </span>
              ) : null}
            </header>
          )}
          {!island && who === 'wallet' && signedIn && (
            <p className="lb-signed" id="who-account">
              <span className="lb-signed-ico" aria-hidden="true">
                <svg viewBox="0 0 12 12" width="16" height="16" shapeRendering="crispEdges">
                  <path d="M1 3h9v1H2v1h9v6H1zm8 4v2h1V7z" fillRule="evenodd" fill="currentColor" />
                </svg>
              </span>
              <span className="lb-signed-who">
                <span>
                  <span className="lb-signed-pre">Signed in as </span>
                  <b>{account.displayName}</b>
                </span>
                <code title={account.wallet}>{shortAddress(account.wallet)}</code>
              </span>
              <button type="button" className="lb-link" id="who-signout" disabled={authBusy} onClick={() => void logout()}>
                Switch wallet
              </button>
            </p>
          )}

          {island ? (
            <div className="lb-slots" id="char-slots" role="group" aria-label="Character">
              <button type="button" className="lb-slot lb-card isle" aria-pressed="true">
                <span className="slot-ico" aria-hidden="true">
                  <svg className="isle-sun" viewBox="0 0 16 16" width="36" height="36" shapeRendering="crispEdges">
                    <path fill="#ffb24d" d="M7 0h2v2H7zM7 14h2v2H7zM0 7h2v2H0zM14 7h2v2h-2zM2 2h2v2H2zM12 2h2v2h-2zM2 12h2v2H2zM12 12h2v2h-2z" />
                    <path fill="#ffe08a" d="M5 4h6v1H5zM4 5h8v6H4zM5 11h6v1H5z" />
                    <path fill="#fff6d0" d="M6 6h4v4H6z" />
                  </svg>
                </span>
                <span className="slot-copy">
                  <span className="slot-name">{isleHero?.name ?? 'New character'}</span>
                  <small className="slot-class">Day {isleDay ?? 1}</small>
                </span>
              </button>
            </div>
          ) : who === 'wallet' && !signedIn ? (
            <div className="gp-signin" id="wallet-pane">
              <h2>Solana wallet</h2>
              {status === 'loading' ? (
                <p className="lb-hint">Checking your session...</p>
              ) : wallets.length === 0 ? (
                <p className="lb-warn" id="who-no-wallet">
                  No Solana wallet found. Install Phantom, Solflare or Backpack, then reload this page.
                  <WalletLinks />
                </p>
              ) : (
                <>
                  <p className="lb-hint">Sign in with your wallet to keep your characters and progress. It costs nothing and cannot touch your funds.</p>
                  <div className="lb-wallets">
                    {wallets.map((w) => (
                      <button key={w.name} type="button" className="lb-btn wallet-pick" disabled={authBusy} onClick={() => void login(w)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={w.icon} alt="" width={20} height={20} /> {w.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {authError && (
                <p className="lb-warn" id="who-error">
                  {authError}
                </p>
              )}
            </div>
          ) : (
            <div className="lb-slots" id="char-slots" role="group" aria-label="Your characters">
              {who === 'guest' ? (
                <>
                  <button type="button" className="lb-slot lb-card guest" aria-pressed="true" data-guest>
                    <span className="slot-name">{guestMade ? cleaned : 'New character'}</span>
                    <small className="slot-class">
                      {guestMade ? '' : `${cleaned || 'Nameless'} \u00B7 `}
                      {pick ? CLASSES[pick].name : 'no class yet'}
                    </small>
                    <span className="slot-ico">
                      <ItemSprite id={iconOf(pick)} size={36} />
                    </span>
                  </button>
                  {guestMade && (
                    <button type="button" className="lb-slot lb-card new" id="char-new" onClick={startNewGuest}>
                      <span className="slot-name">New character</span>
                      <small className="slot-hint">this one is dropped</small>
                      <span className="slot-ico plus">+</span>
                    </button>
                  )}
                  {Array.from({ length: guestMade ? 1 : 2 }, (_, i) => i).map((i) => (
                    <button key={i} type="button" className="lb-slot lb-card locked" title="Sign in with a Solana wallet to keep characters" onClick={() => setWho('wallet')}>
                      <span className="slot-name">Wallet slot</span>
                      <small className="slot-class">sign in to keep characters</small>
                      <span className="slot-ico plus">+</span>
                    </button>
                  ))}
                </>
              ) : (
                signedIn && (
                  <>
                    {account.characters.map((c) => {
                      const brief = way === 'multi' ? briefs.find((b) => b.id === c.id) : undefined;
                      const here = !creating && c.id === account.id;
                      // (A card, not a button: the delete button sits on it, and a button cannot hold a button.)
                      return (
                        <div
                          key={c.id}
                          role="button"
                          tabIndex={working ? -1 : 0}
                          className="lb-slot lb-card"
                          data-id={c.id}
                          data-class={c.class ?? ''}
                          style={{ '--c': c.class ? CLASSES[c.class].color : '#8a5cf5' } as CSSProperties}
                          aria-pressed={here}
                          aria-disabled={working}
                          onClick={() => void selectSlot(c.id)}
                          onKeyDown={(e) => {
                            if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                              e.preventDefault();
                              void selectSlot(c.id);
                            }
                          }}
                        >
                          <span className="slot-ico">
                            <ItemSprite id={iconOf(c.class)} size={40} />
                          </span>
                          <span className="slot-name">{c.displayName}</span>
                          {brief && (
                            <em className="slot-lv">
                              <i>Lv</i> {brief.level}
                            </em>
                          )}
                          {c.class ? (
                            <small className="slot-class">
                              <i aria-hidden="true" />
                              {CLASSES[c.class].name}
                            </small>
                          ) : null}
                          {brief?.savedAt != null && <span className="slot-when">{timeAgo(brief.savedAt)}</span>}
                          {brief ? (
                            <span className="slot-meta">
                              <span className="slot-coins" title={CURRENCY.name}>
                                <CoinIcon size={16} />
                                <b>{formatCoins(brief.coins)}</b>
                              </span>
                            </span>
                          ) : way === 'multi' && realmStash !== undefined ? (
                            <span className="slot-meta fresh">Not in the realm yet</span>
                          ) : null}
                          {here && (
                            <button
                              type="button"
                              className="slot-del"
                              id="delete-open"
                              aria-label={`Delete ${c.displayName}`}
                              title="Delete this character..."
                              disabled={working}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleting(true);
                              }}
                            >
                              <svg viewBox="0 0 12 12" width="14" height="14" shapeRendering="crispEdges" aria-hidden="true">
                                <path d="M4 0h4v1h3v2H1V1h3zM2 4h8v8H2zm2 1v5h1V5zm3 0v5h1V5z" fillRule="evenodd" />
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {creating ? (
                      <button type="button" className="lb-slot lb-card new" aria-pressed="true" id="char-new-active">
                        <span className="slot-name">New character</span>
                        <small className="slot-class">not created yet</small>
                        <span className="slot-ico plus">+</span>
                      </button>
                    ) : (
                      account.characters.length < account.maxCharacters && (
                        <button type="button" className="lb-slot lb-card new" id="char-new" disabled={working} onClick={startNewCharacter}>
                          <span className="slot-name">New character</span>
                          <small className="slot-hint">
                            {account.maxCharacters - account.characters.length} of {account.maxCharacters} slots free
                          </small>
                          <span className="slot-ico plus">+</span>
                        </button>
                      )
                    )}
                  </>
                )
              )}
            </div>
          )}
          {who === 'wallet' && signedIn && !creating && account.characters.length >= account.maxCharacters && (
            <>
              <p className="lb-hint" id="char-full">
                {account.maxCharacters} of {account.maxCharacters} characters: delete one to make another.
              </p>
              <TokenShop compact />
            </>
          )}
          {/* What is being played, chosen on the front page (and changed there). */}
          <div className="gp-mode" id="lb-how" data-way={way} data-mode={way === 'single' ? mode : 'realm'}>
            <div className="gp-mode-row">
              <span className="gp-mode-ico" aria-hidden="true">
                <ItemSprite id={toolId('sword', 'diamond')} size={24} />
              </span>
              <div className="gp-mode-txt">
                <p className="gp-kicker">You will play</p>
                <p className="gp-dest">
                  <b id="dest-title">{way === 'multi' ? 'Multiplayer' : 'Single player'}</b>
                  <span>{way === 'multi' ? 'Dawnwatch realm' : info.name}</span>
                </p>
              </div>
              <button type="button" className="lb-link" id="change-way" onClick={home}>
                Change
              </button>
            </div>
            {way === 'single' && (
              <p className="gp-blurb" id="mode-detail">
                {info.blurb}
              </p>
            )}
          </div>
          {way === 'multi' && <RealmAbout />}
          <p className="gp-keys" aria-label="Keys">
            <span>
              <kbd>Esc</kbd> Back
            </span>
            <span>
              <kbd>Enter</kbd> {creating ? 'Create' : 'Play'}
            </span>
            {canWalk && (
              <span>
                <kbd>&uarr;</kbd>
                <kbd>&darr;</kbd> Characters
              </span>
            )}
          </p>
        </section>

        <div className="gp-spacer">{way === 'multi' && signedIn && account && <RealmChat hero={account.id} />}</div>

        {/* ---------------------------------------------------- about the character (right) */}
        <aside className="gp-hero" id="gp-hero" ref={heroRef} style={{ '--c': viewDef?.color ?? '#8a5cf5' } as CSSProperties}>
          {showFigure && (
            <>
              {creating ? (
                <>
                  <p className="gp-kicker">{!island && signedIn && account.characters.length > 0 ? `New character (${account.characters.length + 1} of ${account.maxCharacters})` : 'New character'}</p>
                  <h1 id="gp-create">Create your character</h1>
                </>
              ) : (
                <>
                  <h1 id="gp-name">
                    <span id="char-name-fixed">{shownName}</span>
                  </h1>
                  <p className="gp-sub">
                    {shownDef && <ItemSprite id={shownDef.startingWeapon} size={22} />}
                    <span id="char-class-fixed" data-class={shownClass ?? ''}>
                      {shownDef ? shownDef.name : island ? `Day ${isleDay ?? 1}` : 'None (before classes)'}
                    </span>
                    <em>{island ? 'Island' : who === 'guest' ? 'Guest' : 'Wallet'}</em>
                    {sheet && (
                      <span className="gp-coins" id="char-coins" data-coins={sheet.coins} title={CURRENCY.name}>
                        <CoinIcon size={20} />
                        <b>{formatCoins(sheet.coins)}</b>
                      </span>
                    )}
                  </p>
                  <LobbyDesk active={way === 'multi' && who === 'wallet' && signedIn && !creating} heroId={account?.id ?? null} reload={() => setSheetGen((n) => n + 1)}>
                    {(hand) => (
                      <CharacterSheet
                        sheet={sheet}
                        stash={realmStash}
                        showStash={way === 'multi' && who === 'wallet'}
                        briefs={briefs}
                        characters={account?.characters}
                        selfId={account?.id}
                        source={sheetSource}
                        empty={way === 'multi' ? 'This character has not entered the realm yet. It starts at level 1, in a cave under the village of Ashbrook.' : `No saved ${info.name} world for this character yet. Press Play to start one at level 1.`}
                        hand={hand}
                      />
                    )}
                  </LobbyDesk>
                </>
              )}

              {creating && (
                <div className="gp-form">
                  <div className="lb-field">
                    <Step n={1} done={!problem} htmlFor="char-name">
                      Name
                    </Step>
                    <input
                      id="char-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => setTouched(true)}
                      onKeyDown={(e) => e.key === 'Enter' && void create()}
                      placeholder="a name others will see"
                      title="3 to 16 letters, digits, spaces, dots, dashes or underscores"
                      spellCheck={false}
                      autoComplete="off"
                      maxLength={20}
                    />
                    {touched && problem ? (
                      <span className="lb-warn" id="name-problem">
                        {problem}
                      </span>
                    ) : null}
                  </div>
                  {!island && (
                    <>
                  <div className="lb-field">
                    <Step n={2} done={!!pick}>
                      Class
                      <small>point at one to read about it{' \u00B7 '}keys 1-{CLASS_IDS.length}</small>
                    </Step>
                  </div>
                  <div className={`gp-classes lb-classes ${touched && !pick ? 'need' : ''}`} id="class-cards" role="group" aria-label="Class" onMouseLeave={() => setPeek(null)}>
                    {CLASS_IDS.map((id, n) => (
                      <button
                        key={id}
                        type="button"
                        className={`lb-class fp-px ${pick === id ? 'on' : ''}`}
                        data-class={id}
                        aria-pressed={pick === id}
                        aria-keyshortcuts={String(n + 1)}
                        disabled={working}
                        style={{ '--c': CLASSES[id].color } as CSSProperties}
                        onMouseEnter={() => setPeek(id)}
                        onFocus={() => setPeek(id)}
                        onBlur={() => setPeek(null)}
                        onClick={() => choose(id)}
                      >
                        <ItemSprite id={CLASSES[id].startingWeapon} size={26} />
                        <span>
                          <b>{CLASSES[id].name}</b>
                          <small>{CLASSES[id].role}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                  {touched && !pick && (
                    <span className="lb-warn" id="class-problem" role="alert">
                      Pick a class to go on.
                    </span>
                  )}
                    </>
                  )}
                </div>
              )}

              {!island && (
              <p className="gp-text" id="class-hint">
                {viewDef ? `${viewDef.tagline}. ${viewDef.description}` : 'Pick a class to see what it can do. Every class can mine, build, craft and explore.'}
              </p>
              )}
              {island && !creating && <p className="gp-text">A simple character. Nothing is carried.</p>}

              {viewClass && (
                <div className="gp-block">
                  <h3>Special abilities</h3>
                  <ClassSkills id={viewClass} />
                </div>
              )}

              {viewClass && (
                <div className="gp-block">
                  <h3>Strengths</h3>
                  <HeroStats id={viewClass} sheet={creating ? null : sheet} />
                </div>
              )}

              {shownDef && !creating && (
                <div className="gp-block">
                  <h3>Loadout</h3>
                  <p className="gp-loadout">{weaponName}</p>
                </div>
              )}

              {creating && (
                <details className="gp-look" id="look-more" open>
                  <summary className="gp-step done" data-step={island ? '2' : '3'}>
                    <i aria-hidden="true">{'\u2713'}</i>
                    Appearance
                    <small>already set: change what you like</small>
                  </summary>
                  <div className="lb-rows">
                    <Choice part="skin" title="Skin" count={SKIN_TONES.length} color={(i) => SKIN_TONES[i]} look={look} onPick={(i) => setLook({ skin: i })} />
                    <Choice part="style" title="Hair style" count={HAIR_STYLE_NAMES.length} label={(i) => HAIR_STYLE_NAMES[i]} look={look} onPick={(i) => setLook({ style: i })} />
                    <Choice part="hair" title="Hair colour" count={HAIR_COLORS.length} color={(i) => HAIR_COLORS[i]} look={look} onPick={(i) => setLook({ hair: i })} />
                    <Choice part="eyes" title="Eyes" count={EYE_COLORS.length} color={(i) => EYE_COLORS[i]} look={look} onPick={(i) => setLook({ eyes: i })} />
                    <Choice part="shirt" title="Hoodie" count={SHIRT_COLORS.length} color={(i) => SHIRT_COLORS[i]} look={look} onPick={(i) => setLook({ shirt: i })} />
                    <Choice part="pants" title="Trousers" count={PANTS_COLORS.length} color={(i) => PANTS_COLORS[i]} look={look} onPick={(i) => setLook({ pants: i })} />
                  </div>
                </details>
              )}

              {creating && (
                <div className="lb-inline">
                  <button type="button" className="lb-btn" id="cc-random" onClick={() => replaceLook(randomLook())}>
                    Randomise
                  </button>
                  {signedIn && account.look !== null && (
                    <button type="button" className="lb-btn" id="cc-back" onClick={cancelNewCharacter}>
                      Cancel
                    </button>
                  )}
                </div>
              )}

              <p className={`lb-note ${island || who !== 'wallet' ? 'warn' : 'good'}`} id="who-save-note">
                {island
                  ? 'One character on this device. It has no class and carries nothing. It is not one of your multiplayer characters.'
                  : who === 'guest'
                  ? 'Guest mode: this character and everything you do are forgotten when you leave.'
                  : creating
                    ? `Saved to your account${account ? ` (${shortAddress(account.wallet)})` : ''}: you will look like this on every device, and your progress is kept.`
                    : `Saved to your account${account ? ` (${shortAddress(account.wallet)})` : ''}. Its name, look and class are permanent, and it has its own progress.`}
              </p>
              {who === 'wallet' && creating && (
                <p className="lb-note warn" id="permanent-note">
                  {armed
                    ? `Last chance: "${cleaned}" the ${def?.name} can never be changed, renamed or given another class. The only way to start over is to delete the character, which erases all its progress.`
                    : 'A wallet character is permanent: its name, look and class cannot be edited later. You can only delete it, and that erases all its progress.'}
                </p>
              )}
              {error && creating && (
                <p className="lb-warn" id="class-error">
                  {error}
                </p>
              )}
              {error && !creating && !deleting && (
                <p className="lb-warn" id="char-error">
                  {error}
                </p>
              )}

            </>
          )}
        </aside>
      </main>

      {/* ---------------------------------------------------- who plays, and the one button */}
      <footer className="gp-bar" data-no-play>
        <div className="gp-bar-left">
          <button type="button" className="gp-back" id="back-home" onClick={home}>
            &larr; Back
          </button>
          {!island && (
          <div className="gp-who" id="lb-who" role="group" aria-label="Who is playing?">
            <button type="button" id="who-guest" className={who === 'guest' ? 'on' : ''} aria-pressed={who === 'guest'} onClick={() => void chooseGuest()}>
              <b>Guest</b>
              <small>Nothing is saved</small>
            </button>
            <button type="button" id="who-wallet" className={who === 'wallet' ? 'on' : ''} aria-pressed={who === 'wallet'} onClick={() => setWho('wallet')}>
              <b>Solana wallet</b>
              <small>Progress is saved</small>
            </button>
          </div>
          )}
        </div>

        <div className="gp-go" id="dest-chip">
          {way === 'single' ? (
            <div className="gp-ctrl" id="single-panel" data-ready={worlds !== null} data-mode={mode}>
              <div className="gp-ctrl-row">
                <label className="gp-seed" title="A number or any words: the same seed always gives the same world. Empty is a random one.">
                  <span>Seed</span>
                  <input id="seed-input" value={seedText} onChange={(e) => setSeedText(e.target.value)} placeholder="random" spellCheck={false} autoComplete="off" maxLength={40} />
                </label>
                <div className="lb-seg" role="group" aria-label={island ? 'Mode' : 'Which world'}>
                  {island ? (
                    <button type="button" id="world-isle" className="on" aria-pressed="true">
                      Island
                    </button>
                  ) : (
                    <>
                      <button type="button" id="world-overworld" className={land === 'overworld' ? 'on' : ''} aria-pressed={land === 'overworld'} onClick={() => setWorldPick('overworld')}>
                        Overworld
                      </button>
                      <button type="button" id="world-beyond" className={land === 'beyond' ? 'on' : ''} aria-pressed={land === 'beyond'} onClick={() => setWorldPick('beyond')}>
                        The World Beyond
                      </button>
                    </>
                  )}
                </div>
                {worlds && worlds.length > 0 && !island && (
                  <details className="gp-worlds">
                    <summary>Your worlds ({worlds.length})</summary>
                    <div className="lb-worlds">
                      <ul>
                        {worlds.map((w) => {
                          const m = modeOfSave(w.player);
                          return (
                            <li key={w.seed} data-seed={w.seed}>
                              <span className={`lb-badge ${m}`}>{modeInfo(m).name}</span>
                              <span className="lb-wname">
                                <code>{w.seed}</code>
                                {w.player.gameOver && <em> &middot; game over</em>}
                                <small>{timeAgo(w.player.savedAt ?? null)}</small>
                              </span>
                              <button type="button" className="lb-mini play" disabled={working} onClick={() => void start({ kind: 'single', seed: w.seed, mode: island ? mode : m, ...(island ? { world: 'isle' as const } : {}) })}>
                                Play
                              </button>
                              <button type="button" className="lb-mini delete danger" onClick={() => void removeWorld(w.seed)}>
                                {removing === w.seed ? 'Sure?' : 'Delete'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      {worldError && <p className="lb-warn">{worldError}</p>}
                    </div>
                  </details>
                )}
              </div>
              {island ? (
                <p className="lb-hint">
                  {latest
                    ? `One island is kept. Continue opens seed ${latest.seed}. Delete starts over.`
                    : 'One island, water on every side. Days are counted. One seed is kept.'}
                </p>
              ) : (land === 'overworld' && clash) || land === 'beyond' ? (
                <p className="lb-hint">
                  {land === 'overworld' && clash
                    ? `You already have this world (${modeInfo(modeOfSave(clash.player)).name}): Play opens it.`
                    : 'A vast planet of 110 biomes, saved apart from the overworld.'}
                </p>
              ) : null}
              {island && worldError && <p className="lb-warn">{worldError}</p>}
            </div>
          ) : (
            <RealmPill />
          )}

          <div className="gp-go-row">
            <span className="gp-ready" id="dest-sub">
              {blocker ? (
                <em className="lb-need">{blocker}</em>
              ) : (
                <>
                  {shownDef && <ItemSprite id={shownDef.startingWeapon} size={30} />}
                  <span>
                    <b>{shownName}</b>
                    <small>
                      {island ? `Day ${isleDay ?? 1}` : shownDef ? shownDef.name : 'Adventurer'} &middot; {island ? 'Nothing carried' : who === 'guest' ? 'Guest' : 'Wallet'}
                    </small>
                  </span>
                </>
              )}
            </span>
            {way === 'single' && island && latest && !creating && (
              <button type="button" className="lb-continue fp-ghost fp-px lb-forget" disabled={working || blocker !== null} onClick={() => void forgetIsle()}>
                <span>
                  {removing === latest.seed ? 'Sure?' : 'Delete'}
                  <small>{removing === latest.seed ? 'This island is gone' : 'Start over'}</small>
                </span>
              </button>
            )}
            {way === 'single' && latest && !creating && (
              <button type="button" className="lb-continue fp-ghost fp-px" disabled={working || blocker !== null} onClick={() => void start({ kind: 'single', seed: latest.seed, mode, ...(island ? { world: 'isle' as const } : {}) })}>
                <span>
                  {over ? 'Visit last world' : 'Continue'}
                  <small>{island ? `seed ${latest.seed} · ` : ''}{timeAgo(latest.player.savedAt ?? null)}</small>
                </span>
              </button>
            )}
            <span className={`fp-glow ${blocker || starting ? 'idle' : ''}`}>
              <button type="button" id="play-go" className="fp-play fp-px" data-way={way} data-step={creating ? 'create' : 'play'} title={creating && blocker ? blocker : undefined} disabled={starting || working || (creating && blocker !== null) || (blocker !== null && who === 'wallet' && !signedIn)} onClick={primary}>
                <span>
                  <i aria-hidden="true" />
                  {label}
                </span>
              </button>
            </span>
          </div>
        </div>
      </footer>

      {/* ---------------------------------------------------- deleting a character: asked in a dialog */}
      {deleting && account && (
        <div className="lb-modal" id="delete-modal" onMouseDown={(e) => e.target === e.currentTarget && !working && closeDelete()}>
          <div
            className="lb-modal-box"
            id="delete-box"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !working) {
                e.stopPropagation();
                closeDelete();
              }
            }}
          >
            <div className="lb-modal-head">
              <span className="lb-modal-ico" aria-hidden="true">
                <ItemSprite id={iconOf(account.class)} size={40} />
              </span>
              <div>
                <p className="gp-kicker">Delete character</p>
                <h2 id="delete-title">Delete {account.displayName}?</h2>
                <small>
                  {account.class ? CLASSES[account.class].name : 'Adventurer'}
                  {briefs.find((b) => b.id === account.id) ? ` \u00B7 Level ${briefs.find((b) => b.id === account.id)!.level}` : ''}
                </small>
              </div>
            </div>
            <p>This erases this character for good, with all its progress: the realm progress, its cloud worlds, and every world it saved on this device. Your other characters are not touched. This cannot be undone.</p>
            <label htmlFor="delete-confirm">
              Type <b>{account.displayName}</b> to confirm
            </label>
            <input
              id="delete-confirm"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && typed.trim().toLowerCase() === account.displayName.toLowerCase() && void wipe()}
              placeholder={account.displayName}
              spellCheck={false}
              autoComplete="off"
            />
            {error && (
              <span className="lb-warn" id="delete-error">
                {error}
              </span>
            )}
            <div className="lb-modal-actions">
              <button type="button" className="lb-btn" id="delete-cancel" disabled={working} onClick={closeDelete}>
                Keep it
              </button>
              <button type="button" className="lb-btn danger" id="delete-go" disabled={working || typed.trim().toLowerCase() !== account.displayName.toLowerCase()} onClick={() => void wipe()}>
                {working ? 'Deleting...' : 'Delete everything'}
              </button>
            </div>
          </div>
        </div>
      )}    </div>
  );
}
