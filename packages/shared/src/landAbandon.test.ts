import { describe, expect, it } from 'vitest';
import { HOUR_MS, LAND_DAY_MS } from './index';
import { landKit, type Kit } from './landTestKit';

const ME = 'hero-me';

function buy(k: Kit, x: number, z: number, who = ME) {
  const r = k.land.purchase({ account: who, ownerName: who, name: 'Home', vertices: k.rect(x, z, x + 19, z + 19), idem: `idem-${who}-${x}-${z}`, carries: true }, k.buyer(100_000));
  if (!r.ok) throw new Error(`${r.code} ${r.text}`);
  return k.land.index.get(r.claim!.id)!;
}
/** Let the clock run and the service do its minute-by-minute work. */
function wait(k: Kit, ms: number): void {
  k.clock.now += ms;
  k.land.tick();
}

describe('what happens to land whose owner never comes back', () => {
  it('keeps it for ever by default', () => {
    const k = landKit();
    const c = buy(k, 500, 500);
    wait(k, 5000 * LAND_DAY_MS);
    expect(c.status).toBe('active');
    expect(k.land.index.claimAt(510, 510)?.id).toBe(c.id);
  });

  it('under the inactivity policy warns first, then lets go, and the owner can come back during the warning', () => {
    const k = landKit({ abandon: 'inactivity', inactivityDays: 100, expiryWarningDays: 20 });
    const c = buy(k, 500, 500);
    wait(k, 99 * LAND_DAY_MS);
    expect(c.status).toBe('active');
    wait(k, 2 * LAND_DAY_MS);
    // Past the limit: the warning has begun, and the land is still the owner's and still protected.
    expect(c.status).toBe('releasing');
    expect(c.releaseAt! - k.clock.now).toBeLessThanOrEqual(20 * LAND_DAY_MS);
    expect(c.releaseAt! - k.clock.now).toBeGreaterThan(19 * LAND_DAY_MS);
    expect(k.land.index.claimAt(510, 510)?.id).toBe(c.id);
    // The owner shows up: it is theirs again, with no action needed.
    wait(k, 5 * LAND_DAY_MS);
    k.land.touchOwner(ME);
    expect(c.status).toBe('active');
    expect(c.releaseAt).toBeNull();
    wait(k, 60_000);
    expect(c.status).toBe('active');
  });

  it('lets the land go when the warning runs out without the owner', () => {
    const k = landKit({ abandon: 'inactivity', inactivityDays: 10, expiryWarningDays: 5, refundPercent: 50 });
    const c = buy(k, 500, 500);
    wait(k, 11 * LAND_DAY_MS);
    expect(c.status).toBe('releasing');
    wait(k, 6 * LAND_DAY_MS);
    expect(c.status).toBe('released');
    expect(k.land.index.claimAt(510, 510)).toBeNull();
  });

  it('never gives back a claim its owner chose to release, however often they log in', () => {
    const k = landKit({ abandon: 'inactivity', inactivityDays: 100, expiryWarningDays: 20, releaseGraceHours: 72 });
    const c = buy(k, 500, 500);
    expect(k.land.release(ME, c.id).ok).toBe(true);
    wait(k, 3 * HOUR_MS);
    k.land.touchOwner(ME);
    expect(c.status).toBe('releasing');
    wait(k, 80 * HOUR_MS);
    k.land.touchOwner(ME);
    expect(c.status).toBe('released');
  });

  it('keeps an expiry in progress through a restart, and taking the land back by hand does not start it over', () => {
    const k = landKit({ abandon: 'inactivity', inactivityDays: 10, expiryWarningDays: 5 });
    const c = buy(k, 500, 500);
    wait(k, 11 * LAND_DAY_MS);
    expect(c.status).toBe('releasing');
    const next = k.restart();
    const again = next.index.get(c.id)!;
    expect(again.status).toBe('releasing');
    wait(k, 1000);
    next.touchOwner(ME);
    expect(again.status).toBe('active');
  });

  it('is undone by the owner too, and the claim then stays for a whole new period', () => {
    const k = landKit({ abandon: 'inactivity', inactivityDays: 10, expiryWarningDays: 5 });
    const c = buy(k, 500, 500);
    wait(k, 11 * LAND_DAY_MS);
    expect(c.status).toBe('releasing');
    expect(k.land.cancelRelease(ME, c.id).ok).toBe(true);
    wait(k, 2 * 60_000);
    expect(c.status).toBe('active');
    wait(k, 9 * LAND_DAY_MS);
    expect(c.status).toBe('active');
  });
});
