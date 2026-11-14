import { cleanGuildName, cleanGuildTag, parseGuild, type GuildData, type GuildMember } from '@solrift/shared';
import type { RoomStore } from './roomStore';

const INDEX_KEY = 'guilds';

/**
 * Every guild of the realm. They are few and small, so all are read when the room starts and kept in memory; each is written
 * back when it changes. Without a store (a test, a throwaway server) they live as long as the room does.
 */
export class GuildRegistry {
  private readonly guilds = new Map<string, GuildData>();
  /** Which guild an account is in. */
  private readonly byKey = new Map<string, string>();
  private nextId = 1;

  constructor(private readonly store: RoomStore | null) {
    const raw = store?.getJson(INDEX_KEY);
    const ids = raw && typeof raw === 'object' && Array.isArray((raw as { ids?: unknown }).ids) ? ((raw as { ids: unknown[] }).ids.filter((x) => typeof x === 'string') as string[]) : [];
    for (const id of ids) {
      const g = parseGuild(store?.getJson(`guild:${id}`));
      if (g) this.index(g);
    }
  }

  private index(g: GuildData): void {
    this.guilds.set(g.id, g);
    for (const m of g.members) this.byKey.set(m.key, g.id);
    const n = Number(g.id.replace(/^g/, ''));
    if (Number.isFinite(n)) this.nextId = Math.max(this.nextId, n + 1);
  }

  of(key: string | null): GuildData | null {
    const id = key ? this.byKey.get(key) : undefined;
    return (id && this.guilds.get(id)) || null;
  }

  get(id: string): GuildData | null {
    return this.guilds.get(id) ?? null;
  }

  /** Is the name or the tag taken (any case)? Says which. */
  taken(name: string, tag: string): 'name' | 'tag' | null {
    const n = cleanGuildName(name).toLowerCase();
    const t = cleanGuildTag(tag);
    for (const g of this.guilds.values()) {
      if (g.name.toLowerCase() === n) return 'name';
      if (g.tag === t) return 'tag';
    }
    return null;
  }

  create(name: string, tag: string, founder: { key: string; name: string }): GuildData {
    const g: GuildData = { id: `g${this.nextId++}`, name: cleanGuildName(name), tag: cleanGuildTag(tag), motd: '', members: [{ key: founder.key, name: founder.name, rank: 0 }] };
    this.index(g);
    this.save(g);
    return g;
  }

  join(g: GuildData, who: { key: string; name: string }): GuildMember {
    const m: GuildMember = { key: who.key, name: who.name, rank: 2 };
    g.members.push(m);
    this.byKey.set(who.key, g.id);
    this.save(g);
    return m;
  }

  /** Take somebody out (the guild goes with its last member). */
  remove(g: GuildData, key: string): void {
    g.members = g.members.filter((m) => m.key !== key);
    this.byKey.delete(key);
    if (g.members.length === 0) this.disband(g);
    else this.save(g);
  }

  disband(g: GuildData): void {
    for (const m of g.members) this.byKey.delete(m.key);
    this.guilds.delete(g.id);
    this.store?.deleteJson(`guild:${g.id}`);
    this.saveIndex();
  }

  /** Write a changed guild (rank, message of the day, a member's new name). */
  save(g: GuildData): void {
    this.store?.setJson(`guild:${g.id}`, g);
    this.saveIndex();
  }

  private saveIndex(): void {
    this.store?.setJson(INDEX_KEY, { ids: [...this.guilds.keys()] });
  }
}
