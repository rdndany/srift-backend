import { COMPASS_FRAMES, I, type WorldKind } from '@solrift/shared';
import { useUi } from '../ui/store';
import type { ClientSession } from './clientSession';
import type { HeldItem } from './heldItem';
import type { Input } from './input';

/**
 * The compass shows north (-z, as on the F3 screen). Its needle is part of the item's own picture (in the hand, on the bar,
 * in the bags): there is no readout. It swings like a real needle, with a little give, so turning on the spot shows it
 * moving. The Adventure minimap needs the map item, so it follows what is carried.
 */
export class CompassNeedle {
  private needle = 0;
  private speed = 0;

  constructor(
    private readonly session: ClientSession,
    private readonly input: Input,
    private readonly hand: HeldItem,
    private readonly kind: WorldKind,
  ) {}

  sync(dt: number): void {
    const ui = useUi.getState();
    const hasMap = this.kind !== 'adventure' || this.session.inventory.countOf(I.MAP) > 0;
    if (hasMap !== ui.hasMap) useUi.setState({ hasMap });
    if (!this.session.ready || this.session.inventory.countOf(I.COMPASS) === 0) return;
    // Yaw 0 looks toward -z (north) and grows to the left; on the picture the needle turns clockwise, so facing north it
    // points straight up and turning left (west) swings it to the right.
    const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
    const target = wrap(this.input.yaw);
    this.speed += wrap(target - this.needle) * 110 * Math.min(dt, 0.05);
    this.speed *= Math.exp(-9 * Math.min(dt, 0.05));
    this.needle = wrap(this.needle + this.speed * Math.min(dt, 0.05));
    const frame = (((Math.round((this.needle / (Math.PI * 2)) * COMPASS_FRAMES) % COMPASS_FRAMES) + COMPASS_FRAMES) % COMPASS_FRAMES);
    this.hand.setCompass(frame);
    if (frame !== ui.compassFrame) useUi.setState({ compassFrame: frame });
  }
}
