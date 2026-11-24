import { B } from './blocks';
import type { WorldAccess } from './headlessWorld';
import type { LandService } from './landService';
import type { BlockReader } from './physics';

/**
 * The world as one player's hands see it. Reads go straight to the world. A write is asked of the land first: if the block is somebody's,
 * the write does not happen. Every way a player changes a block (a pick, a placed block, a bucket, a spell, a blueprint) goes through
 * `Player.world`, so this one place answers for all of them, whatever the caller remembered to check.
 *
 * Switching something that is already there (a door, a lever) is not building: it is let through when the player may use it.
 */
export class GuardedWorld implements WorldAccess {
  constructor(
    private readonly inner: WorldAccess,
    private readonly land: () => LandService | null,
    private readonly account: () => string | null,
    /** Called with the refusal, for the player to be told (rate-limited by the caller). */
    private readonly refused: (x: number, y: number, z: number, why: 'claim' | 'band', owner: string | undefined) => void,
  ) {}

  getBlock(x: number, y: number, z: number): number {
    return this.inner.getBlock(x, y, z);
  }

  get physicsReader(): BlockReader {
    return this.inner.physicsReader;
  }

  surfaceY(x: number, z: number): number {
    return this.inner.surfaceY(x, z);
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.inner.hasChunk ? this.inner.hasChunk(cx, cz) : true;
  }

  forgetChunk(cx: number, cz: number): void {
    this.inner.forgetChunk?.(cx, cz);
  }

  chunkCoords(): { cx: number; cz: number }[] {
    return this.inner.chunkCoords ? this.inner.chunkCoords() : [];
  }

  growCrops(dt: number, rand?: () => number, onFire?: (x: number, y: number, z: number) => void): number {
    return this.inner.growCrops(dt, rand, onFire);
  }

  setBlock(x: number, y: number, z: number, id: number): boolean {
    const land = this.land();
    if (!land) return this.inner.setBlock(x, y, z, id);
    const was = this.inner.getBlock(x, y, z);
    if (was === id) return false;
    const account = this.account();
    if (!allowed(land, account, x, y, z, was, id)) return false;
    return land.withActor(account, () => this.inner.setBlock(x, y, z, id));
  }

  /** Why a write would be refused, for the toast of the caller that wants to say so. */
  why(x: number, y: number, z: number, id: number): 'claim' | 'band' | null {
    const land = this.land();
    if (!land) return null;
    const was = this.inner.getBlock(x, y, z);
    const d = land.checkBuild(this.account(), x, y, z, id === B.AIR ? 'break' : 'place', id);
    if (d.ok || (was !== B.AIR && id !== B.AIR && land.checkUse(this.account(), x, y, z, was).ok)) return null;
    this.refused(x, y, z, d.why ?? 'claim', d.owner);
    return d.why ?? 'claim';
  }

  // TreeEditor (what a grown tree needs) is the same two methods.
}

function allowed(land: LandService, account: string | null, x: number, y: number, z: number, was: number, id: number): boolean {
  if (id === B.AIR) return land.checkBuild(account, x, y, z, 'break').ok;
  if (was === B.AIR) return land.checkBuild(account, x, y, z, 'place', id).ok;
  // One block for another: a door swinging, a lever, a crop that grew, farmland tilled.
  return land.checkBuild(account, x, y, z, 'place', id).ok || land.checkUse(account, x, y, z, was).ok;
}
