import { createHash, createPublicKey, randomBytes, verify as edVerify } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ClassId, PlayerSave } from '@solrift/shared';
import { SiwsError, addressToPublicKey, cleanPlayerName, formatSignInMessage, isClassId, parseLookCode, parseSignInMessage, playerNameProblem, briefOfSheet, sheetOfSave, type CharacterBrief, type StashView } from '@solrift/shared';
import { CharacterLimitError, NameTakenError, type Account, type Repo } from './db';

/** DER prefix of an ed25519 SubjectPublicKeyInfo; the 32-byte key follows it. */
const ED25519_SPKI = Buffer.from('302a300506032b6570032100', 'hex');

export const SESSION_COOKIE = 'sc_session';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_PENDING_CHALLENGES = 10_000;
export const SIGN_IN_STATEMENT = 'Sign in to SolRift. This does not cost anything and gives no access to your funds.';

export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function verifySignature(address: string, message: string, signature: Uint8Array): boolean {
  const pub = addressToPublicKey(address);
  if (!pub || signature.length !== 64) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI, pub]), format: 'der', type: 'spki' });
    return edVerify(null, Buffer.from(message, 'utf8'), key, signature);
  } catch {
    return false;
  }
}

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

interface Challenge {
  message: string;
  address: string;
  origin: string;
  expiresAt: number;
}

export interface AuthOptions {
  /** Exact browser origins allowed to sign in, e.g. `http://localhost:3000`. */
  origins: string[];
  chainId?: string;
  now?: () => number;
}

/** Issues one-time SIWS challenges and turns signed ones into sessions. */
export class AuthService {
  private readonly challenges = new Map<string, Challenge>();
  private readonly now: () => number;

  constructor(
    readonly repo: Repo,
    private readonly opts: AuthOptions,
  ) {
    this.now = opts.now ?? Date.now;
  }

  isAllowedOrigin(origin: string | undefined): origin is string {
    return !!origin && this.opts.origins.includes(origin);
  }

  private sweep(): void {
    const t = this.now();
    for (const [k, c] of this.challenges) if (c.expiresAt <= t) this.challenges.delete(k);
  }

  /** Step 1: the server writes the message, so the wallet can only ever sign text we produced. */
  challenge(address: string, origin: string): { message: string; nonce: string } {
    if (!this.isAllowedOrigin(origin)) throw new AuthError(403, 'origin not allowed');
    if (!addressToPublicKey(address)) throw new AuthError(400, 'invalid address');
    this.sweep();
    if (this.challenges.size >= MAX_PENDING_CHALLENGES) throw new AuthError(503, 'try again shortly');
    const nonce = randomBytes(18).toString('base64url').replace(/[-_]/g, 'x').slice(0, 24);
    const issued = this.now();
    const message = formatSignInMessage({
      domain: new URL(origin).host,
      address,
      statement: SIGN_IN_STATEMENT,
      uri: origin,
      nonce,
      issuedAt: new Date(issued).toISOString(),
      expirationTime: new Date(issued + CHALLENGE_TTL_MS).toISOString(),
      ...(this.opts.chainId ? { chainId: this.opts.chainId } : {}),
    });
    this.challenges.set(nonce, { message, address, origin, expiresAt: issued + CHALLENGE_TTL_MS });
    return { message, nonce };
  }

  /** Step 2: check the signature over exactly the issued message, then open a session. */
  verify(message: string, signature: Uint8Array, origin: string): { account: Account; token: string } {
    if (!this.isAllowedOrigin(origin)) throw new AuthError(403, 'origin not allowed');
    let nonce: string;
    try {
      nonce = parseSignInMessage(message).nonce;
    } catch (err) {
      throw new AuthError(400, err instanceof SiwsError ? 'invalid sign-in message' : 'bad request');
    }
    const issued = this.challenges.get(nonce);
    this.challenges.delete(nonce); // single use, even when the attempt fails
    if (!issued || issued.expiresAt <= this.now()) throw new AuthError(401, 'challenge expired or unknown');
    if (issued.message !== message || issued.origin !== origin) throw new AuthError(401, 'message does not match the challenge');
    if (!verifySignature(issued.address, message, signature)) throw new AuthError(401, 'bad signature');

    const t = this.now();
    const account = this.repo.upsertAccount(issued.address, t);
    const token = randomBytes(32).toString('base64url');
    this.repo.createSession(account.id, hashToken(token), t, t + SESSION_TTL_MS);
    return { account, token };
  }

  /** Look up a session cookie value. Active sessions slide forward at most once a day. */
  resolve(token: string | undefined): Account | null {
    if (!token || token.length > 100) return null;
    const hash = hashToken(token);
    const t = this.now();
    const s = this.repo.getSession(hash, t);
    if (!s) return null;
    if (t - s.lastSeen > SESSION_REFRESH_AFTER_MS) this.repo.touchSession(hash, t, t + SESSION_TTL_MS);
    return s.account;
  }

  /** What outfit a character wears (set by a server that has a token: the choice is kept with the token's records). */
  outfitOf?: (accountId: string, wallet: string, cls: ClassId | null) => string | null;

  /** The signed-in character as the client sees it, with the wallet's other characters to choose from. */
  view(account: Account): PublicAccount {
    const outfit = (id: string, cls: ClassId | null): string | null => this.outfitOf?.(id, account.wallet, cls) ?? null;
    return {
      id: account.id,
      displayName: account.displayName,
      wallet: account.wallet,
      look: account.look,
      outfit: outfit(account.id, account.class),
      class: account.class,
      characters: this.repo.listCharacters(account.wallet).map((c) => ({ id: c.id, displayName: c.displayName, look: c.look as number, outfit: outfit(c.id, c.class), class: c.class })),
      maxCharacters: this.repo.maxCharacters(account.wallet),
    };
  }

  /**
   * Make a character for the signed-in wallet: a name and a look, up to the wallet's `maxCharacters`. A character is permanent:
   * it cannot be edited or renamed afterwards, only deleted (`deleteCharacter`). The new one becomes the character
   * this session plays.
   */
  createCharacter(token: string | undefined, raw: unknown): Account {
    const account = this.resolve(token);
    if (!account || !token) throw new AuthError(401, 'sign in first');
    const body = (raw ?? {}) as Record<string, unknown>;
    if (typeof body.displayName !== 'string') throw new AuthError(400, 'a name is required');
    const problem = playerNameProblem(body.displayName);
    if (problem) throw new AuthError(400, problem);
    if (!parseLookCode(body.look)) throw new AuthError(400, 'invalid character');
    // Every new character has a class, chosen here and kept for as long as the character exists.
    if (!isClassId(body.class)) throw new AuthError(400, 'choose a class');
    try {
      const created = this.repo.createCharacter(account.id, { displayName: cleanPlayerName(body.displayName), look: body.look as number, class: body.class }, this.now());
      if (!created) throw new AuthError(401, 'sign in first');
      if (created.id !== account.id) this.repo.setSessionAccount(hashToken(token), created.id, this.now());
      return created;
    } catch (err) {
      if (err instanceof CharacterLimitError) throw new AuthError(409, `You already have ${err.max} characters. Delete one to make another.`);
      if (err instanceof NameTakenError) throw new AuthError(409, 'That name is taken. Try another.');
      throw err;
    }
  }

  /** Play another of the wallet's characters: this session now carries its progress, saves and name. */
  selectCharacter(token: string | undefined, raw: unknown): Account {
    const account = this.resolve(token);
    if (!account || !token) throw new AuthError(401, 'sign in first');
    const id = (raw as Record<string, unknown> | null)?.id;
    const target = typeof id === 'string' ? this.repo.getAccount(id) : null;
    // Only your own wallet's characters (a stranger's id is just "not found").
    if (!target || target.wallet !== account.wallet || target.look === null) throw new AuthError(404, 'no such character');
    this.repo.setSessionAccount(hashToken(token), target.id, this.now());
    return target;
  }

  /**
   * Delete the signed-in character with its progress; another character of the wallet (if any) takes its place in this
   * session. Refused while it is in the game (leave first, or it would be saved again).
   */
  deleteCharacter(token: string | undefined, raw: unknown, isPlaying: (accountId: string) => boolean = () => false): Account {
    const account = this.resolve(token);
    if (!account) throw new AuthError(401, 'sign in first');
    if (account.look === null) throw new AuthError(409, 'there is no character to delete');
    // Asking for the name keeps a stray click or script from wiping everything.
    const confirm = (raw as Record<string, unknown> | null)?.confirm;
    if (typeof confirm !== 'string' || confirm.trim().toLowerCase() !== account.displayName.toLowerCase()) throw new AuthError(400, 'type the character name to confirm');
    if (isPlaying(account.id)) throw new AuthError(409, 'Leave the game first: this character is in the realm right now.');
    const next = this.repo.deleteCharacter(account.id, this.now());
    if (!next) throw new AuthError(401, 'sign in first');
    return next;
  }
  logout(token: string | undefined): void {
    if (token) this.repo.deleteSession(hashToken(token));
  }

  purgeExpired(): number {
    return this.repo.deleteExpiredSessions(this.now());
  }
}

// ---- HTTP ---------------------------------------------------------------------------------------

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

function sessionCookie(token: string, secure: boolean, maxAgeSeconds: number, domain?: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}${domain ? `; Domain=${domain}` : ''}`;
}

export const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
};

export function readBody(req: IncomingMessage, limit = 8 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new AuthError(413, 'body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new AuthError(400, 'invalid json'));
      }
    });
    req.on('error', reject);
  });
}

export interface PublicAccount {
  id: string;
  displayName: string;
  wallet: string;
  /** The look of the character in play, or null when the wallet has none yet. */
  look: number | null;
  /** The outfit that character wears (an id from `OUTFITS`), or null. */
  outfit: string | null;
  /** The class of the character in play (null: none yet, or a character from before classes). */
  class: ClassId | null;
  /** All of the wallet's characters (oldest first), so the client can offer them. */
  characters: { id: string; displayName: string; look: number; outfit: string | null; class: ClassId | null }[];
  maxCharacters: number;
}

export interface RouterOptions {
  /** Add `Secure` to the session cookie (always true behind https). */
  secureCookies: boolean;
  /**
   * Share the session cookie with sibling subdomains (`example.com`: the page at `play.example.com` signs in through its own /api, and
   * the game socket at `api.example.com` then gets the cookie too). Leave unset when the page and the server share one address.
   */
  cookieDomain?: string;
  /** Believe `X-Forwarded-For` (only when a trusted proxy such as Next sets it). */
  trustProxy: boolean;
  /** Requests per minute per client for the sign-in endpoints. */
  rateLimitPerMinute: number;
  /** Whether an account's character is in the game right now (deleting it then is refused). */
  isPlaying?: (accountId: string) => boolean;
  /** The saved record of an account's character in the realm (null: it never played there), for its character sheet. */
  saveOf?: (accountId: string) => PlayerSave | null;
  /** What a wallet's Stash holds (shared by its characters), for the lobby. */
  stashOf?: (wallet: string) => StashView;
}

/** Returns a handler that serves `/auth/*`. It returns false when the URL is not an auth route. */
export function createAuthRouter(auth: AuthService, opts: RouterOptions) {
  const hits = new Map<string, { count: number; reset: number }>();

  const limited = (req: IncomingMessage): boolean => {
    const fwd = opts.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
    const key = fwd || req.socket.remoteAddress || 'unknown';
    const t = Date.now();
    const h = hits.get(key);
    if (!h || h.reset <= t) {
      if (hits.size > 5000) hits.clear();
      hits.set(key, { count: 1, reset: t + 60_000 });
      return false;
    }
    return ++h.count > opts.rateLimitPerMinute;
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/auth/')) return false;
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    try {
      if (req.method === 'GET' && url.pathname === '/auth/me') {
        const account = auth.resolve(token);
        json(res, 200, { account: account ? auth.view(account) : null });
        return true;
      }
      if (req.method === 'GET' && url.pathname === '/auth/sheet') {
        const account = auth.resolve(token);
        if (!account) throw new AuthError(401, 'sign in first');
        let save: PlayerSave | null = null;
        try {
          save = account.look === null ? null : (opts.saveOf?.(account.id) ?? null);
        } catch {
          /* a record from a newer game version: no sheet, never an error page */
        }
        // Every character of the wallet in short, for its slot (level, coins) and for finding where an item is.
        const briefs: CharacterBrief[] = [];
        for (const c of auth.view(account).characters) {
          try {
            const s = opts.saveOf?.(c.id) ?? null;
            if (s) briefs.push(briefOfSheet(c.id, sheetOfSave(s, c.class)));
          } catch {
            /* a record from a newer game version: no brief */
          }
        }
        json(res, 200, { sheet: save ? sheetOfSave(save, account.class) : null, stash: opts.stashOf?.(account.wallet) ?? null, briefs });
        return true;
      }
      if (req.method !== 'POST') throw new AuthError(405, 'method not allowed');

      // Browsers always send Origin on cross-site POSTs; requiring a known one blocks CSRF.
      const origin = req.headers.origin;
      if (!auth.isAllowedOrigin(origin)) throw new AuthError(403, 'origin not allowed');
      if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new AuthError(415, 'expected application/json');

      if (url.pathname === '/auth/logout') {
        auth.logout(token);
        json(res, 200, { ok: true }, { 'set-cookie': sessionCookie('', opts.secureCookies, 0, opts.cookieDomain) });
        return true;
      }
      if (limited(req)) throw new AuthError(429, 'too many requests');
      const body = (await readBody(req)) as Record<string, unknown>;

      if (url.pathname === '/auth/challenge') {
        if (typeof body?.address !== 'string') throw new AuthError(400, 'address required');
        json(res, 200, auth.challenge(body.address, origin));
        return true;
      }
      if (url.pathname === '/auth/verify') {
        if (typeof body?.message !== 'string' || typeof body?.signature !== 'string') throw new AuthError(400, 'message and signature required');
        const sig = Buffer.from(body.signature, 'base64');
        const { account, token: fresh } = auth.verify(body.message, new Uint8Array(sig), origin);
        json(res, 200, { account: auth.view(account) }, { 'set-cookie': sessionCookie(fresh, opts.secureCookies, SESSION_TTL_MS / 1000, opts.cookieDomain) });
        return true;
      }
      if (url.pathname === '/auth/character') {
        json(res, 200, { account: auth.view(auth.createCharacter(token, body)) });
        return true;
      }
      if (url.pathname === '/auth/character/select') {
        json(res, 200, { account: auth.view(auth.selectCharacter(token, body)) });
        return true;
      }
      if (url.pathname === '/auth/character/delete') {
        json(res, 200, { account: auth.view(auth.deleteCharacter(token, body, opts.isPlaying)) });
        return true;
      }
      throw new AuthError(404, 'not found');
    } catch (err) {
      if (err instanceof AuthError) json(res, err.status, { error: err.message });
      else {
        console.error('[auth] unexpected error', err);
        json(res, 500, { error: 'internal error' });
      }
      return true;
    }
  };
}
