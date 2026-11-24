import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, TILE_NAMES, TILE_PX, getItem } from '@solrift/shared';
import { paintTile } from './atlas';
import { Character } from './character';
import { ItemFigures } from './held/figures';
import { HeldViews } from './held/kinds';
import { ItemModels } from './held/models';
import { SurveyorSignals } from './held/surveyor';

let figures: ItemFigures | null = null;

/**
 * The same models a figure holds in the world (a sword of voxels, a mage's staff of blocks, a shield), for a page that has no running game.
 * Painted once, then kept: every call makes a new object that shares the shapes of the first.
 */
function lobbyFigures(): ItemFigures {
  if (figures) return figures;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE_PX;
  canvas.height = ATLAS_ROWS * TILE_PX;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  TILE_NAMES.forEach((name, i) => paintTile(ctx, name, i));
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  const models = new ItemModels(canvas, texture);
  const views = new HeldViews({
    models,
    scene: new THREE.Scene(),
    makeChar: () => new Character(),
    surveyor: new SurveyorSignals(),
  });
  figures = new ItemFigures(models, views);
  return figures;
}

/** What a figure carries: a shield on the arm, anything else in the hand (the same choice the world makes). */
export function lobbyFigure(id: number): THREE.Object3D | null {
  if (!id) return null;
  const made = lobbyFigures();
  return getItem(id).shield ? made.figureShield(id) : made.figureModel(id);
}
