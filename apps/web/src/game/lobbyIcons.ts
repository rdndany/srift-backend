import { ATLAS_COLS, ATLAS_ROWS, TILE_NAMES, TILE_PX } from '@solrift/shared';
import { paintTile } from './atlas';
import { ItemIcons } from './icons';

let icons: ItemIcons | null = null;

/**
 * The game's own item pictures (a block as an isometric cube, anything else as its sprite) for pages that have no running
 * game: the atlas is painted a tile at a time, only for the items that are really shown.
 */
export function lobbyIcons(): ItemIcons {
  if (icons) return icons;
  const atlas = document.createElement('canvas');
  atlas.width = ATLAS_COLS * TILE_PX;
  atlas.height = ATLAS_ROWS * TILE_PX;
  const ctx = atlas.getContext('2d', { willReadFrequently: true })!;
  const painted = new Set<number>();
  icons = new ItemIcons(atlas, (index) => {
    if (painted.has(index)) return;
    painted.add(index);
    paintTile(ctx, TILE_NAMES[index], index);
  });
  return icons;
}