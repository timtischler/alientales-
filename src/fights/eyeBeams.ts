import { createRng } from "../rng";
import { rectsOverlap, distancePointToSegment } from "../collision";
import { ARENA, CURSOR_SIZE } from "../constants";
import type { Cursor } from "../movement";
import type { Fight, FightStatus, FightDefinition, FightParam } from "./types";

export interface EyeBeamsConfig {
  seed: number;
  volleys: number;
  eyeCount: number;
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
}

export const DEFAULT_EYE_BEAMS: EyeBeamsConfig = {
  seed: 2024,
  volleys: 20,
  eyeCount: 2,
  orbitSpeed: 0.7,
  orbitRadius: 200,
  orbitRadiusAmp: 110,
  telegraphTime: 0.7,
  beamTime: 0.35,
  beamWidth: 26,
  eyeFireGapMin: 1.6,
  eyeFireGapMax: 3.2,
  smallSpawnGapMin: 1.2,
  smallSpawnGapMax: 2.6,
  smallSpeed: 65,
  smallLifetime: 6,
};

const CX = ARENA.x + ARENA.w / 2;
const CY = ARENA.y + ARENA.h / 2;
const EYE_R = 22;
const BEAM_LEN = 1200;
const RADIUS_OSC_SPEED = 0.9;
const PLAYER_R = CURSOR_SIZE / 2;
const MAX_EYES = 6;

const PHASE_ORBIT = 0;
const PHASE_TELEGRAPH = 1;
const PHASE_FIRE = 2;

interface Eye {
  active: boolean;
  phaseAngle: number;
  radiusPhase: number;
  x: number;
  y: number;
  lookDx: number;
  lookDy: number;
  fireTimer: number;
  phase: number;
  stateTimer: number;
  aimDx: number;
  aimDy: number;
}

function makeEye(): Eye {
  return {
    active: false, phaseAngle: 0, radiusPhase: 0, x: 0, y: 0,
    lookDx: 0, lookDy: 1, fireTimer: 0, phase: PHASE_ORBIT,
    stateTimer: 0, aimDx: 0, aimDy: 1,
  };
}

export function createEyeBeams(cfg: EyeBeamsConfig): Fight {
  const rng = createRng(cfg.seed);
  const eyes: Eye[] = [];
  for (let i = 0; i < MAX_EYES; i++) eyes.push(makeEye());

  let firedVolleys = 0;

  function gap(min: number, max: number): number {
    return min + rng.next() * (max - min);
  }

  function reset(): void {
    rng.reseed(cfg.seed);
    firedVolleys = 0;
    const n = Math.min(cfg.eyeCount, MAX_EYES);
    for (let i = 0; i < MAX_EYES; i++) {
      const e = eyes[i];
      if (i < n) {
        e.active = true;
        e.phaseAngle = rng.next() * Math.PI * 2;
        e.radiusPhase = rng.next() * Math.PI * 2;
        e.fireTimer = gap(cfg.eyeFireGapMin, cfg.eyeFireGapMax);
        e.phase = PHASE_ORBIT;
        e.stateTimer = 0;
        e.lookDx = 0;
        e.lookDy = 1;
        e.aimDx = 0;
        e.aimDy = 1;
      } else {
        e.active = false;
      }
    }
  }

  reset();

  function update(player: Cursor, dt: number): FightStatus {
    const pcx = player.pos.x + CURSOR_SIZE / 2;
    const pcy = player.pos.y + CURSOR_SIZE / 2;

    let anyBusy = false;
    for (let i = 0; i < MAX_EYES; i++) {
      const e = eyes[i];
      if (!e.active) continue;

      if (e.phase === PHASE_ORBIT) {
        e.phaseAngle += cfg.orbitSpeed * dt;
        e.radiusPhase += RADIUS_OSC_SPEED * dt;
      }
      const r = cfg.orbitRadius + cfg.orbitRadiusAmp * Math.sin(e.radiusPhase);
      e.x = CX + Math.cos(e.phaseAngle) * r;
      e.y = CY + Math.sin(e.phaseAngle) * r;

      const ldx = pcx - e.x;
      const ldy = pcy - e.y;
      const llen = Math.hypot(ldx, ldy) || 1;
      e.lookDx = ldx / llen;
      e.lookDy = ldy / llen;

      if (e.phase === PHASE_ORBIT) {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && firedVolleys < cfg.volleys) {
          e.aimDx = e.lookDx;
          e.aimDy = e.lookDy;
          e.phase = PHASE_TELEGRAPH;
          e.stateTimer = 0;
        }
      } else if (e.phase === PHASE_TELEGRAPH) {
        anyBusy = true;
        e.stateTimer += dt;
        if (e.stateTimer >= cfg.telegraphTime) {
          e.phase = PHASE_FIRE;
          e.stateTimer = 0;
          firedVolleys++;
        }
      } else {
        anyBusy = true;
        e.stateTimer += dt;
        if (e.stateTimer >= cfg.beamTime) {
          e.phase = PHASE_ORBIT;
          e.fireTimer = gap(cfg.eyeFireGapMin, cfg.eyeFireGapMax);
        }
      }

      if (rectsOverlap(player.pos.x, player.pos.y, CURSOR_SIZE, CURSOR_SIZE,
        e.x - EYE_R, e.y - EYE_R, EYE_R * 2, EYE_R * 2)) {
        return "lost";
      }
      if (e.phase === PHASE_FIRE) {
        const ex = e.x + e.aimDx * BEAM_LEN;
        const ey = e.y + e.aimDy * BEAM_LEN;
        if (distancePointToSegment(pcx, pcy, e.x, e.y, ex, ey) <= cfg.beamWidth / 2 + PLAYER_R) {
          return "lost";
        }
      }
    }

    if (firedVolleys >= cfg.volleys && !anyBusy) return "won";
    return "running";
  }

  function draw(_ctx: CanvasRenderingContext2D): void {
    // Implemented in Task 5.
  }

  return { update, draw, reset };
}

const EYE_BEAMS_PARAMS: readonly FightParam[] = [
  { key: "seed", label: "Seed", kind: "seed", min: 0, max: 999999, step: 1 },
  { key: "volleys", label: "Volleys", kind: "int", min: 0, max: 200, step: 1 },
  { key: "eyeCount", label: "Eyes", kind: "int", min: 1, max: 6, step: 1 },
  { key: "orbitSpeed", label: "Orbit speed", kind: "float", min: 0.1, max: 3, step: 0.1 },
  { key: "telegraphTime", label: "Telegraph (s)", kind: "float", min: 0.1, max: 2, step: 0.05 },
  { key: "beamTime", label: "Beam (s)", kind: "float", min: 0.1, max: 1.5, step: 0.05 },
  { key: "beamWidth", label: "Beam width", kind: "float", min: 6, max: 80, step: 2 },
  { key: "eyeFireGapMin", label: "Fire gap min (s)", kind: "float", min: 0, max: 8, step: 0.1 },
  { key: "eyeFireGapMax", label: "Fire gap max (s)", kind: "float", min: 0, max: 8, step: 0.1 },
  { key: "smallSpeed", label: "Small eye speed", kind: "float", min: 0, max: 200, step: 5 },
];

export const EYE_BEAMS: FightDefinition<EyeBeamsConfig> = {
  name: "Eye Beams",
  params: EYE_BEAMS_PARAMS,
  defaults: DEFAULT_EYE_BEAMS,
  create: (config) => createEyeBeams(config),
};
