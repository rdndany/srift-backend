import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const config: NextConfig = {
  reactStrictMode: true,
  // The shared package ships TypeScript source (used by client, server and tests).
  transpilePackages: ['@solrift/shared'],
  turbopack: { root: repoRoot },
  poweredByHeader: false,
  // The browser talks to the game server's REST API through the web origin, so cookies are same-origin.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.SERVER_ORIGIN ?? 'http://localhost:8787'}/:path*` }];
  },
  // Lets automated builds (e.g. headless smoke tests) avoid clobbering a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default config;
