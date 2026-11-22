import { readFileSync } from 'node:fs';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token';
import { base58Encode } from '@solrift/shared';

/** A failure with a reason that is safe to show the player. */
export class TokenError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface MintInfo {
  decimals: number;
  /** In the token's smallest unit. */
  supply: bigint;
}

export interface PreparedTransfer {
  /** Known before anything is sent, so a crash can be reconciled afterwards. */
  signature: string;
  /** After this block height the transaction can no longer land. */
  lastValidBlockHeight: number;
  /** Broadcast and wait for confirmation. Throws when it does not confirm. */
  send(): Promise<void>;
}

/** What the token service needs from Solana. The real one is `SolanaChain`; tests and `TOKEN_DEV_MOCK` use `MockChain`. */
export interface TokenChain {
  /** Whether this chain can pay out (a treasury key is loaded). */
  readonly canSend: boolean;
  mintInfo(): Promise<MintInfo>;
  /** Build and sign a transfer of `baseUnits` from the treasury to the wallet. Throws `TokenError` when it cannot (nothing was sent). */
  prepareTransfer(toWallet: string, baseUnits: bigint): Promise<PreparedTransfer>;
  signatureStatus(signature: string): Promise<'confirmed' | 'failed' | 'unknown'>;
  blockHeight(): Promise<number>;
}

export type Cluster = 'mainnet-beta' | 'devnet' | 'testnet';

export const DEFAULT_RPC: Record<Cluster, string> = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
  testnet: 'https://api.testnet.solana.com',
};

/** Read a Solana CLI keypair file (a JSON array of 64 bytes). The file is the secret: it never goes in the repository. */
export function loadKeypair(file: string): Keypair {
  let bytes: number[];
  try {
    bytes = JSON.parse(readFileSync(file, 'utf8')) as number[];
  } catch {
    throw new Error(`TREASURY_KEYPAIR: cannot read a keypair from ${file}`);
  }
  if (!Array.isArray(bytes) || bytes.length !== 64) throw new Error('TREASURY_KEYPAIR: expected a JSON array of 64 bytes (a Solana CLI keypair file)');
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

export interface SolanaChainOptions {
  rpcUrl: string;
  mint: string;
  /** The treasury that holds the tokens to pay out. Without it the chain is read-only (the mint can be shown, nothing paid). */
  treasury?: Keypair;
}

export class SolanaChain implements TokenChain {
  private readonly connection: Connection;
  private readonly mintKey: PublicKey;
  private programId: PublicKey | null = null;

  constructor(private readonly opts: SolanaChainOptions) {
    this.connection = new Connection(opts.rpcUrl, 'confirmed');
    this.mintKey = new PublicKey(opts.mint);
  }

  get canSend(): boolean {
    return !!this.opts.treasury;
  }

  /** A mint belongs to the classic token program or to Token-2022; the transfer must name the right one. */
  private async program(): Promise<PublicKey> {
    if (this.programId) return this.programId;
    const info = await this.connection.getAccountInfo(this.mintKey, 'confirmed');
    if (!info) throw new TokenError(503, 'The token mint was not found on this network.');
    if (info.owner.equals(TOKEN_PROGRAM_ID)) this.programId = TOKEN_PROGRAM_ID;
    else if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) this.programId = TOKEN_2022_PROGRAM_ID;
    else throw new TokenError(503, 'That address is not a token mint.');
    return this.programId;
  }

  async mintInfo(): Promise<MintInfo> {
    const m = await getMint(this.connection, this.mintKey, 'confirmed', await this.program());
    return { decimals: m.decimals, supply: m.supply };
  }

  async prepareTransfer(toWallet: string, baseUnits: bigint): Promise<PreparedTransfer> {
    const treasury = this.opts.treasury;
    if (!treasury) throw new TokenError(503, 'Withdrawals are not open yet.');
    let dest: PublicKey;
    try {
      dest = new PublicKey(toWallet);
    } catch {
      throw new TokenError(400, 'That wallet address is not valid.');
    }
    const programId = await this.program();
    const { decimals } = await this.mintInfo();
    const from = getAssociatedTokenAddressSync(this.mintKey, treasury.publicKey, false, programId);
    const to = getAssociatedTokenAddressSync(this.mintKey, dest, false, programId);

    const held = await this.connection.getTokenAccountBalance(from, 'confirmed').catch(() => null);
    if (!held || BigInt(held.value.amount) < baseUnits) throw new TokenError(503, 'The reward treasury is empty right now. Try again later.');

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: treasury.publicKey, blockhash, lastValidBlockHeight });
    // The player's token account is made on the way if it does not exist (the treasury pays that small rent).
    tx.add(createAssociatedTokenAccountIdempotentInstruction(treasury.publicKey, to, dest, this.mintKey, programId));
    tx.add(createTransferCheckedInstruction(from, this.mintKey, to, treasury.publicKey, baseUnits, decimals, [], programId));
    tx.sign(treasury);
    const signature = base58Encode(tx.signature!);
    const raw = tx.serialize();
    return {
      signature,
      lastValidBlockHeight,
      send: async () => {
        await this.connection.sendRawTransaction(raw, { maxRetries: 5 });
        const done = await this.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
        if (done.value.err) throw new Error(`transfer failed on chain: ${JSON.stringify(done.value.err)}`);
      },
    };
  }

  async signatureStatus(signature: string): Promise<'confirmed' | 'failed' | 'unknown'> {
    const { value } = await this.connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const s = value[0];
    if (!s) return 'unknown';
    if (s.err) return 'failed';
    return s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized' ? 'confirmed' : 'unknown';
  }

  blockHeight(): Promise<number> {
    return this.connection.getBlockHeight('confirmed');
  }
}

/**
 * A chain that lives in memory: tests drive it, and `TOKEN_DEV_MOCK=1` uses it to try the whole flow without a token. It never
 * touches a network and nothing it "sends" exists anywhere.
 */
export class MockChain implements TokenChain {
  readonly sent: { to: string; baseUnits: bigint; signature: string }[] = [];
  /** Signatures the mock treats as confirmed (the ones whose `send()` succeeded). */
  private readonly landed = new Set<string>();
  private readonly failedSigs = new Set<string>();
  height = 1000;
  /** Make the next prepare fail (nothing sent) or the next send fail, to test the failure paths. */
  failPrepare: TokenError | null = null;
  failSend: 'before' | 'after' | null = null;
  canSend = true;
  private n = 0;

  constructor(
    private readonly info: MintInfo = { decimals: 6, supply: 1_000_000_000n * 10n ** 6n },
  ) {}

  async mintInfo(): Promise<MintInfo> {
    return this.info;
  }

  async prepareTransfer(toWallet: string, baseUnits: bigint): Promise<PreparedTransfer> {
    if (this.failPrepare) throw this.failPrepare;
    const signature = `mocksig${String(++this.n).padStart(6, '0')}`;
    return {
      signature,
      lastValidBlockHeight: this.height + 150,
      send: async () => {
        if (this.failSend === 'before') throw new Error('rpc went away');
        this.sent.push({ to: toWallet, baseUnits, signature });
        this.landed.add(signature);
        // 'after': the transfer landed but the answer was lost, the case only reconciling can settle.
        if (this.failSend === 'after') throw new Error('lost the confirmation');
      },
    };
  }

  async signatureStatus(signature: string): Promise<'confirmed' | 'failed' | 'unknown'> {
    if (this.landed.has(signature)) return 'confirmed';
    if (this.failedSigs.has(signature)) return 'failed';
    return 'unknown';
  }

  /** The network confirms a transaction after the fact (a slow confirmation), or rejects it. */
  land(signature: string, outcome: 'confirmed' | 'failed' = 'confirmed'): void {
    (outcome === 'confirmed' ? this.landed : this.failedSigs).add(signature);
  }

  async blockHeight(): Promise<number> {
    return this.height;
  }
}
