import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { B, HOUR_MS, landKit } from '@solrift/shared';
import { SqliteLandStore } from './landStore';
import { SqliteRoomStore } from './roomStore';

const ME = 'hero-me';
const HOURS = (h: number): number => h * HOUR_MS;

function sqliteKit(file = ':memory:') {
  const db = new DatabaseSync(file);
  new SqliteRoomStore(db); // makes room_kv, where a purchase writes the buyer's save
  const store = new SqliteLandStore(db);
  return { db, store, kit: landKit({}, 'overworld', 7, store) };
}

describe('land in SQLite', () => {
  it('creates the tables and the indexes the spec asks for', () => {
    const { db } = sqliteKit();
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name);
    for (const t of ['land_claims', 'claim_permissions', 'world_modifications', 'restoration_jobs', 'claim_transactions']) expect(names).toContain(t);
    const idx = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]).map((r) => r.name);
    for (const i of ['world_modifications_chunk', 'world_modifications_due', 'claim_transactions_idem', 'restoration_jobs_due', 'land_claims_owner']) expect(idx).toContain(i);
  });

  it('buys land, writes the Auren, the deed and the receipt together, and finds them after a restart', () => {
    const { db, kit } = sqliteKit();
    const b = kit.buyer(10_000);
    const r = kit.land.purchase({ account: ME, ownerName: 'Me', name: 'Home', vertices: kit.rect(500, 500, 519, 519), idem: 'idem-sql-0001', carries: true }, b);
    expect(r.ok).toBe(true);
    const kv = db.prepare("SELECT value FROM room_kv WHERE key = 'player:test'").get() as { value: string };
    expect(JSON.parse(kv.value)).toEqual({ coins: 8000 });
    const txn = db.prepare('SELECT state, amount FROM claim_transactions').get() as { state: string; amount: number };
    expect(txn).toMatchObject({ state: 'committed', amount: 2000 });
    const again = kit.restart();
    expect(again.index.size).toBe(1);
    expect(again.index.claimAt(510, 510)?.name).toBe('Home');
    // The same request, after the restart, is the same answer and not a second charge.
    const b2 = kit.buyer(10_000);
    const rep = again.purchase({ account: ME, ownerName: 'Me', name: 'Home', vertices: kit.rect(500, 500, 519, 519), idem: 'idem-sql-0001', carries: true }, b2);
    expect(rep.ok).toBe(true);
    expect(rep.replay).toBe(true);
    expect(b2.coins).toBe(10_000);
    expect((db.prepare('SELECT COUNT(*) AS n FROM land_claims').get() as { n: number }).n).toBe(1);
  });

  it('rolls the whole purchase back when its write fails, Auren included', () => {
    const { db, store, kit } = sqliteKit();
    // A trigger makes the receipt's update fail after the deed and the Auren were written: the whole transaction must go.
    db.exec(`CREATE TRIGGER no_receipt BEFORE UPDATE ON claim_transactions BEGIN SELECT RAISE(ABORT, 'boom'); END;`);
    const b = kit.buyer(10_000);
    const r = kit.land.purchase({ account: ME, ownerName: 'Me', name: 'Home', vertices: kit.rect(500, 500, 519, 519), idem: 'idem-sql-0002', carries: true }, b);
    expect(r.ok).toBe(false);
    expect(b.coins).toBe(10_000);
    expect((db.prepare('SELECT COUNT(*) AS n FROM land_claims').get() as { n: number }).n).toBe(0);
    expect(db.prepare("SELECT value FROM room_kv WHERE key = 'player:test'").get()).toBeUndefined();
    expect(store.loadClaims('test')).toHaveLength(0);
    expect(kit.land.index.size).toBe(0);
  });

  it('keeps the invited players, and the roles, in their own table', () => {
    const { db, kit } = sqliteKit();
    const b = kit.buyer(10_000);
    const r = kit.land.purchase({ account: ME, ownerName: 'Me', name: 'Home', vertices: kit.rect(500, 500, 519, 519), idem: 'idem-sql-0003', carries: true }, b);
    const id = r.claim!.id;
    expect(kit.land.grant(ME, id, { kind: 'player', id: 'friend', name: 'Friend', role: 'builder' }).ok).toBe(true);
    kit.land.flush();
    expect((db.prepare('SELECT role FROM claim_permissions WHERE claim_id = ?').get(id) as { role: string }).role).toBe('builder');
    const again = kit.restart();
    expect(again.checkBuild('friend', 505, kit.world.surfaceY(505, 505) + 1, 505, 'place').ok).toBe(true);
    expect(again.revokeGrant(ME, id, 'player', 'friend').ok).toBe(true);
    kit.land.flush();
    expect(db.prepare('SELECT * FROM claim_permissions WHERE claim_id = ?').all(id)).toHaveLength(0);
  });

  it('keeps the ledger across a restart, and its restoration jobs summarised', () => {
    const { db, kit } = sqliteKit();
    const y = kit.world.surfaceY(700, 700);
    for (let i = 0; i < 5; i++) kit.edit(ME, 700, y - i, 700, 0);
    kit.land.flush();
    expect((db.prepare('SELECT COUNT(*) AS n FROM world_modifications').get() as { n: number }).n).toBe(5);
    const job = db.prepare('SELECT blocks, due FROM restoration_jobs').all() as { blocks: number; due: number }[];
    expect(job).toHaveLength(1);
    expect(job[0].blocks).toBe(5);
    kit.clock.now += HOURS(50);
    const again = kit.restart();
    expect(again.ledger.wildCount).toBe(5);
    kit.clock.now += HOURS(40);
    again.step();
    again.flush();
    expect(kit.world.getBlock(700, y, 700)).not.toBe(B.AIR);
    expect((db.prepare('SELECT COUNT(*) AS n FROM world_modifications').get() as { n: number }).n).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS n FROM restoration_jobs').get() as { n: number }).n).toBe(0);
  });

  it('keeps a claimed change and its claim together after a restart', () => {
    const { kit } = sqliteKit();
    const b = kit.buyer(10_000);
    kit.land.purchase({ account: ME, ownerName: 'Me', name: 'Home', vertices: kit.rect(500, 500, 519, 519), idem: 'idem-sql-0004', carries: true }, b);
    const y = kit.world.surfaceY(505, 505);
    expect(kit.edit(ME, 505, y + 1, 505, B.PLANKS)).toBe(true);
    const again = kit.restart();
    expect(again.ledger.at(505, y + 1, 505)?.cls).toBe('claimed');
    kit.clock.now += HOURS(24 * 365);
    again.step();
    expect(kit.world.getBlock(505, y + 1, 505)).toBe(B.PLANKS);
  });

  it('writes a backup that opens as a database of its own', () => {
    const { store, kit } = sqliteKit();
    kit.land.purchase({ account: ME, ownerName: 'Me', name: 'Home', vertices: kit.rect(500, 500, 519, 519), idem: 'idem-sql-0005', carries: true }, kit.buyer(10_000));
    const file = `${process.env.TEMP ?? '.'}/solrift-land-backup-${Date.now()}.db`;
    store.backupTo(file);
    const copy = new DatabaseSync(file);
    expect((copy.prepare('SELECT COUNT(*) AS n FROM land_claims').get() as { n: number }).n).toBe(1);
    copy.close();
  });
});
