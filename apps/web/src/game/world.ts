import * as THREE from 'three';
import { B, CHUNK_SIZE, IS_LEAVES, IS_SOLID, LIGHT_EMIT, WORLD_HEIGHT, blockIndex, chunkKey, growPlants, type BlockReader, type SaveStore, type WorldAccess, type WorldKind } from '@solrift/shared';
import type { Atlas } from './atlas';
import { createChunkMaterials, type ChunkMaterials } from './chunkMaterial';
import type { MeshData, MeshResult } from './mesher';
import { SHADOW_LAYER } from './shadows';

import type { WorkerRequest, WorkerResponse } from './worker';

interface ChunkEntry {
  cx: number;
  cz: number;
  data: Uint16Array;
  modified: boolean;
  needsSave: boolean;
  dirty: boolean;
  urgent: boolean;
  meshing: boolean;
  meshed: boolean;
  opaque: THREE.Mesh | null;
  translucent: THREE.Mesh | null;
  triangles: number;
  /** Counts the edits made to the chunk, so the map knows when to paint it again. */
  rev: number;
}

interface PoolWorker {
  worker: Worker;
  inflight: number;
}

export interface WorldStats {
  loaded: number;
  meshed: number;
  triangles: number;
  quads: number;
  pendingGen: number;
  lastMeshMs: number;
}

const MAX_INFLIGHT_PER_WORKER = 2;
/** Distance from a chunk edge within which an ordinary edit can change a neighbour's lighting noticeably. */
const LIGHT_REACH = 3;
/** Emissive blocks light up to 14 blocks away. */
const EMITTER_REACH = 14;

export class World implements WorldAccess {
  readonly group = new THREE.Group();
  readonly stats: WorldStats = { loaded: 0, meshed: 0, triangles: 0, quads: 0, pendingGen: 0, lastMeshMs: 0 };
  renderDistance = 8;
  /** How many chunks in view are not yet drawn (the land has all arrived when it is 0). */
  waiting = 0;
  readonly materials: ChunkMaterials;
  /** Counts every time a chunk mesh was replaced. */
  meshVersion = 0;
  /** Told the box of the world whose solid terrain was meshed again (the shadow maps that show it are drawn again). */
  onRemesh: ((x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => void) | null = null;

  private chunks = new Map<number, ChunkEntry>();
  /** Edited chunks, kept even after being unloaded so edits are never lost. */
  private modifiedChunks = new Map<number, Uint16Array>();
  private pendingGen = new Set<number>();
  /** Edits made by other players, per chunk (block index -> id). Applied to chunks as they load. */
  private remoteEdits = new Map<number, Map<number, number>>();
  private pool: PoolWorker[] = [];
  private offsets: { dx: number; dz: number; d: number }[] = [];
  private frame = 0;
  private disposed = false;

  constructor(
    seed: number,
    atlas: Atlas,
    private readonly store: Pick<SaveStore, 'loadChunks' | 'saveChunks'> | null,
    kind: WorldKind = 'overworld',
  ) {
    this.materials = createChunkMaterials(atlas);

    const n = Math.max(2, Math.min(5, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) {
      const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      const pw: PoolWorker = { worker, inflight: 0 };
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onWorkerMessage(pw, e.data);
      this.send(pw, { type: 'init', seed, kind });
      this.pool.push(pw);
    }
    this.setRenderDistance(this.renderDistance);
  }

  async loadSaved(): Promise<void> {
    if (!this.store) return;
    try {
      const saved = await this.store.loadChunks();
      for (const [k, data] of saved) {
        const [cx, cz] = k.split(',').map(Number);
        this.modifiedChunks.set(chunkKey(cx, cz), data);
      }
    } catch (err) {
      console.warn('failed to load saved chunks', err);
    }
  }

  setRenderDistance(r: number): void {
    this.renderDistance = r;
    const reach = r + 1;
    this.offsets = [];
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        const d = Math.hypot(dx, dz);
        if (d <= reach + 0.5) this.offsets.push({ dx, dz, d });
      }
    }
    this.offsets.sort((a, b) => a.d - b.d);
  }

  private send(pw: PoolWorker, msg: WorkerRequest, transfer: Transferable[] = []): void {
    pw.worker.postMessage(msg, transfer);
  }

  private leastBusy(): PoolWorker | null {
    let best: PoolWorker | null = null;
    for (const pw of this.pool) {
      if (pw.inflight >= MAX_INFLIGHT_PER_WORKER) continue;
      if (!best || pw.inflight < best.inflight) best = pw;
    }
    return best;
  }

  // ---- BlockReader ----------------------------------------------------

  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return B.BEDROCK;
    if (y >= WORLD_HEIGHT) return B.AIR;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c) return B.AIR;
    return c.data[blockIndex(x & 15, y, z & 15)];
  }

  /** Physics reader: unloaded terrain is solid so the player can't fall through the void. */
  readonly physicsReader: BlockReader = {
    getBlock: (x, y, z) => {
      if (y < 0) return B.BEDROCK;
      if (y >= WORLD_HEIGHT) return B.AIR;
      const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
      return c ? c.data[blockIndex(x & 15, y, z & 15)] : B.STONE;
    },
  };

  /**
   * Apply edits from the server ([x, y, z, id, ...]). Chunks that are not loaded yet get them when
   * they are generated. These edits are the server's, so they are not saved locally.
   */
  applyRemoteEdits(blocks: number[]): void {
    for (let i = 0; i + 3 < blocks.length; i += 4) {
      const x = blocks[i];
      const y = blocks[i + 1];
      const z = blocks[i + 2];
      const id = blocks[i + 3];
      if (y < 0 || y >= WORLD_HEIGHT) continue;
      const key = chunkKey(x >> 4, z >> 4);
      let edits = this.remoteEdits.get(key);
      if (!edits) this.remoteEdits.set(key, (edits = new Map()));
      edits.set(blockIndex(x & 15, y, z & 15), id);
      this.setBlock(x, y, z, id);
    }
  }

  /** Is this chunk here? (A dungeon's cages and gates are only looked at where the land is loaded: what is far away has not been touched.) */
  hasChunk(cx: number, cz: number): boolean {
    return this.chunks.has(chunkKey(cx, cz));
  }

  /** The chunks that are loaded (the Gilded Tide hides its creatures over them). */
  chunkCoords(): { cx: number; cz: number }[] {
    const out: { cx: number; cz: number }[] = [];
    for (const c of this.chunks.values()) out.push({ cx: c.cx, cz: c.cz });
    return out;
  }

  isChunkMeshed(cx: number, cz: number): boolean {
    return this.chunks.get(chunkKey(cx, cz))?.meshed ?? false;
  }

  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const cx = x >> 4;
    const cz = z >> 4;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return false;
    const lx = x & 15;
    const lz = z & 15;
    const idx = blockIndex(lx, y, lz);
    const old = c.data[idx];
    if (old === id) return false;
    c.data[idx] = id;
    c.rev++;
    c.modified = true;
    c.needsSave = true;
    this.modifiedChunks.set(chunkKey(cx, cz), c.data);
    this.markDirty(c);

    // Neighbouring chunks may see changed faces (AO / culling) and light.
    const reach = LIGHT_EMIT[old] > 0 || LIGHT_EMIT[id] > 0 ? EMITTER_REACH : LIGHT_REACH;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const nearX = dx === 0 || (dx < 0 ? lx <= reach : lx >= 15 - reach);
        const nearZ = dz === 0 || (dz < 0 ? lz <= reach : lz >= 15 - reach);
        if (!nearX || !nearZ) continue;
        const n = this.chunks.get(chunkKey(cx + dx, cz + dz));
        if (n) this.markDirty(n);
      }
    }
    return true;
  }

  private markDirty(c: ChunkEntry): void {
    c.dirty = true;
    c.urgent = true;
  }

  /** The blocks of a loaded chunk (read only: the map paints from them), or null. */
  chunkData(cx: number, cz: number): Uint16Array | null {
    return this.chunks.get(chunkKey(cx, cz))?.data ?? null;
  }

  /** How many edits a loaded chunk has had, or -1 when it is not loaded. */
  chunkRev(cx: number, cz: number): number {
    return this.chunks.get(chunkKey(cx, cz))?.rev ?? -1;
  }

  /** Highest solid, non-liquid block at (x, z), or -1 if the column isn't loaded. */
  surfaceY(x: number, z: number): number {
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c) return -1;
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const id = c.data[blockIndex(x & 15, y, z & 15)];
      if (IS_SOLID[id] && !IS_LEAVES[id]) return y;
    }
    return 0;
  }

  /**
   * Random growth of wheat and saplings in edited chunks (they only exist where a player planted
   * them). Call every couple of seconds with the elapsed time. Returns how many plants advanced.
   */
  growCrops(dt: number, rand: () => number = Math.random): number {
    return growPlants(this.chunks.values(), this, dt, rand);
  }

  // ---- streaming ------------------------------------------------------

  update(px: number, pz: number): void {
    if (this.disposed) return;
    this.frame++;
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    const R = this.renderDistance;

    // 1) Edits first: remesh immediately so block changes feel instant.
    for (const c of this.chunks.values()) {
      if (c.urgent && c.dirty && !c.meshing && c.meshed) this.dispatchMesh(c, true);
    }

    // 2) Generate then mesh, nearest first.
    let waiting = 0;
    for (const o of this.offsets) {
      const cx = pcx + o.dx;
      const cz = pcz + o.dz;
      const key = chunkKey(cx, cz);
      const c = this.chunks.get(key);
      if (o.d <= R + 0.5 && (!c || !c.meshed || c.dirty || c.meshing)) waiting++;
      if (!c) {
        if (this.pendingGen.has(key)) continue;
        const saved = this.modifiedChunks.get(key);
        if (saved) {
          this.addChunk(cx, cz, saved, true);
          continue;
        }
        const pw = this.leastBusy();
        if (!pw) continue;
        pw.inflight++;
        this.pendingGen.add(key);
        this.send(pw, { type: 'gen', cx, cz });
        continue;
      }
      if (o.d <= R + 0.5 && (!c.meshed || c.dirty) && !c.meshing) this.dispatchMesh(c, false);
    }
    this.stats.pendingGen = this.pendingGen.size;
    this.waiting = waiting;

    // 3) Unload far chunks occasionally.
    if (this.frame % 30 === 0) this.unloadFar(pcx, pcz, R + 3);
  }

  private neighborsLoaded(cx: number, cz: number): boolean {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (!this.chunks.has(chunkKey(cx + dx, cz + dz))) return false;
      }
    }
    return true;
  }

  private dispatchMesh(c: ChunkEntry, urgent: boolean): void {
    if (!this.neighborsLoaded(c.cx, c.cz)) return;
    const pw = urgent ? this.pool.reduce((a, b) => (a.inflight <= b.inflight ? a : b)) : this.leastBusy();
    if (!pw) return;

    // The block data of the nine chunks goes to the worker as it is (a plain copy, quick); the worker puts the region together.
    const chunks: Uint16Array[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) chunks.push(this.chunks.get(chunkKey(c.cx + dx, c.cz + dz))!.data);
    c.meshing = true;
    c.dirty = false;
    c.urgent = false;
    pw.inflight++;
    this.send(pw, { type: 'mesh', cx: c.cx, cz: c.cz, chunks });
  }

  private addChunk(cx: number, cz: number, data: Uint16Array, modified: boolean): ChunkEntry {
    const entry: ChunkEntry = {
      cx,
      cz,
      data,
      modified,
      needsSave: false,
      dirty: false,
      urgent: false,
      meshing: false,
      meshed: false,
      opaque: null,
      translucent: null,
      triangles: 0,
      rev: 0,
    };
    this.chunks.set(chunkKey(cx, cz), entry);
    return entry;
  }

  private onWorkerMessage(pw: PoolWorker, msg: WorkerResponse): void {
    if (this.disposed) return;
    pw.inflight = Math.max(0, pw.inflight - 1);
    if (msg.type === 'chunk') {
      const key = chunkKey(msg.cx, msg.cz);
      this.pendingGen.delete(key);
      if (!this.chunks.has(key)) {
        const edits = this.remoteEdits.get(key);
        if (edits) for (const [idx, id] of edits) msg.data[idx] = id;
        this.addChunk(msg.cx, msg.cz, msg.data, false);
      }
      return;
    }
    const c = this.chunks.get(chunkKey(msg.cx, msg.cz));
    if (!c) return;
    c.meshing = false;
    c.meshed = true;
    this.stats.lastMeshMs = msg.ms;
    this.applyMesh(c, msg.result);
  }

  private applyMesh(c: ChunkEntry, result: MeshResult): void {
    const ox = c.cx * CHUNK_SIZE;
    const oz = c.cz * CHUNK_SIZE;
    // The heights the solid terrain of this chunk took up before and takes up now: what casts shadows changed somewhere in between.
    const was = c.opaque?.geometry.boundingBox;
    let y0 = was ? was.min.y : Infinity;
    let y1 = was ? was.max.y : -Infinity;
    c.opaque = this.swapMesh(c.opaque, result.opaque, this.materials.opaque, ox, oz, 0);
    c.translucent = this.swapMesh(c.translucent, result.translucent, this.materials.translucent, ox, oz, 1);
    const is = c.opaque?.geometry.boundingBox;
    if (is) {
      y0 = Math.min(y0, is.min.y);
      y1 = Math.max(y1, is.max.y);
    }
    if (y1 >= y0) this.onRemesh?.(ox, y0, oz, ox + CHUNK_SIZE, y1, oz + CHUNK_SIZE);
    this.meshVersion++;
    const tris = (result.opaque?.indices.length ?? 0) / 3 + (result.translucent?.indices.length ?? 0) / 3;
    this.stats.triangles += tris - c.triangles;
    c.triangles = tris;
  }

  private swapMesh(
    old: THREE.Mesh | null,
    data: MeshData | null,
    material: THREE.Material,
    ox: number,
    oz: number,
    renderOrder: number,
  ): THREE.Mesh | null {
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
    }
    if (!data) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
    g.setAttribute('aTile', new THREE.BufferAttribute(data.tiles, 1));
    g.setAttribute('aLight', new THREE.BufferAttribute(data.light, 4, true));
    g.setIndex(new THREE.BufferAttribute(data.indices, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(ox, 0, oz);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.renderOrder = renderOrder;
    // Solid terrain (renderOrder 0) casts shadows; water and ice do not.
    if (renderOrder === 0) mesh.layers.enable(SHADOW_LAYER);
    this.group.add(mesh);
    return mesh;
  }

  private disposeChunkMeshes(c: ChunkEntry): void {
    for (const m of [c.opaque, c.translucent]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
    }
    c.opaque = c.translucent = null;
  }

  private unloadFar(pcx: number, pcz: number, maxDist: number): void {
    for (const [key, c] of this.chunks) {
      if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) <= maxDist) continue;
      this.disposeChunkMeshes(c);
      if (c.needsSave && this.store) void this.store.saveChunks([[c.cx, c.cz, c.data]]).catch(() => undefined);
      this.stats.triangles -= c.triangles;
      this.chunks.delete(key);
    }
  }

  /** Time-of-day sky light factor (0 = night, 1 = full day). */
  setTime(seconds: number): void {
    this.materials.setTime(seconds);
  }

  setDay(v: number): void {
    this.materials.setDay(v);
  }

  setFog(color: THREE.Color, near: number, far: number, zenith?: THREE.Color): void {
    this.materials.setFog(color, near, far, zenith);
  }

  refreshStats(): WorldStats {
    this.stats.loaded = this.chunks.size;
    let meshed = 0;
    for (const c of this.chunks.values()) if (c.meshed) meshed++;
    this.stats.meshed = meshed;
    this.stats.quads = Math.round(this.stats.triangles / 2);
    return this.stats;
  }

  /** Persist edited chunks. Safe to call frequently. */
  async save(): Promise<void> {
    if (!this.store) return;
    const batch: [number, number, Uint16Array][] = [];
    for (const c of this.chunks.values()) {
      if (c.needsSave) {
        batch.push([c.cx, c.cz, c.data]);
        c.needsSave = false;
      }
    }
    if (batch.length === 0) return;
    try {
      await this.store.saveChunks(batch);
    } catch (err) {
      console.warn('save failed', err);
      for (const [cx, cz] of batch) {
        const c = this.chunks.get(chunkKey(cx, cz));
        if (c) c.needsSave = true;
      }
    }
  }

  /** Stop workers and free GPU resources. Call `save()` first if edits must persist. */
  dispose(): void {
    this.disposed = true;
    for (const pw of this.pool) pw.worker.terminate();
    this.pool = [];
    for (const c of this.chunks.values()) this.disposeChunkMeshes(c);
    this.chunks.clear();
    this.materials.dispose();
  }
}
