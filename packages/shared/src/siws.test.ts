import { describe, expect, it } from 'vitest';
import { SiwsError, addressToPublicKey, base58Decode, base58Encode, formatSignInMessage, parseSignInMessage, type SignInFields } from './siws';
import { mulberry32 } from './noise';

const ADDRESS = '11111111111111111111111111111111'; // the system program: 32 zero bytes

const fields = (over: Partial<SignInFields> = {}): SignInFields => ({
  domain: 'localhost:3000',
  address: ADDRESS,
  statement: 'Sign in to SolRift. This does not cost anything.',
  uri: 'http://localhost:3000',
  nonce: 'a1B2c3D4e5F6g7H8',
  issuedAt: '2026-11-07T20:00:00.000Z',
  expirationTime: '2026-11-07T20:05:00.000Z',
  ...over,
});

describe('base58', () => {
  it('matches known vectors', () => {
    expect(base58Encode(new Uint8Array(32))).toBe(ADDRESS);
    expect(base58Encode(new TextEncoder().encode('hello world'))).toBe('StV1DL6CwTryKyV');
    expect(base58Encode(new Uint8Array([0, 0, 1]))).toBe('112');
    expect(base58Encode(new Uint8Array([]))).toBe('');
    expect(Array.from(base58Decode('StV1DL6CwTryKyV')!)).toEqual(Array.from(new TextEncoder().encode('hello world')));
  });

  it('round-trips random data, including leading zeros', () => {
    const rand = mulberry32(2);
    for (let n = 0; n < 200; n++) {
      const bytes = new Uint8Array(Math.floor(rand() * 40)).map(() => (rand() < 0.2 ? 0 : Math.floor(rand() * 256)));
      expect(Array.from(base58Decode(base58Encode(bytes))!)).toEqual(Array.from(bytes));
    }
  });

  it('rejects characters outside the alphabet', () => {
    for (const bad of ['0', 'O', 'I', 'l', 'abc+', ' ', 'é']) expect(base58Decode(bad)).toBeNull();
  });

  it('only accepts 32-byte addresses', () => {
    expect(addressToPublicKey(ADDRESS)).toHaveLength(32);
    expect(addressToPublicKey('abc')).toBeNull();
    expect(addressToPublicKey(base58Encode(new Uint8Array(31).fill(7)).padEnd(40, '1'))).toBeNull();
    expect(addressToPublicKey('0'.repeat(40))).toBeNull();
  });
});

describe('SIWS message', () => {
  it('formats the standard layout', () => {
    const text = formatSignInMessage(fields());
    expect(text.split('\n')).toEqual([
      'localhost:3000 wants you to sign in with your Solana account:',
      ADDRESS,
      '',
      'Sign in to SolRift. This does not cost anything.',
      '',
      'URI: http://localhost:3000',
      'Version: 1',
      'Nonce: a1B2c3D4e5F6g7H8',
      'Issued At: 2026-11-07T20:00:00.000Z',
      'Expiration Time: 2026-11-07T20:05:00.000Z',
    ]);
  });

  it('round-trips, with and without a chain id', () => {
    for (const f of [fields(), fields({ chainId: 'solana:devnet' })]) {
      expect(parseSignInMessage(formatSignInMessage(f))).toEqual(f);
    }
  });

  it('refuses to format or parse invalid fields', () => {
    expect(() => formatSignInMessage(fields({ nonce: 'short' }))).toThrow(SiwsError);
    expect(() => formatSignInMessage(fields({ address: 'nope' }))).toThrow(SiwsError);
    expect(() => formatSignInMessage(fields({ domain: 'evil.com/path' }))).toThrow(SiwsError);
    expect(() => formatSignInMessage(fields({ statement: 'two\nlines' }))).toThrow(SiwsError);
    expect(() => formatSignInMessage(fields({ issuedAt: 'yesterday' }))).toThrow(SiwsError);
    expect(() => formatSignInMessage(fields({ uri: 'javascript:alert(1)' }))).toThrow(SiwsError);
  });

  it('rejects tampered or malformed messages', () => {
    const good = formatSignInMessage(fields());
    const cases = [
      '',
      'hello',
      good + '\nExtra: line',
      good.replace('Version: 1', 'Version: 2'),
      good.replace('\n\n', '\nINJECT\n'),
      good.replace('Nonce: ', 'nonce: '),
      good.split('\n').reverse().join('\n'),
      good + ' '.repeat(2000),
      good.replace(ADDRESS, 'x'.repeat(32)),
    ];
    for (const bad of cases) expect(() => parseSignInMessage(bad)).toThrow(SiwsError);
  });

  it('never throws anything but SiwsError on garbage', () => {
    const rand = mulberry32(8);
    const good = formatSignInMessage(fields());
    for (let n = 0; n < 300; n++) {
      const chars = good.split('');
      for (let k = 0; k < 3; k++) chars[Math.floor(rand() * chars.length)] = String.fromCharCode(Math.floor(rand() * 128));
      try {
        parseSignInMessage(chars.join(''));
      } catch (e) {
        expect(e).toBeInstanceOf(SiwsError);
      }
    }
  });
});
