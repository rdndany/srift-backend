/**
 * Lets UI code outside the engine (export/import and sign-in buttons) reach the running game
 * without importing the whole engine. `startGame` fills these in and clears them on dispose.
 */
export const saveBridge: {
  /** Write all pending changes (chunks, player, world state) to storage. */
  flush: (() => Promise<void>) | null;
  /** Make every later write a no-op, so a pending page unload cannot clobber an import. */
  freeze: (() => void) | null;
  /** Reopen the game-server connection (after signing in or out, so it sees the new session). */
  reconnectNet: (() => void) | null;
} = { flush: null, freeze: null, reconnectNet: null };
