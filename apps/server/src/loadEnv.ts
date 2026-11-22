import { existsSync } from 'node:fs';

/**
 * Reads `.env` from the server's working directory (apps/server) into process.env, if there is one. Imported first
 * by index.ts so every setting is in place before the rest of the server reads it. A variable that is already set in
 * the real environment is left alone (that is how hosting platforms pass settings), so this never overrides a deploy.
 * The file is git-ignored: it is where TOKEN_MINT, SOLANA_CLUSTER and TREASURY_KEYPAIR live on your machine.
 */
if (existsSync('.env')) process.loadEnvFile('.env');
