import { defineConfig } from 'vitest/config';

// The fuzz and world-generation tests are CPU heavy; give them room when the machine is busy.
export default defineConfig({ test: { testTimeout: 30000 } });
