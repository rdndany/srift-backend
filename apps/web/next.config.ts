import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Two hosts, one app. The website (front page, Market, Token, World Beyond, classes) is on this host (and `www.`); the game is
 * on `play.` + this host: the character lobby at `/` and the online realm at `/<uid>`. On any other host (a local
 * machine, a preview deploy) there is no split. `NEXT_PUBLIC_SITE_HOST` overrides it at build time (and the pages read it).
 */
const ROOT = process.env.NEXT_PUBLIC_SITE_HOST || process.env.SITE_HOST || 'solrift.io';
const ESCAPED = ROOT.replace(/\./g, '\\.');
const SITE = [{ type: 'host' as const, value: `(www\\.)?${ESCAPED}` }];
const PLAY = [{ type: 'host' as const, value: `play\\.${ESCAPED}` }];
const SITE_ORIGIN = `https://${ROOT}`;
const PLAY_ORIGIN = `https://play.${ROOT}`;
/** A character's id in an address (a UUID). */
const UID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

const config: NextConfig = {
  reactStrictMode: true,
  // The shared package ships TypeScript source (used by client, server and tests).
  transpilePackages: ['@solrift/shared'],
  turbopack: { root: repoRoot },
  poweredByHeader: false,
  env: { NEXT_PUBLIC_SITE_HOST: ROOT },
  // The browser talks to the game server's REST API through the web origin, so cookies are same-origin.
  async rewrites() {
    return {
      beforeFiles: [
        // The game's host: its front door is the character lobby, and a character's id is the realm.
        { source: '/', has: PLAY, destination: '/game' },
        { source: `/:uid(${UID})`, has: PLAY, destination: '/play/:uid' },
      ],
      afterFiles: [{ source: '/api/:path*', destination: `${process.env.SERVER_ORIGIN ?? 'http://localhost:8787'}/:path*` }],
    };
  },
  async redirects() {
    return [
      // The website's pages live on the website's host...
      { source: '/game', has: PLAY, destination: '/', permanent: false },
      { source: '/market', has: PLAY, destination: `${SITE_ORIGIN}/market`, permanent: false },
      { source: '/farm', has: PLAY, destination: `${SITE_ORIGIN}/farm`, permanent: false },
      { source: '/camp', has: PLAY, destination: `${SITE_ORIGIN}/farm`, permanent: false },
      { source: '/camp', destination: '/farm', permanent: false },
      { source: '/beyond', has: PLAY, destination: `${SITE_ORIGIN}/beyond`, permanent: false },
      { source: '/token', has: PLAY, destination: `${SITE_ORIGIN}/token`, permanent: false },
      { source: '/shop', has: PLAY, destination: `${SITE_ORIGIN}/shop`, permanent: false },
      { source: '/classes/:path*', has: PLAY, destination: `${SITE_ORIGIN}/classes/:path*`, permanent: false },
      { source: '/welcome', has: PLAY, destination: SITE_ORIGIN, permanent: false },
      // ...and the game on the game's.
      { source: '/game', has: SITE, destination: `${PLAY_ORIGIN}/`, permanent: false },
      { source: '/play/:path*', has: SITE, destination: `${PLAY_ORIGIN}/play/:path*`, permanent: false },
    ];
  },
  // Lets automated builds (e.g. headless smoke tests) avoid clobbering a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default config;
