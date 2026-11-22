'use client';

import { useEffect, useState } from 'react';
import { ACHIEVEMENTS, ACH_CATEGORIES, ACH_TIERS, AUCTIONEER, BOUNTY_TIERS, BOUNTY_TIER_NAME, QUESTS, RIFT_GRADE_DEFS, STASHKEEPER, formatCoins, getItem, makeStack, npcById, questById, rewardCoins, rewardItems, shopOf, skillBookAbility, tooltipName, zoneDef, type AchCategory, type QuestDef, type QuestLog } from '@solrift/shared';
import './achievements.css';
import { useUi } from '../ui/store';
import { useToken } from '../token/store';
import { ItemView } from './ItemView';
import { AuctionWindow } from './AuctionUI';
import { StashWindow } from './StashUI';
import { CoinIcon, ShopWindow, XpIcon } from './ShopUI';

const nice = (name: string): string => name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** One objective as a quest line: "Zombies slain: 2/4" (a place to walk to has no count). */
function objectiveText(label: string, now: number, count: number): string {
  return count > 1 ? `${label}: ${now}/${count}` : label;
}

function Objectives({ quest, log, plain }: { quest: QuestDef; log: QuestLog; plain?: boolean }) {
  const active = log.status(quest.id) === 'active' || log.status(quest.id) === 'ready';
  const progress = log.progressOf(quest.id);
  return (
    <ul className="quest-objectives">
      {quest.objectives.map((o, i) => {
        const now = active ? progress[i] ?? 0 : 0;
        const done = active && now >= o.count;
        return (
          <li key={i} className={done ? 'done' : ''}>
            {plain || !active ? o.label + (o.count > 1 ? ` (${o.count})` : '') : objectiveText(o.label, now, o.count)}
          </li>
        );
      })}
    </ul>
  );
}

function Rewards({ quest, label = true }: { quest: QuestDef; label?: boolean }) {
  const r = quest.reward;
  // What a quest hands over can depend on your class (a skill book of your own).
  const cls = useUi((s) => s.cls);
  const itemLabel = (id: number): string => (skillBookAbility(id) !== null ? tooltipName(makeStack(id, 1)) : nice(getItem(id).name));
  return (
    <div className="quest-rewards">
      {label ? <span className="quest-rewards-label">Rewards</span> : null}
      <div className="quest-reward-items">
        {rewardItems(r, cls?.id ?? null).map((it) => (
          <div key={it.id} className="quest-reward-item" title={itemLabel(it.id)}>
            <div className="reward-icon">
              <ItemView stack={makeStack(it.id, it.count)} />
            </div>
            <span>{itemLabel(it.id)}</span>
          </div>
        ))}
        {r.xp > 0 ? (
          <div className="quest-reward-item quest-xp" data-reward="xp" title="XP">
            <div className="reward-icon">
              <XpIcon size={22} />
            </div>
            <span>{r.xp} XP</span>
          </div>
        ) : null}
        {rewardCoins(r) > 0 ? (
          <div className="quest-reward-item quest-coins" data-reward="coins" title="Auren">
            <div className="reward-icon">
              <CoinIcon size={22} />
            </div>
            <span>{formatCoins(rewardCoins(r))}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Talking to a quest giver: what they say, and the buttons to take up or hand in a quest. */
function DialogPanel() {
  const screen = useUi((s) => s.screen);
  const npcId = useUi((s) => s.dialogNpc);
  const api = useUi((s) => s.api);
  const log = useUi((s) => s.quests);
  useUi((s) => s.questsVersion);
  const shopOpen = useUi((s) => s.shopOpen);
  const npc = npcId ? npcById(npcId) : null;
  if (screen !== 'dialog' || !npc || !api) return null;
  const ready = log.readyFor(npc.id);
  const offers = log.offeredBy(npc.id);
  const waiting = log.waitingOn(npc.id);
  const idle = ready.length === 0 && offers.length === 0 && waiting.length === 0;
  // The Auctioneer has no wares and no quests: his window is the Auction House.
  if (npc.id === AUCTIONEER) return <AuctionWindow npc={npc} />;
  // The Stashkeeper has no wares and no quests either: his window is the stash.
  if (npc.id === STASHKEEPER) return <StashWindow npc={npc} />;
  const shop = shopOf(npc.id);
  // A merchant with no quest business opens the counter at once; one who has quests talks first, with a button to the wares.
  const shopOnly = !!shop && idle;
  const shopping = !!shop && (shopOpen || shopOnly);
  // At the counter the dialog gives way to the merchant's window.
  if (shopping) return <ShopWindow npc={npc} canGoBack={!shopOnly} />;
  return (
    <div id="quest-dialog" data-testid="quest-dialog" onContextMenu={(e) => e.preventDefault()}>
      <div className="dialog-card">
        <div className="dialog-head">
          <div>
            <h2>{npc.name}</h2>
            <span className="dialog-title">&lt;{npc.title}&gt;</span>
          </div>
          <button className="dialog-x" onClick={() => api.close()} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="dialog-body">
          {(shopping ? [] : ready).map((q) => (
            <section key={q.id} className="dialog-quest q-ready" data-quest={q.id}>
              <h3>
                <span className="mark">?</span> {q.name}
              </h3>
              <p>{q.complete}</p>
              <Rewards quest={q} />
              <button className="quest-btn" data-testid="quest-complete" onClick={() => api.questAction('complete', q.id)}>
                Complete Quest
              </button>
            </section>
          ))}
          {(shopping ? [] : offers).map((q) => (
            <section key={q.id} className="dialog-quest q-offer" data-quest={q.id}>
              <h3>
                <span className="mark">!</span> {q.name}
              </h3>
              <p>{q.offer}</p>
              <Objectives quest={q} log={log} plain />
              <Rewards quest={q} />
              <button className="quest-btn" data-testid="quest-accept" onClick={() => api.questAction('accept', q.id)}>
                Accept
              </button>
            </section>
          ))}
          {(shopping ? [] : waiting).map((q) => (
            <section key={q.id} className="dialog-quest q-waiting" data-quest={q.id}>
              <h3>
                <span className="mark grey">?</span> {q.name}
              </h3>
              <p>{q.progress}</p>
              <Objectives quest={q} log={log} />
            </section>
          ))}
          {idle && !shopping ? <p className="dialog-greeting">{shop && idle ? shop.line : npc.greeting}</p> : null}
        </div>
        <div className="dialog-foot">
          {shop ? (
            <button className="quest-btn" data-testid="shop-toggle" onClick={() => useUi.setState({ shopOpen: !shopOpen })}>
              {shopping ? 'Back' : 'Browse wares'}
            </button>
          ) : null}
          <button className="quest-btn secondary" onClick={() => api.close()}>
            Goodbye
          </button>
        </div>
      </div>
    </div>
  );
}

/** The rift that is open near the player: what it is, the wave it is at, how many monsters are left, the time, where it lies and what you have done in it. */
function RiftBlock() {
  const rift = useUi((s) => s.rift);
  if (!rift) return null;
  const color = RIFT_GRADE_DEFS[rift.grade].color;
  const near = rift.dist <= 48;
  const mins = Math.floor(rift.seconds / 60);
  const secs = String(rift.seconds % 60).padStart(2, '0');
  return (
    <div className="tracker-quest tracker-rift" data-testid="rift-tracker" data-phase={rift.phase} style={{ ['--rift' as string]: color }}>
      <div className="tracker-name" style={{ color }}>
        {rift.name}
      </div>
      {rift.phase === 'omen' && <div className="tracker-line">Tearing open: {rift.seconds}s</div>}
      {rift.phase === 'fighting' && (
        <>
          <div className="tracker-line">
            Wave {rift.wave}/{rift.waves}: {rift.left} left
          </div>
          <div className="tracker-line">
            Time left {mins}:{secs}
          </div>
        </>
      )}
      {rift.phase === 'sealed' && <div className="tracker-line done">Sealed! Rewards given</div>}
      {rift.phase === 'collapsed' && <div className="tracker-line">It collapsed...</div>}
      {(rift.phase === 'omen' || rift.phase === 'fighting') && (
        <div className={`tracker-line${near ? ' done' : ''}`}>{near ? 'You are at the rift' : `${rift.dist} blocks ${rift.dir}`}</div>
      )}
      {rift.phase === 'fighting' && rift.score > 0 && <div className="tracker-line">Your part: {rift.score}</div>}
    </div>
  );
}

/** The quests under way, in the top right, like WoW's objective tracker: each one's title and what it asks for, and nothing at all without a quest. */
function QuestTracker() {
  const adventure = useUi((s) => s.adventure);
  const log = useUi((s) => s.quests);
  const screen = useUi((s) => s.screen);
  const logOpen = useUi((s) => s.questLogOpen);
  const dungeon = useUi((s) => s.dungeon);
  const rift = useUi((s) => s.rift);
  useUi((s) => s.questsVersion);
  // (A rift is told of everywhere, in any world; the quests only in Adventure.)
  if ((!adventure && !rift) || screen === 'dead' || (adventure && logOpen && !rift)) return null;
  const active = adventure && !logOpen ? log.activeQuests() : [];
  // (The element stays, empty and invisible, so there is always a place for the first quest to appear.)
  return (
    <div id="quest-tracker" data-testid="quest-tracker">
      {rift && <RiftBlock />}
      {dungeon && (
        <div className="tracker-quest tracker-dungeon" data-testid="dungeon-tracker">
          <div className="tracker-name">{dungeon.name}</div>
          <div className={`tracker-line${dungeon.cages >= dungeon.cagesTotal ? ' done' : ''}`}>Cages destroyed: {dungeon.cages}/{dungeon.cagesTotal}</div>
          <div className={`tracker-line${dungeon.gates >= dungeon.gatesTotal ? ' done' : ''}`}>Iron gates opened: {dungeon.gates}/{dungeon.gatesTotal}</div>
          <div className={`tracker-line${dungeon.boss === 'dead' ? ' done' : ''}`}>
            {dungeon.boss === 'dead' ? 'The Hollow King is slain: take the portal out' : dungeon.boss === 'fighting' ? 'The Hollow King: in combat' : 'The Hollow King: 0/1 slain'}
          </div>
        </div>
      )}
      {active.slice(0, 5).map((q) => {
        const ready = log.status(q.id) === 'ready';
        return (
          <div key={q.id} className={`tracker-quest${ready ? ' ready' : ''}`} data-quest={q.id}>
            <div className="tracker-name">{q.name}</div>
            {ready ? (
              <div className="tracker-line done">Ready to turn in: {npcById(q.turnIn)?.name ?? '?'}</div>
            ) : (
              q.objectives.map((o, i) => {
                const now = log.progressOf(q.id)[i] ?? 0;
                return (
                  <div key={i} className={`tracker-line${now >= o.count ? ' done' : ''}`}>
                    {objectiveText(o.label, now, o.count)}
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}

/** What the quests just did ("Quest accepted: ...", "Zombies slain: 2/4"), centred under the top of the screen. */
function QuestNotes() {
  const notes = useUi((s) => s.questNotes);
  if (notes.length === 0) return null;
  return (
    <div id="quest-notes" data-testid="quest-notes">
      {notes.map((n) => (
        <div key={n.key} className={`quest-note ${n.what}`}>
          {n.text}
        </div>
      ))}
    </div>
  );
}

/** "Dawnwatch - A small village at the edge of the Rift" when you walk into a named place. */
function ZoneBanner() {
  const zone = useUi((s) => s.zone);
  const stamp = zone?.stamp;
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (stamp === undefined) return;
    setShown(stamp);
    const t = setTimeout(() => setShown(null), 4200);
    return () => clearTimeout(t);
  }, [stamp]);
  const def = zone ? zoneDef(zone.id) : null;
  if (!def || shown === null) return null;
  return (
    <div id="zone-banner" key={shown} data-testid="zone-banner">
      <div className="zone-name">{def.name}</div>
      <div className="zone-sub">{def.sub}</div>
    </div>
  );
}

/** The achievements: by category, each with its tier and how far you are. */
function AchievementList() {
  const ach = useUi((s) => s.ach);
  const done = new Set(ach.done);
  // With a token on the server each tier shows what it pays ("Gold +40"); without one, just the tier.
  const pays = useToken((s) => (s.info?.live ? s.info.tiers : null));
  const loadInfo = useToken((s) => s.loadInfo);
  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);
  return (
    <div className="ach-list" data-testid="ach-list">
      <div className="ach-total">
        {done.size}/{ACHIEVEMENTS.length} won
      </div>
      {(Object.keys(ACH_CATEGORIES) as AchCategory[]).map((cat) => (
        <div key={cat} className="ach-cat">
          <h4>
            <span>{ACH_CATEGORIES[cat].name}</span>
            <em>{ACH_CATEGORIES[cat].blurb}</em>
          </h4>
          {ACHIEVEMENTS.filter((a) => a.category === cat).map((a) => {
            const now = Math.min(a.goal, Math.floor(ach.stats[a.stat] ?? 0));
            const won = done.has(a.id);
            return (
              <div key={a.id} className={`ach-row ${a.tier}${won ? ' won' : ''}`} data-ach={a.id}>
                <span className="ach-mark">{won ? '\u2713' : ''}</span>
                <div className="ach-body">
                  <div className="ach-name">{a.name}</div>
                  <div className="ach-text">{a.text}</div>
                  {!won ? (
                    <div className="ach-bar">
                      <i style={{ width: `${(now / a.goal) * 100}%` }} />
                      <b>
                        {now.toLocaleString()}/{a.goal.toLocaleString()}
                      </b>
                    </div>
                  ) : null}
                </div>
                <span className="ach-tier">
                  {ACH_TIERS[a.tier].name}
                  {pays ? ` +${pays[a.tier].toLocaleString()}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** "7h 20m", "42m" */
const leftLabel = (ms: number): string => {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

/** The day's three bounties: what each asks, how far along it is, and what it pays (with a token on the server and a signed-in wallet). */
function BountyList() {
  const view = useUi((s) => s.bounties);
  const at = useUi((s) => s.bountiesAt);
  const rewards = useToken((s) => (s.info?.live && s.info.limits.bountyRewards.length === BOUNTY_TIERS.length ? s.info.limits.bountyRewards : null));
  const loadInfo = useToken((s) => s.loadInfo);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    void loadInfo();
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [loadInfo]);
  if (!view) return <div className="ach-list" data-testid="bounty-list"><p className="log-empty">The bounty board is being posted…</p></div>;
  const done = view.rows.filter((r) => r.done).length;
  const left = Math.max(0, view.resetIn - (now - at));
  return (
    <div className="ach-list bounty-list" data-testid="bounty-list">
      <div className="ach-total">
        {done}/{view.rows.length} done today <em>new bounties in {leftLabel(left)}</em>
      </div>
      {view.rows.map((r) => {
        const pay = rewards ? rewards[BOUNTY_TIERS.indexOf(r.tier)] : 0;
        return (
          <div key={r.id} className={`ach-row bounty-${r.tier}${r.done ? ' won' : ''}`} data-bounty={r.id}>
            <span className="ach-mark">{r.done ? '\u2713' : ''}</span>
            <div className="ach-body">
              <div className="ach-name">{r.name}</div>
              <div className="ach-text">{r.text}</div>
              {!r.done ? (
                <div className="ach-bar">
                  <i style={{ width: `${(r.have / r.goal) * 100}%` }} />
                  <b>
                    {r.have.toLocaleString()}/{r.goal.toLocaleString()}
                  </b>
                </div>
              ) : null}
            </div>
            <span className="ach-tier">
              {BOUNTY_TIER_NAME[r.tier]}
              {pay > 0 ? ` +${pay.toLocaleString()}` : ''}
            </span>
          </div>
        );
      })}
      <p className="bounty-note">The same three for everyone, new every day (UTC). Each one done pays once per wallet a day, however many heroes you play.</p>
    </div>
  );
}

/** The quest log (L): quests by chapter on the left, the chosen one on the right. */
function QuestLogPanel() {
  const open = useUi((s) => s.questLogOpen);
  const log = useUi((s) => s.quests);
  const api = useUi((s) => s.api);
  useUi((s) => s.questsVersion);
  const [pick, setPick] = useState<string | null>(null);
  const [tab, setTab] = useState<'quests' | 'ach' | 'bounties'>('quests');
  const bounties = useUi((s) => s.bounties);
  if (!open || !api) return null;

  const known = QUESTS.filter((q) => log.status(q.id) !== 'locked' && log.status(q.id) !== 'available');
  // Finished quests leave the log; only the ones still being worked on are listed.
  const shown = known.filter((q) => log.status(q.id) !== 'done');
  const chapters = [...new Set(shown.map((q) => q.chapter))];
  const picked = pick ? questById(pick) : null;
  const chosen = (picked && shown.some((q) => q.id === picked.id) ? picked : null) ?? shown[0] ?? null;

  return (
    <div id="quest-log" data-testid="quest-log" onContextMenu={(e) => e.preventDefault()}>
      <div className="log-card">
        <div className="title">Quest Log</div>
        <button className="wow-close" onClick={() => api.toggleQuestLog(false)} aria-label="Close">
          &times;
        </button>
        <div className="log-head">
          <span className="log-count">
            {log.active.size} active
          </span>
        </div>
        <div className="log-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'quests'} className={tab === 'quests' ? 'sel' : ''} onClick={() => setTab('quests')}>
            Quests
          </button>
          <button role="tab" aria-selected={tab === 'ach'} className={tab === 'ach' ? 'sel' : ''} onClick={() => setTab('ach')} data-testid="ach-tab">
            Achievements
          </button>
          <button role="tab" aria-selected={tab === 'bounties'} className={tab === 'bounties' ? 'sel' : ''} onClick={() => setTab('bounties')} data-testid="bounty-tab">
            Daily{bounties ? ` ${bounties.rows.filter((r) => r.done).length}/${bounties.rows.length}` : ''}
          </button>
        </div>
        {tab === 'ach' ? <AchievementList /> : null}
        {tab === 'bounties' ? <BountyList /> : null}
        <div className="log-cols" style={tab !== 'quests' ? { display: 'none' } : undefined}>
          <div className="log-list">
            {shown.length === 0 ? <p className="log-empty">No active quests. Talk to the people of the village.</p> : null}
            {chapters.map((ch) => (
              <div key={ch} className="log-chapter">
                <h4>
                  <span>{ch}</span>
                  <em>
                    {known.filter((q) => q.chapter === ch && log.status(q.id) === 'done').length}/{known.filter((q) => q.chapter === ch).length}
                  </em>
                </h4>
                {shown
                  .filter((q) => q.chapter === ch)
                  .map((q) => {
                    const st = log.status(q.id);
                    return (
                      <button key={q.id} className={`log-entry ${st}${chosen?.id === q.id ? ' sel' : ''}`} onClick={() => setPick(q.id)} data-quest={q.id}>
                        <span className="log-dot">{st === 'done' ? '\u2713' : st === 'ready' ? '?' : '!'}</span>
                        <span className="log-entry-name">{q.name}</span>
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
          <div className="log-detail">
            {chosen ? (
              <>
                <div className="log-banner">
                  <span className={`log-status ${log.status(chosen.id)}`}>
                    {log.status(chosen.id) === 'done' ? 'Completed' : log.status(chosen.id) === 'ready' ? 'Ready to hand in' : 'In progress'}
                  </span>
                  <h3>{chosen.name}</h3>
                  <div className="log-giver">
                    {log.status(chosen.id) === 'done' ? `Given by ${npcById(chosen.giver)?.name ?? '?'}` : log.status(chosen.id) === 'ready' ? `Hand in to ${npcById(chosen.turnIn)?.name ?? '?'}` : `From ${npcById(chosen.giver)?.name ?? '?'}`}
                  </div>
                </div>
                <p className="log-summary">{chosen.summary}</p>
                {chosen.objectives.length > 0 && (
                  <>
                    <div className="wow-head">
                      <span>Objectives</span>
                    </div>
                    <Objectives quest={chosen} log={log} />
                  </>
                )}
                <div className="wow-head">
                  <span>Rewards</span>
                </div>
                <Rewards quest={chosen} label={false} />
                {log.active.has(chosen.id) ? (
                  <button className="quest-btn danger log-abandon" onClick={() => api.questAction('abandon', chosen.id)}>
                    Abandon quest
                  </button>
                ) : null}
              </>
            ) : (
              <p className="log-empty">Pick a quest from the list.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Everything the Adventure mode adds to the screen. Draws nothing in the other worlds. */
export function QuestUI() {
  const adventure = useUi((s) => s.adventure);
  const rift = useUi((s) => !!s.rift);
  // (Only the tracker is shown outside Adventure, and only for a rift.)
  if (!adventure) return rift ? <QuestTracker /> : null;
  return (
    <>
      <QuestTracker />
      <QuestNotes />
      <ZoneBanner />
      <DialogPanel />
      <QuestLogPanel />
    </>
  );
}
