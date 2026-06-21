import { createRng } from "../rng";
import { rectsOverlap, distancePointToSegment } from "../collision";
import { ARENA, CURSOR_SIZE } from "../constants";
import type { Cursor } from "../movement";
import type { Fight, FightStatus, FightDefinition, FightParam } from "./types";
import { drawEye, drawSmallEye, drawBeamLine } from "../sprites";

export interface EyeBeamsConfig {
  seed: number;
  volleys: number;
  pairCount: number;
  orbitSpeed: number;
  orbitRadius: number;
  orbitRadiusAmp: number;
  telegraphTime: number;
  beamTime: number;
  beamWidth: number;
  eyeFireGapMin: number;
  eyeFireGapMax: number;
  smallSpawnGapMin: number;
  smallSpawnGapMax: number;
  smallSpeed: number;
  smallLifetime: number;
  smallCount: number;
}

export const DEFAULT_EYE_BEAMS: EyeBeamsConfig = {
  seed: 2024,
  volleys: 20,
  pairCount: 4,
  orbitSpeed: 0.7,
  orbitRadius: 250,
  orbitRadiusAmp: 70,
  telegraphTime: 0.7,
  beamTime: 0.35,
  beamWidth: 26,
  eyeFireGapMin: 1.6,
  eyeFireGapMax: 3.2,
  smallSpawnGapMin: 1.2,
  smallSpawnGapMax: 2.6,
  smallSpeed: 65,
  smallLifetime: 6,
  smallCount: 6,
};

const CX = ARENA.x + ARENA.w / 2;
const CY = ARENA.y + ARENA.h / 2;
const EYE_R = 22;
const BEAM_LEN = 1200;
const RADIUS_OSC_SPEED = 0.9;
const PLAYER_R = CURSOR_SIZE / 2;
const BOX_HALF_X = ARENA.w / 2 + EYE_R + 6;
const BOX_HALF_Y = ARENA.h / 2 + EYE_R + 6;

const PHASE_ORBIT = 0;
const PHASE_TELEGRAPH = 1;
const PHASE_FIRE = 2;

const MAX_PAIRS = 8;
const MAX_SMALL = 64;
const SMALL_R = 7;
const SMALL_SPAWN_RADIUS = 280;

// A rendered eye: position, pupil look, locked beam direction.
interface Eye {
  x: number;
  y: number;
  lookDx: number;
  lookDy: number;
  aimDx: number;
  aimDy: number;
}

function makeEyeState(): Eye {
  return { x: 0, y: 0, lookDx: 0, lookDy: 1, aimDx: 0, aimDy: 1 };
}

// A mirrored pair with its own orbit + volley state.
interface Pair {
  phaseAngle: number;
  radiusPhase: number;
  fireTimer: number;
  phase: number;
  stateTimer: number;
  driver: Eye;
  mirror: Eye;
}

function makePair(): Pair {
  return {
    phaseAngle: 0, radiusPhase: 0, fireTimer: 0, phase: PHASE_ORBIT, stateTimer: 0,
    driver: makeEyeState(), mirror: makeEyeState(),
  };
}

interface SmallEye {
  active: boolean;
  x: number;
  y: number;
  life: number;
}

function makeSmall(): SmallEye {
  return { active: false, x: 0, y: 0, life: 0 };
}

export function createEyeBeams(cfg: EyeBeamsConfig): Fight {
  const rng = createRng(cfg.seed);

  const pairs: Pair[] = [];
  for (let i = 0; i < MAX_PAIRS; i++) pairs.push(makePair());
  let activePairs = 0;

  const smalls: SmallEye[] = [];
  for (let i = 0; i < MAX_SMALL; i++) smalls.push(makeSmall());
  let smallSpawnTimer = 0;
  let firedVolleys = 0;

  function gap(min: number, max: number): number {
    return min + rng.next() * (max - min);
  }

  function freeSmall(): number {
    for (let i = 0; i < MAX_SMALL; i++) if (!smalls[i].active) return i;
    return -1;
  }

  function activeSmallCount(): number {
    let n = 0;
    for (let i = 0; i < MAX_SMALL; i++) if (smalls[i].active) n++;
    return n;
  }

  function resetEye(e: Eye): void {
    e.x = 0;
    e.y = 0;
    e.lookDx = 0;
    e.lookDy = 1;
    e.aimDx = 0;
    e.aimDy = 1;
  }

  function reset(): void {
    rng.reseed(cfg.seed);
    firedVolleys = 0;
    activePairs = Math.min(cfg.pairCount, MAX_PAIRS);
    for (let i = 0; i < activePairs; i++) {
      const p = pairs[i];
      p.phaseAngle = rng.next() * Math.PI * 2;
      p.radiusPhase = rng.next() * Math.PI * 2;
      p.fireTimer = gap(cfg.eyeFireGapMin, cfg.eyeFireGapMax);
      p.phase = PHASE_ORBIT;
      p.stateTimer = 0;
      resetEye(p.driver);
      resetEye(p.mirror);
    }
    for (let i = 0; i < MAX_SMALL; i++) smalls[i].active = false;
    smallSpawnTimer = gap(cfg.smallSpawnGapMin, cfg.smallSpawnGapMax);
  }

  reset();

  function beamHits(e: Eye, pcx: number, pcy: number): boolean {
    const ex = e.x + e.aimDx * BEAM_LEN;
    const ey = e.y + e.aimDy * BEAM_LEN;
    return distancePointToSegment(pcx, pcy, e.x, e.y, ex, ey) <= cfg.beamWidth / 2 + PLAYER_R;
  }

  function update(player: Cursor, dt: number): FightStatus {
    const pcx = player.pos.x + CURSOR_SIZE / 2;
    const pcy = player.pos.y + CURSOR_SIZE / 2;

    let anyBusy = false;
    for (let pi = 0; pi < activePairs; pi++) {
      const p = pairs[pi];
      const driver = p.driver;
      const mirror = p.mirror;

      // Orbit (frozen during telegraph + fire) and clamp outside the box.
      if (p.phase === PHASE_ORBIT) {
        p.phaseAngle += cfg.orbitSpeed * dt;
        p.radiusPhase += RADIUS_OSC_SPEED * dt;
      }
      const ca = Math.cos(p.phaseAngle);
      const sa = Math.sin(p.phaseAngle);
      let r = cfg.orbitRadius + cfg.orbitRadiusAmp * Math.sin(p.radiusPhase);
      const minR = 1 / Math.max(Math.abs(ca) / BOX_HALF_X, Math.abs(sa) / BOX_HALF_Y);
      if (r < minR) r = minR;
      driver.x = CX + ca * r;
      driver.y = CY + sa * r;
      mirror.x = 2 * CX - driver.x;
      mirror.y = driver.y;

      // Pupils track the player (each eye independently).
      const dlx = pcx - driver.x;
      const dly = pcy - driver.y;
      const dll = Math.hypot(dlx, dly) || 1;
      driver.lookDx = dlx / dll;
      driver.lookDy = dly / dll;
      const mlx = pcx - mirror.x;
      const mly = pcy - mirror.y;
      const mll = Math.hypot(mlx, mly) || 1;
      mirror.lookDx = mlx / mll;
      mirror.lookDy = mly / mll;

      // Volley state machine (per pair).
      if (p.phase === PHASE_ORBIT) {
        p.fireTimer -= dt;
        if (p.fireTimer <= 0 && firedVolleys < cfg.volleys) {
          const aimEye = rng.next() < 0.5 ? driver : mirror;
          const partner = aimEye === driver ? mirror : driver;
          const adx = pcx - aimEye.x;
          const ady = pcy - aimEye.y;
          const al = Math.hypot(adx, ady) || 1;
          aimEye.aimDx = adx / al;
          aimEye.aimDy = ady / al;
          partner.aimDx = -aimEye.aimDx;
          partner.aimDy = aimEye.aimDy;
          p.phase = PHASE_TELEGRAPH;
          p.stateTimer = 0;
        }
      } else if (p.phase === PHASE_TELEGRAPH) {
        anyBusy = true;
        p.stateTimer += dt;
        if (p.stateTimer >= cfg.telegraphTime) {
          p.phase = PHASE_FIRE;
          p.stateTimer = 0;
          firedVolleys++;
        }
      } else {
        anyBusy = true;
        p.stateTimer += dt;
        if (p.stateTimer >= cfg.beamTime) {
          p.phase = PHASE_ORBIT;
          p.fireTimer = gap(cfg.eyeFireGapMin, cfg.eyeFireGapMax);
        }
      }

      // Beam collision (both eyes of this pair, while firing).
      if (p.phase === PHASE_FIRE) {
        if (beamHits(driver, pcx, pcy)) return "lost";
        if (beamHits(mirror, pcx, pcy)) return "lost";
      }
    }

    // Small homing eyes, capped at cfg.smallCount alive at once.
    smallSpawnTimer -= dt;
    while (
      smallSpawnTimer <= 0 &&
      firedVolleys < cfg.volleys &&
      activeSmallCount() < cfg.smallCount
    ) {
      const slot = freeSmall();
      if (slot === -1) break;
      const a = rng.next() * Math.PI * 2;
      const s = smalls[slot];
      s.active = true;
      s.x = CX + Math.cos(a) * SMALL_SPAWN_RADIUS;
      s.y = CY + Math.sin(a) * SMALL_SPAWN_RADIUS;
      s.life = cfg.smallLifetime;
      smallSpawnTimer += gap(cfg.smallSpawnGapMin, cfg.smallSpawnGapMax);
    }
    for (let i = 0; i < MAX_SMALL; i++) {
      const s = smalls[i];
      if (!s.active) continue;
      const sdx = pcx - s.x;
      const sdy = pcy - s.y;
      const slen = Math.hypot(sdx, sdy) || 1;
      s.x += (sdx / slen) * cfg.smallSpeed * dt;
      s.y += (sdy / slen) * cfg.smallSpeed * dt;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        continue;
      }
      if (rectsOverlap(player.pos.x, player.pos.y, CURSOR_SIZE, CURSOR_SIZE,
        s.x - SMALL_R, s.y - SMALL_R, SMALL_R * 2, SMALL_R * 2)) {
        return "lost";
      }
    }

    if (firedVolleys >= cfg.volleys && !anyBusy) return "won";
    return "running";
  }

  function drawPairEye(ctx: CanvasRenderingContext2D, p: Pair, e: Eye): void {
    const ex = e.x + e.aimDx * BEAM_LEN;
    const ey = e.y + e.aimDy * BEAM_LEN;
    if (p.phase === PHASE_TELEGRAPH) {
      drawBeamLine(ctx, e.x, e.y, ex, ey, 3, "#ff5cf0", 0.5);
    } else if (p.phase === PHASE_FIRE) {
      drawBeamLine(ctx, e.x, e.y, ex, ey, cfg.beamWidth, "#ff3b6b", 0.85);
    }
    drawEye(ctx, e.x, e.y, EYE_R, e.lookDx, e.lookDy);
  }

  function draw(ctx: CanvasRenderingContext2D): void {
    for (let pi = 0; pi < activePairs; pi++) {
      const p = pairs[pi];
      drawPairEye(ctx, p, p.driver);
      drawPairEye(ctx, p, p.mirror);
    }
    for (let i = 0; i < MAX_SMALL; i++) {
      const s = smalls[i];
      if (!s.active) continue;
      drawSmallEye(ctx, s.x, s.y, SMALL_R);
    }
  }

  return { update, draw, reset };
}

const EYE_BEAMS_PARAMS: readonly FightParam[] = [
  { key: "seed", label: "Seed", kind: "seed", min: 0, max: 999999, step: 1 },
  { key: "volleys", label: "Volleys", kind: "int", min: 0, max: 200, step: 1 },
  { key: "pairCount", label: "Eye pairs", kind: "int", min: 1, max: 8, step: 1 },
  { key: "orbitSpeed", label: "Orbit speed", kind: "float", min: 0.1, max: 3, step: 0.1 },
  { key: "telegraphTime", label: "Telegraph (s)", kind: "float", min: 0.1, max: 2, step: 0.05 },
  { key: "beamTime", label: "Beam (s)", kind: "float", min: 0.1, max: 1.5, step: 0.05 },
  { key: "beamWidth", label: "Beam width", kind: "float", min: 6, max: 80, step: 2 },
  { key: "eyeFireGapMin", label: "Fire gap min (s)", kind: "float", min: 0, max: 8, step: 0.1 },
  { key: "eyeFireGapMax", label: "Fire gap max (s)", kind: "float", min: 0, max: 8, step: 0.1 },
  { key: "smallSpeed", label: "Small eye speed", kind: "float", min: 0, max: 200, step: 5 },
  { key: "smallCount", label: "Max small eyes", kind: "int", min: 0, max: 40, step: 1 },
];

export const EYE_BEAMS: FightDefinition<EyeBeamsConfig> = {
  name: "Eye Beams",
  params: EYE_BEAMS_PARAMS,
  defaults: DEFAULT_EYE_BEAMS,
  create: (config) => createEyeBeams(config),
};
