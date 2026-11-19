import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The host of the presentation page (the game is on `play.<this>`); `SITE_HOST` overrides it at build time. */
const SITE_HOST = (process.env.SITE_HOST ?? 'solrift.io').replace(/\./g, '\\.');
const SITE_HOST_PATTERN = `(www\\.)?${SITE_HOST}`;

const config: NextConfig = {
  reactStrictMode: true,
  // The shared package ships TypeScript source (used by client, server and tests).
  transpilePackages: ['@solrift/shared'],
  turbopack: { root: repoRoot },
  poweredByHeader: false,
  // The browser talks to the game server's REST API through the web origin, so cookies are same-origin.
  async rewrites() {
    return {
      // The bare domain (and www) shows the presentation page; the play address and everything else keep the game at `/`.
      beforeFiles: [{ source: '/', has: [{ type: 'host', value: SITE_HOST_PATTERN }], destination: '/welcome' }],
      afterFiles: [{ source: '/api/:path*', destination: `${process.env.SERVER_ORIGIN ?? 'http://localhost:8787'}/:path*` }],
    };
  },
  // Lets automated builds (e.g. headless smoke tests) avoid clobbering a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default config;
