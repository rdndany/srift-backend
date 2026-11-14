/**
 * Cloud save API contract shared by the browser and the game server. Pure types and constants.
 * The server treats every field as untrusted input and validates it again.
 */

/** A world's identity in the cloud. Today one world per seed per account, so the id is the seed. */
export const isValidWorldId = (id: unknown): id is string => typeof id === 'string' && /^-?\d{1,10}$/.test(id) && Math.abs(Number(id)) <= 2 ** 31;

export const CLOUD_LIMITS = {
  /** Largest request body the server reads. */
  bodyBytes: 8 * 1024 * 1024,
  /** Chunks per push. Clients split bigger uploads into several pushes. */
  chunksPerPush: 400,
  /** Live data per account (chunks, player and world state). */
  accountBytes: 200 * 1024 * 1024,
  worldsPerAccount: 20,
  playerJsonBytes: 256 * 1024,
  worldJsonBytes: 4 * 1024 * 1024,
  backupsPerWorld: 6,
  /** Automatic backups are at most this far apart. */
  backupEveryMs: 60 * 60 * 1000,
  /** Writes per minute per account. */
  pushesPerMinute: 30,
} as const;

/** A device holds the write lease this long after its last push or heartbeat. */
export const LEASE_MS = 90_000;

export interface CloudWorldInfo {
  worldId: string;
  seed: number;
  revision: number;
  updatedAt: number;
  bytes: number;
  chunks: number;
  /** Someone (possibly this tab) holds the write lease. */
  leased: boolean;
  /** This tab holds the lease. */
  mine: boolean;
  leaseUntil: number;
}

export interface CloudBackupInfo {
  id: number;
  revision: number;
  createdAt: number;
  bytes: number;
  /** `auto` (periodic), `overwrite` (taken before a forced overwrite) or `restore`. */
  kind: string;
}

export interface PushChunk {
  cx: number;
  cz: number;
  /** `encodeChunk` output, base64. */
  data: string;
}


