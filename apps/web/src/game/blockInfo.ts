import { BLOCKS } from '@solrift/shared';

/** What the admin panel at the crosshair says about a block: its name and place, then what it is made of and how it behaves. */
export function blockInfoText(x: number, y: number, z: number, id: number, biome?: string): string {
  const b = BLOCKS[id];
  if (!b) return `unknown block #${id}\n${x} ${y} ${z}`;
  const traits = [b.solid ? 'solid' : 'passable', b.opaque ? 'opaque' : 'see-through', b.liquid ? 'liquid' : '', b.replaceable ? 'replaceable' : '', b.render === 'opaque' ? '' : b.render, b.shape].filter(Boolean);
  const dig = Number.isFinite(b.hardness) ? `hardness ${b.hardness}${b.tool ? `  ${b.tool}` : ''}${b.harvest > 0 ? `  needs tier ${b.harvest}` : ''}` : 'unbreakable';
  return [
    `${b.name}  #${id}`,
    `${x} ${y} ${z}${biome ? `  ${biome}` : ''}`,
    traits.join(' · '),
    dig,
    `light ${b.light}  sound ${b.sound}${b.axis !== undefined ? `  axis ${b.axis === 0 ? 'x' : 'z'}` : ''}`,
  ].join('\n');
}
