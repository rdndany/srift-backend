import type { FoodDef } from './items';

export const MAX_HEALTH = 20;
export const MAX_HUNGER = 20;
export const MAX_AIR = 15; // seconds underwater before drowning (300 ticks in the original)

/** Exhaustion costs (from the original game). */
export const EXHAUSTION = {
  jump: 0.05,
  sprintJump: 0.2,
  sprintPerBlock: 0.1,
  breakBlock: 0.005,
  attack: 0.1,
  regen: 3,
} as const;

export type DamageSource = 'fall' | 'drown' | 'starve' | 'mob' | 'explosion' | 'void' | 'lava' | 'cactus' | 'berry' | 'fire' | 'campfire' | 'anvil' | 'generic';

export interface VitalsContext {
  /** Head under water. */
  eyeInWater: boolean;
  /** Creative / spectator: no hunger, no damage. */
  invulnerable: boolean;
  /** Hard difficulty: starving does not stop at half a heart. */
  hard?: boolean;
  /** Respiration level of the helmet: air lasts that many times longer. */
  respiration?: number;
}

/**
 * Health, hunger, saturation, exhaustion, air and fall damage. Deterministic and
 * time-step based so the server can run the same rules in Phase 3.
 */
export class Vitals {
  health = MAX_HEALTH;
  /** Most health there can be: the unmodified game has 20, a class has its own (see classes.ts). */
  maxHealth = MAX_HEALTH;
  hunger = MAX_HUNGER;
  saturation = 5;
  exhaustion = 0;
  air = MAX_AIR;
  dead = false;
  lastDamage: DamageSource | null = null;
  /** Seconds since the last hit; used for the red flash. */
  sinceHit = 99;

  private regenTimer = 0;
  private starveTimer = 0;
  private drownTimer = 0;

  addExhaustion(amount: number): void {
    this.exhaustion += amount;
  }

  damage(amount: number, source: DamageSource = 'generic'): void {
    if (this.dead || amount <= 0) return;
    // Brief invulnerability after a mob hit, like the original's hurt cooldown.
    if (source === 'mob' && this.sinceHit < 0.5) return;
    this.health = Math.max(0, this.health - amount);
    this.lastDamage = source;
    this.sinceHit = 0;
    if (this.health <= 0) this.dead = true;
  }

  heal(amount: number): void {
    if (this.dead) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /** Landing after a fall of `distance` blocks. `factor` is the share that gets through (enchanted boots). Returns damage dealt. */
  land(distance: number, ctx: VitalsContext, factor = 1): number {
    if (ctx.invulnerable) return 0;
    const dmg = Math.ceil(Math.floor(distance - 3) * factor);
    if (dmg > 0) {
      this.damage(dmg, 'fall');
      return dmg;
    }
    return 0;
  }

  canEat(): boolean {
    return this.hunger < MAX_HUNGER;
  }

  eat(food: FoodDef): void {
    this.hunger = Math.min(MAX_HUNGER, this.hunger + food.hunger);
    this.saturation = Math.min(this.hunger, this.saturation + food.saturation);
  }

  tick(dt: number, ctx: VitalsContext): void {
    this.sinceHit += dt;
    if (this.dead) return;

    if (ctx.invulnerable) {
      this.air = MAX_AIR;
      this.exhaustion = 0;
      return;
    }

    // ---- exhaustion -> saturation -> hunger ----
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.hunger = Math.max(0, this.hunger - 1);
    }

    // ---- natural regeneration / starvation ----
    if (this.hunger >= MAX_HUNGER && this.saturation > 0 && this.health < this.maxHealth) {
      this.regenTimer += dt;
      if (this.regenTimer >= 0.5) {
        this.regenTimer = 0;
        this.heal(1);
        this.addExhaustion(EXHAUSTION.regen / 3);
      }
    } else if (this.hunger >= 18 && this.health < this.maxHealth) {
      this.regenTimer += dt;
      if (this.regenTimer >= 4) {
        this.regenTimer = 0;
        this.heal(1);
        this.addExhaustion(EXHAUSTION.regen);
      }
    } else if (this.hunger <= 0) {
      this.regenTimer = 0;
      this.starveTimer += dt;
      if (this.starveTimer >= 4) {
        this.starveTimer = 0;
        // Normal difficulty starves down to half a heart; Hard (hardcore) starves to death.
        if (this.health > 1 || ctx.hard) this.damage(1, 'starve');
      }
    } else {
      this.regenTimer = 0;
    }

    // ---- drowning ----
    if (ctx.eyeInWater) {
      this.air -= dt / (1 + Math.max(0, ctx.respiration ?? 0));
      if (this.air <= 0) {
        this.drownTimer += dt;
        if (this.drownTimer >= 1) {
          this.drownTimer = 0;
          this.damage(2, 'drown');
        }
      }
    } else {
      this.air = Math.min(MAX_AIR, this.air + dt * 8);
      this.drownTimer = 0;
    }
  }

  respawn(): void {
    this.health = this.maxHealth;
    this.hunger = MAX_HUNGER;
    this.saturation = 5;
    this.exhaustion = 0;
    this.air = MAX_AIR;
    this.dead = false;
    this.lastDamage = null;
    this.regenTimer = this.starveTimer = this.drownTimer = 0;
    this.sinceHit = 99;
  }

  toJSON() {
    return { h: this.health, f: this.hunger, s: this.saturation, e: this.exhaustion };
  }

  loadJSON(d: { h?: number; f?: number; s?: number; e?: number }): void {
    this.health = Math.min(this.maxHealth, Math.max(1, Number(d.h) || this.maxHealth));
    this.hunger = Math.min(MAX_HUNGER, Math.max(0, Number.isFinite(Number(d.f)) ? Number(d.f) : MAX_HUNGER));
    this.saturation = Math.max(0, Number(d.s) || 0);
    this.exhaustion = Math.max(0, Number(d.e) || 0);
  }
}
