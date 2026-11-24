import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MOBS, MOB_SOLID_BOXES, mobReach } from '@solrift/shared';
import { RIGS } from './mobRenderer';
import { solidBoxes } from './mobSolidsBuild';

const FILE = fileURLToPath(new URL('../../../../packages/shared/src/mobSolidsData.ts', import.meta.url));

/** The data file as the models make it. */
function made(): string {
  const lines: string[] = [];
  for (const kind of Object.keys(RIGS).sort()) {
    const def = (MOBS as Record<string, { width: number } | undefined>)[kind];
    if (!def || def.width < 0.3) continue;
    const boxes = solidBoxes(RIGS[kind as keyof typeof RIGS], def.width);
    if (boxes.length === 0) continue;
    lines.push(`  ${kind}: [${boxes.map((b) => `[${b.join(', ')}]`).join(', ')}],`);
  }
  return `import type { SolidBox } from './physics';\n\n/** Generated: \`UPDATE_MOB_SOLIDS=1 npx vitest run apps/web/src/game/mobSolids.test.ts\` (see mobSolids.ts). */\nexport const MOB_SOLID_BOXES: Readonly<Record<string, readonly SolidBox[]>> = {\n${lines.join('\n')}\n};\n`;
}

describe('the shape of a creature, for a body that walks into it', () => {
  it('is what the models make (UPDATE_MOB_SOLIDS=1 writes it again)', () => {
    const now = made();
    if (process.env.UPDATE_MOB_SOLIDS) writeFileSync(FILE, now);
    expect(readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n')).toBe(now);
  });

  it("reaches out to a giant's arms, shield and head: further than its body is wide", () => {
    for (const kind of ['aurelion', 'gilt_colossus']) {
      const def = MOBS[kind as keyof typeof MOBS];
      expect(MOB_SOLID_BOXES[kind]?.length, kind).toBeGreaterThan(3);
      expect(mobReach(kind), kind).toBeGreaterThan(def.width / 2 + 0.3);
    }
  });

  it('has a head that sticks out in front of a horse (the front is -z)', () => {
    const boxes = MOB_SOLID_BOXES.horse ?? [];
    expect(Math.min(...boxes.map((b) => b[2] - b[5] / 2))).toBeLessThan(-0.6);
  });
});
