'use client';

import { COMPANION_LOOT_BONUS, DAILY_CAP_DAYS, EXPEDITIONS, WINGS_TIME_BONUS, expeditionById, getItem, tripMs, type DeskView } from '@solrift/shared';
import { useEffect, useState } from 'react';
import { useCamp } from '../camp/store';
import { ItemSprite } from './ItemSprite';
import { span } from './CampParts';
import { CoinIcon } from './ShopUI';

/** The server's clock, kept ticking between two answers, so that a countdown does not depend on the device's clock. */
function useServerNow(view: DeskView): number {
  const [, tick] = useState(0);
  const [base] = useState(() => ({ at: 0, now: 0 }));
  if (base.now !== view.camp.now) {
    base.now = view.camp.now;
    base.at = Date.now();
  }
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return base.now + (Date.now() - base.at);
}

const itemLabel = (id: number, count: number) => `${count} ${getItem(id).name.replace(/_/g, ' ')}`;

/** The daily check-in: one gift a day for the wallet, bigger with each day in a row. */
export function DailyCard({ view }: { view: DeskView }) {
  const act = useCamp((s) => s.act);
  const busy = useCamp((s) => s.busy);
  const d = view.camp.daily;
  // The week the streak is in: the dots fill up through it, and the seventh day brings the gift.
  const inWeek = Math.max(1, ((Math.max(1, d.nextStreak) - 1) % DAILY_CAP_DAYS) + 1);
  const filled = d.can ? inWeek - 1 : d.streak > 0 ? inWeek : 0;
  return (
    <section className="camp-daily" data-testid="camp-daily" aria-label="Daily check-in">
      <div>
        <h3>Daily check-in</h3>
        <p>
          {d.can ? (
            <>
              Day {d.nextStreak} in a row: <b>{d.coins.toLocaleString('en-US')}</b> <CoinIcon size={14} />
              {d.gift && <> and {itemLabel(d.gift.id, d.gift.count)}</>}
            </>
          ) : (
            <>Checked in. Come back tomorrow{d.streak > 0 ? `: that is day ${d.streak + 1}` : ''}.</>
          )}
        </p>
        <ol className="camp-days" aria-label="Days in a row">
          {Array.from({ length: DAILY_CAP_DAYS }, (_, i) => (
            <li key={i} className={i < filled ? 'done' : d.can && i === filled ? 'now' : ''} aria-label={`Day ${i + 1}`} />
          ))}
        </ol>
      </div>
      <button type="button" className="camp-btn primary" disabled={!d.can || busy} onClick={() => void act({ a: 'daily' })}>
        {d.can ? 'Check in' : 'Done today'}
      </button>
    </section>
  );
}

/** Expeditions: send the hero out for a while, and collect what it found. The hero must be away from the game for it to be paid out. */
export function CampTrips({ view }: { view: DeskView }) {
  const act = useCamp((s) => s.act);
  const busy = useCamp((s) => s.busy);
  const now = useServerNow(view);
  const trip = view.camp.trip;
  const def = trip ? expeditionById(trip.id) : undefined;
  const wings = !!view.worn.wings;
  const pet = !!view.worn.companion;
  const locked = view.inGame;

  return (
    <div className="camp-pane" data-testid="camp-trips">
      {locked && <p className="camp-warn">Your hero is in the game right now, so it cannot go anywhere. Leave the game first.</p>}

      {trip && def && (
        <section className="camp-trip-now" data-testid="camp-trip-now">
          <h3>{def.name}</h3>
          {now >= trip.end ? (
            <>
              <p>Your hero is back{trip.pet ? ', and the pet helped' : ''}. It found:</p>
              <ul className="camp-found">
                <li>
                  {trip.result?.coins.toLocaleString('en-US')} <CoinIcon size={14} />
                </li>
                {trip.result?.items.map((it) => (
                  <li key={it.id}>
                    <ItemSprite id={it.id} size={20} /> {itemLabel(it.id, it.count)}
                  </li>
                ))}
              </ul>
              <button type="button" className="camp-btn primary" disabled={busy || locked} onClick={() => void act({ a: 'trip', op: 'claim' })}>
                Collect
              </button>
            </>
          ) : (
            <>
              <p>
                Away for <b>{span(trip.end - now)}</b> more.
              </p>
              <div className="camp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, (now - trip.start) / (trip.end - trip.start)) * 100)}>
                <i style={{ width: `${Math.min(100, Math.max(2, ((now - trip.start) / (trip.end - trip.start)) * 100))}%` }} />
              </div>
              <p className="camp-hint">What it finds is a surprise until it is back.</p>
            </>
          )}
        </section>
      )}

      <h3 className="camp-h3">Where to</h3>
      <ul className="camp-list">
        {EXPEDITIONS.map((e) => {
          const low = view.hero.level < e.level;
          return (
            <li key={e.id} className="camp-trip">
              <div>
                <b>{e.name}</b>
                <p>{e.blurb}</p>
                <small>
                  {span(tripMs(e, wings))}
                  {wings && ' (wings)'} &middot; {e.coins[0]}&ndash;{e.coins[1]} Auren &middot; level {e.level}
                </small>
              </div>
              <button type="button" className="camp-btn" data-testid={`camp-go-${e.id}`} disabled={busy || locked || !!trip || low} onClick={() => void act({ a: 'trip', op: 'start', id: e.id })}>
                {low ? `Level ${e.level}` : trip ? 'Away' : 'Send'}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="camp-hint">
        Wings make a trip {Math.round(WINGS_TIME_BONUS * 100)}% shorter{wings ? ' (yours are on)' : ''}. A companion finds {Math.round(COMPANION_LOOT_BONUS * 100)}% more{pet ? ' (yours is on)' : ''}. Wear them on the Hero tab before you send the hero out. Trips give Auren and supplies only: no experience, no $SOLRIFT.
      </p>
    </div>
  );
}
