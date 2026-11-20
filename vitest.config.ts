import { defineConfig } from 'vitest/config';

// The fuzz and world-generation tests are CPU heavy; give them room when the machine is busy.
// The setup file puts the game's tuning (big numbers, slow levels) back to plain units for the rules' tests.
export default defineConfig({ test: { testTimeout: 30000, setupFiles: ['./vitest.setup.ts'] } });
