'use client';

import { create } from 'zustand';
import { DEFAULT_LOOK, cleanPlayerName, isClassId, lookCode, lookOfCode, normalizeLook, type CharacterLook, type ClassId } from '@solrift/shared';

/** How the player enters the world: as a guest (nothing is kept) or with a Solana wallet (progress and character are saved). */
export type Identity = 'guest' | 'wallet';

interface ProfileState {
  /** Chosen on the title screen. Null on addresses that skip it (they keep the old behaviour). */
  identity: Identity | null;
  name: string;
  look: CharacterLook;
  /** The outfit the character shown wears (an id from `OUTFITS`): only a saved wallet character has one. Not kept anywhere: the account has it. */
  outfit: string | null;
  /** A guest's class for this visit (a wallet character's class is on its account). Null: none chosen. */
  classId: ClassId | null;
  hydrated: boolean;
  setIdentity(identity: Identity | null): void;
  setName(name: string): void;
  setLook(patch: Partial<CharacterLook>): void;
  setOutfit(outfit: string | null): void;
  setClassId(classId: ClassId | null): void;
  /** Replace the whole look (a random one, or the one saved with an account). */
  replaceLook(look: CharacterLook): void;
}

/**
 * A guest's name and look live in this tab's session storage only: a reload of `/play/Alice` keeps you looking
 * like yourself, and closing the tab forgets everything. (Wallet players keep theirs on their account.)
 */
const KEY = 'solrift-guest';

function writeGuest(s: Pick<ProfileState, 'identity' | 'name' | 'look' | 'classId'>): void {
  if (typeof sessionStorage === 'undefined' || s.identity === 'wallet') return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ name: s.name, look: lookCode(s.look), class: s.classId }));
  } catch {
    /* storage blocked: the choice just does not survive a reload */
  }
}

export const useProfile = create<ProfileState>()((set, get) => ({
  identity: null,
  name: '',
  look: { ...DEFAULT_LOOK },
  outfit: null,
  classId: null,
  hydrated: false,
  setIdentity: (identity) => set({ identity }),
  setName: (name) => {
    set({ name });
    writeGuest(get());
  },
  setLook: (patch) => {
    set({ look: normalizeLook({ ...get().look, ...patch }), outfit: null });
    writeGuest(get());
  },
  setOutfit: (outfit) => set({ outfit }),
  setClassId: (classId) => {
    set({ classId });
    writeGuest(get());
  },
  replaceLook: (look) => {
    set({ look: normalizeLook(look), outfit: null });
    writeGuest(get());
  },
}));

/** Read this tab's guest choices once (and the last name used on this device, as a suggestion). */
export function hydrateProfile(): void {
  const s = useProfile.getState();
  if (s.hydrated || typeof window === 'undefined') return;
  let name = '';
  let look: CharacterLook = { ...DEFAULT_LOOK };
  let classId: ClassId | null = null;
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      if (typeof raw.name === 'string') name = cleanPlayerName(raw.name);
      look = lookOfCode(raw.look);
      if (isClassId(raw.class)) classId = raw.class;
    }
  } catch {
    /* nothing remembered */
  }
  if (!name) {
    try {
      name = cleanPlayerName(localStorage.getItem('solrift-name') ?? '');
    } catch {
      /* no storage */
    }
  }
  useProfile.setState({ name, look, classId, hydrated: true });
}
