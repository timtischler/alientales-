import type { Rng } from "../rng";
import { createRng } from "../rng";
import { UFO_COLORS, ALIEN, drawSprite, drawUfo, drawBeam } from "../sprites";
import { rectsOverlap } from "../collision";
import { ARENA, CURSOR_SIZE, LOGICAL_WIDTH } from "../constants";
import type { Cursor } from "../movement";
import type { Fight, FightStatus } from "./types";

export interface UfoFightConfig {
  seed: number;
  count: number;
  speedMin: number;
  speedMax: number;
  ufoYMin: number;
  ufoYMax: number;
  beamerChance: number;
  spawnGapMin: number;
  spawnGapMax: number;
}

export const DEFAULT_UFO_FIGHT: UfoFightConfig = {
  seed: 1337,
  count: 30,
  speedMin: 90,
  speedMax: 200,
  ufoYMin: 90,
  ufoYMax: 410,
  beamerChance: 0.5,
  spawnGapMin: 0.6,
  spawnGapMax: 1.6,
};

export interface UfoParams {
  fromLeft: boolean;
  speed: number;
  y: number;
  color: string;
  beamer: boolean;
  stopCenterX: number;
}

const STOP_MIN_X = ARENA.x + 20;
const STOP_MAX_X = ARENA.x + ARENA.w - 20;

// Draws exactly 6 rng values in a fixed order so the draw count is constant
// regardless of the rolled values — this keeps the spawn stream deterministic.
export function rollUfo(rng: Rng, cfg: UfoFightConfig): UfoParams {
  const fromLeft = rng.next() < 0.5;
  const speed = cfg.speedMin + rng.next() * (cfg.speedMax - cfg.speedMin);
  const y = cfg.ufoYMin + rng.next() * (cfg.ufoYMax - cfg.ufoYMin);
  const color = UFO_COLORS[Math.floor(rng.next() * UFO_COLORS.length)];
  const beamer = rng.next() < cfg.beamerChance;
  const stopCenterX = STOP_MIN_X + rng.next() * (STOP_MAX_X - STOP_MIN_X);
  return { fromLeft, speed, y, color, beamer, stopCenterX };
}

export const UFO_W = 40;
export const UFO_H = 16;
export const BEAM_W = 28;
const BEAM_STEP_PX = 14;
const BEAM_STEP_INTERVAL = 0.05;
const BEAM_HOLD = 0.5;
const POOL = 12;

const PHASE_FLY = 0;
const PHASE_BEAM = 1;
const PHASE_RESUME = 2;

interface Ufo {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  color: string;
  beamer: boolean;
  beamed: boolean;
  stopX: number;
  phase: number;
  beamLen: number;
  beamStepTimer: number;
  beamHoldTimer: number;
}

function makeUfo(): Ufo {
  return {
    active: false, x: 0, y: 0, vx: 0, color: "#fff",
    beamer: false, beamed: false, stopX: 0, phase: PHASE_FLY,
    beamLen: 0, beamStepTimer: 0, beamHoldTimer: 0,
  };
}

export function createUfoFight(cfg: UfoFightConfig): Fight {
  const rng = createRng(cfg.seed);
  const ufos: Ufo[] = [];
  for (let i = 0; i < POOL; i++) ufos.push(makeUfo());

  let spawnTimer = 0;
  let spawnedCount = 0;
  // Alien bob phase, advanced each step and read by draw (Task 6).
  let alienBob = 0;

  function reset(): void {
    rng.reseed(cfg.seed);
    for (let i = 0; i < POOL; i++) ufos[i].active = false;
    spawnTimer = 0;
    spawnedCount = 0;
    alienBob = 0;
  }

  function freeSlot(): number {
    for (let i = 0; i < POOL; i++) if (!ufos[i].active) return i;
    return -1;
  }

  function spawnInto(u: Ufo): void {
    const p = rollUfo(rng, cfg);
    u.active = true;
    u.color = p.color;
    u.y = p.y;
    u.beamer = p.beamer;
    u.beamed = false;
    u.phase = PHASE_FLY;
    u.beamLen = 0;
    u.beamStepTimer = 0;
    u.beamHoldTimer = 0;
    u.stopX = p.stopCenterX - UFO_W / 2;
    if (p.fromLeft) {
      u.x = -UFO_W;
      u.vx = p.speed;
    } else {
      u.x = LOGICAL_WIDTH;
      u.vx = -p.speed;
    }
  }

  function stepUfo(u: Ufo, dt: number): void {
    if (u.phase === PHASE_FLY) {
      if (u.beamer && !u.beamed) {
        const nextX = u.x + u.vx * dt;
        const reached = u.vx > 0 ? nextX >= u.stopX : nextX <= u.stopX;
        if (reached) {
          u.x = u.stopX;
          u.phase = PHASE_BEAM;
          u.beamed = true;
          u.beamLen = 0;
          u.beamStepTimer = 0;
          u.beamHoldTimer = 0;
          return;
        }
      }
      u.x += u.vx * dt;
    } else if (u.phase === PHASE_BEAM) {
      const maxLen = ARENA.y + ARENA.h - (u.y + UFO_H);
      if (u.beamLen < maxLen) {
        u.beamStepTimer += dt;
        while (u.beamStepTimer >= BEAM_STEP_INTERVAL && u.beamLen < maxLen) {
          u.beamLen = Math.min(u.beamLen + BEAM_STEP_PX, maxLen);
          u.beamStepTimer -= BEAM_STEP_INTERVAL;
        }
      } else {
        u.beamHoldTimer += dt;
        if (u.beamHoldTimer >= BEAM_HOLD) {
          u.beamLen = 0;
          u.phase = PHASE_RESUME;
        }
      }
    } else {
      u.x += u.vx * dt;
    }
    if (u.x + UFO_W < 0 || u.x > LOGICAL_WIDTH) u.active = false;
  }

  function hitsPlayer(u: Ufo, px: number, py: number): boolean {
    if (rectsOverlap(px, py, CURSOR_SIZE, CURSOR_SIZE, u.x, u.y, UFO_W, UFO_H)) {
      return true;
    }
    if (u.phase === PHASE_BEAM && u.beamLen > 0) {
      const bx = u.x + UFO_W / 2 - BEAM_W / 2;
      const by = u.y + UFO_H;
      if (rectsOverlap(px, py, CURSOR_SIZE, CURSOR_SIZE, bx, by, BEAM_W, u.beamLen)) {
        return true;
      }
    }
    return false;
  }

  function update(player: Cursor, dt: number): FightStatus {
    alienBob += dt;

    spawnTimer -= dt;
    while (spawnTimer <= 0 && spawnedCount < cfg.count) {
      const slot = freeSlot();
      if (slot === -1) break;
      spawnInto(ufos[slot]);
      spawnedCount++;
      if (spawnedCount < cfg.count) {
        spawnTimer += cfg.spawnGapMin + rng.next() * (cfg.spawnGapMax - cfg.spawnGapMin);
      }
    }

    const px = player.pos.x;
    const py = player.pos.y;
    let anyActive = false;
    for (let i = 0; i < POOL; i++) {
      const u = ufos[i];
      if (!u.active) continue;
      stepUfo(u, dt);
      if (u.active) {
        anyActive = true;
        if (hitsPlayer(u, px, py)) return "lost";
      }
    }

    if (spawnedCount >= cfg.count && !anyActive) return "won";
    return "running";
  }

  const ALIEN_PIXEL = 4;
  const ALIEN_X = Math.round((LOGICAL_WIDTH - ALIEN.w * ALIEN_PIXEL) / 2);
  const ALIEN_Y = 14;

  function draw(ctx: CanvasRenderingContext2D): void {
    const bob = Math.sin(alienBob * 3) * 3;
    drawSprite(ctx, ALIEN, ALIEN_X, ALIEN_Y + bob, ALIEN_PIXEL);
    for (let i = 0; i < POOL; i++) {
      const u = ufos[i];
      if (!u.active) continue;
      if (u.phase === PHASE_BEAM && u.beamLen > 0) {
        drawBeam(ctx, u.x + UFO_W / 2, u.y + UFO_H, BEAM_W, u.beamLen, u.color);
      }
      drawUfo(ctx, u.x, u.y, UFO_W, UFO_H, u.color);
    }
  }

  return { update, draw, reset };
}
