'use client';

import { useEffect } from 'react';
import { useToken } from '../token/store';
import { TokenIcon } from './TokenPurse';
import './tokenEconomy.css';

const n = (v: number) => v.toLocaleString('en-US');

/** "Nov 21" from "2026-11-21" (UTC, as the days are cut). */
const dayLabel = (iso: string): string => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * The honest numbers of the loop, read from the ledger: what the game paid out, what players spent and what came back to the treasury,
 * what left by withdrawal and what is held. Shown on the token page; it names no wallet.
 */
export function TokenEconomy() {
  const eco = useToken((s) => s.economy);
  const load = useToken((s) => s.loadEconomy);
  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);
  if (!eco) return null;

  const { totals } = eco;
  const top = Math.max(1, ...eco.days.flatMap((d) => [d.earned, d.spent]));
  const quiet = totals.earned.total === 0 && totals.spent.total === 0;
  const cards: { label: string; value: number; note: string }[] = [
    { label: 'Paid out', value: totals.earned.total, note: `${n(eco.paidToday)} today of ${n(eco.dailyPool)}` },
    { label: 'Back to the treasury', value: totals.spent.total, note: eco.returnedPct === null ? 'nothing paid out yet' : `${eco.returnedPct}% of what was paid out` },
    { label: 'Held by players', value: eco.held.tokens, note: `${n(eco.held.wallets)} ${eco.held.wallets === 1 ? 'wallet' : 'wallets'}` },
    { label: 'Withdrawn', value: totals.withdrawn, note: 'sent to players\u2019 own wallets' },
  ];

  return (
    <div className="tkeco" data-testid="token-economy">
      <h3>
        The loop, <em>in numbers</em>
      </h3>
      <p className="tkeco-lead">
        Read straight from the game&rsquo;s ledger, in whole $SOLRIFT. What players spend is not burned: it stays in the treasury and pays for later rewards.
      </p>
      <ul className="tkeco-cards">
        {cards.map((c) => (
          <li key={c.label}>
            <small>{c.label}</small>
            <b>
              <TokenIcon size={16} />
              {n(c.value)}
            </b>
            <span>{c.note}</span>
          </li>
        ))}
      </ul>

      <div className="tkeco-chart" role="img" aria-label={`Paid out and returned to the treasury, over the last ${eco.days.length} days`}>
        <div className="tkeco-bars">
          {eco.days.map((d) => (
            <div key={d.day} className="tkeco-day" title={`${dayLabel(d.day)}: ${n(d.earned)} paid out, ${n(d.spent)} back to the treasury, ${n(d.withdrawn)} withdrawn`}>
              <i className="earned" style={{ height: `${Math.round((d.earned / top) * 100)}%` }} />
              <i className="spent" style={{ height: `${Math.round((d.spent / top) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="tkeco-axis">
          <span>{dayLabel(eco.days[0].day)}</span>
          <span className="tkeco-key">
            <i className="earned" /> paid out <i className="spent" /> back to the treasury
          </span>
          <span>{dayLabel(eco.days[eco.days.length - 1].day)}</span>
        </div>
        {quiet && <p className="tkeco-quiet">Nothing has moved yet. The first rewards and purchases will show here.</p>}
      </div>

      <div className="tkeco-cols">
        <div>
          <h4>Where it came from</h4>
          <dl>
            <dt>Achievements</dt>
            <dd>{n(totals.earned.achievements)}</dd>
            <dt>Dungeon clears</dt>
            <dd>{n(totals.earned.clears)}</dd>
            <dt>Daily bounties</dt>
            <dd>{n(totals.earned.bounties)}</dd>
            <dt>Earners this week</dt>
            <dd>{n(eco.earners7d)}</dd>
          </dl>
        </div>
        <div>
          <h4>Where it went back</h4>
          <dl>
            {totals.spent.items.map((i) => (
              <div key={i.label} className="tkeco-row">
                <dt>{i.label}</dt>
                <dd>{n(i.amount)}</dd>
              </div>
            ))}
            <dt>Auction House cut</dt>
            <dd>{n(totals.spent.fees)}</dd>
            <dt>Auction sales</dt>
            <dd>
              {n(totals.sales.count)} <small>for {n(totals.sales.volume)}</small>
            </dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
