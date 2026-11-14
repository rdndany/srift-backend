/**
 * Sign-In With Solana (SIWS) messages: base58 helpers plus a strict formatter/parser for the
 * standard message layout. Pure TypeScript: the server uses it to issue and check challenges and
 * the client to display them.
 */

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const INDEX = new Map([...ALPHABET].map((c, i) => [c, i]));

export function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  return '1'.repeat(zeros) + digits.reverse().map((d) => ALPHABET[d]).join('');
}

/** Returns null for any character outside the base58 alphabet. */
export function base58Decode(text: string): Uint8Array | null {
  let zeros = 0;
  while (zeros < text.length && text[zeros] === '1') zeros++;
  const bytes: number[] = [];
  for (let i = zeros; i < text.length; i++) {
    const v = INDEX.get(text[i]);
    if (v === undefined) return null;
    let carry = v;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const out = new Uint8Array(zeros + bytes.length);
  out.set(bytes.reverse(), zeros);
  return out;
}

/** A Solana address is the base58 form of a 32-byte ed25519 public key. */
export function addressToPublicKey(address: string): Uint8Array | null {
  if (address.length < 32 || address.length > 44) return null;
  const key = base58Decode(address);
  return key && key.length === 32 ? key : null;
}

export interface SignInFields {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
  chainId?: string;
}

export class SiwsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiwsError';
  }
}

const NONCE = /^[A-Za-z0-9]{16,64}$/;
const DOMAIN = /^[A-Za-z0-9.-]+(:\d{1,5})?$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function validate(f: SignInFields): void {
  if (!DOMAIN.test(f.domain)) throw new SiwsError('bad domain');
  if (!addressToPublicKey(f.address)) throw new SiwsError('bad address');
  if (/[\r\n]/.test(f.statement) || f.statement.length > 200) throw new SiwsError('bad statement');
  if (!/^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(f.uri)) throw new SiwsError('bad uri');
  if (!NONCE.test(f.nonce)) throw new SiwsError('bad nonce');
  if (!ISO.test(f.issuedAt) || !ISO.test(f.expirationTime)) throw new SiwsError('bad timestamp');
  if (f.chainId !== undefined && !/^[A-Za-z0-9:_-]{1,40}$/.test(f.chainId)) throw new SiwsError('bad chain id');
}

/** The exact text the wallet signs. */
export function formatSignInMessage(f: SignInFields): string {
  validate(f);
  const lines = [
    `${f.domain} wants you to sign in with your Solana account:`,
    f.address,
    '',
    f.statement,
    '',
    `URI: ${f.uri}`,
    'Version: 1',
  ];
  if (f.chainId !== undefined) lines.push(`Chain ID: ${f.chainId}`);
  lines.push(`Nonce: ${f.nonce}`, `Issued At: ${f.issuedAt}`, `Expiration Time: ${f.expirationTime}`);
  return lines.join('\n');
}

/**
 * Parse a message back into fields. Anything unexpected throws. Callers must also re-format the
 * parsed fields and require byte-for-byte equality, so there is exactly one valid encoding.
 */
export function parseSignInMessage(text: string): SignInFields {
  if (text.length > 1000) throw new SiwsError('message too long');
  const lines = text.split('\n');
  const head = / wants you to sign in with your Solana account:$/;
  if (lines.length < 10 || !head.test(lines[0])) throw new SiwsError('not a SIWS message');
  const domain = lines[0].replace(head, '');
  const address = lines[1];
  if (lines[2] !== '' || lines[4] !== '') throw new SiwsError('unexpected layout');
  const statement = lines[3];
  const rest = lines.slice(5);
  const take = (prefix: string): string => {
    const line = rest.shift();
    if (line === undefined || !line.startsWith(prefix)) throw new SiwsError(`expected ${prefix.trim()}`);
    return line.slice(prefix.length);
  };
  const uri = take('URI: ');
  if (take('Version: ') !== '1') throw new SiwsError('unsupported version');
  const chainId = rest[0]?.startsWith('Chain ID: ') ? take('Chain ID: ') : undefined;
  const nonce = take('Nonce: ');
  const issuedAt = take('Issued At: ');
  const expirationTime = take('Expiration Time: ');
  if (rest.length > 0) throw new SiwsError('trailing content');
  const fields: SignInFields = { domain, address, statement, uri, nonce, issuedAt, expirationTime, ...(chainId !== undefined ? { chainId } : {}) };
  validate(fields);
  return fields;
}
