import { createRng } from "../rng";
import { rectsOverlap, distancePointToSegment } from "../collision";
import { ARENA, CURSOR_SIZE } from "../constants";
import type { Cursor } from "../movement";
import type { Fight, FightStatus, FightDefinition, FightParam } from "./types";
import { drawEye, drawSmallEye, drawBeamLine } from "../sprites";

export interface EyeBeamsConfig {
  seed: number;
  volleys: number;
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

const MAX_SMALL = 64;
const SMALL_R = 7;
const SMALL_SPAWN_RADIUS = 280;

// A rendered eye: position, pupil look direction, and locked beam direction.
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

  // eyes[0] is the orbiter (drives position + the shared phase); eyes[1] mirrors it.
  const eyes: Eye[] = [makeEyeState(), makeEyeState()];

  // Orbit/volley state for the orbiter (shared by the pair).
  let phaseAngle = 0;
  let radiusPhase = 0;
  let fireTimer = 0;
  let phase = PHASE_ORBIT;
  let stateTimer = 0;

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

  function reset(): void {
    rng.reseed(cfg.seed);
    firedVolleys = 0;
    phase = PHASE_ORBIT;
    stateTimer = 0;
    phaseAngle = rng.next() * Math.PI * 2;
    radiusPhase = rng.next() * Math.PI * 2;
    fireTimer = gap(cfg.eyeFireGapMin, cfg.eyeFireGapMax);
    for (let i = 0; i < 2; i++) {
      const e = eyes[i];
      e.x = 0;
      e.y = 0;
      e.lookDx = 0;
      e.lookDy = 1;
      e.aimDx = 0;
      e.aimDy = 1;
    }
    for (let i = 0; i < MAX_SMALL; i++) smalls[i].active = false;
    smallSpawnTimer = gap(cfg.smallSpawnGapMin, cfg.smallSpawnGapMax);
  }

  reset();

  function update(player: Cursor, dt: number): FightStatus {
    const pcx = player.pos.x + CURSOR_SIZE / 2;
    const pcy = player.pos.y + CURSOR_SIZE / 2;

    const driver = eyes[0];
    const mirror = eyes[1];

    // 1. Advance orbit (frozen during telegraph + fire) and clamp outside the box.
    if (phase === PHASE_ORBIT) {
      phaseAngle += cfg.orbitSpeed * dt;
      radiusPhase += RADIUS_OSC_SPEED * dt;
    }
    const ca = Math.cos(phaseAngle);
    const sa = Math.sin(phaseAngle);
    let r = cfg.orbitRadius + cfg.orbitRadiusAmp * Math.sin(radiusPhase);
    const minR = 1 / Math.max(Math.abs(ca) / BOX_HALF_X, Math.abs(sa) / BOX_HALF_Y);
    if (r < minR) r = minR;
    driver.x = CX + ca * r;
    driver.y = CY + sa * r;

    // 2. Mirror across the vertical center line.
    mirror.x = 2 * CX - driver.x;
    mirror.y = driver.y;

    // 3. Pupils track the player (each eye independently).
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

    // 4. Volley state machine. The pair shares one phase, driven by the orbiter.
    let anyBusy = false;
    if (phase === PHASE_ORBIT) {
      fireTimer -= dt;
      if (fireTimer <= 0 && firedVolleys < cfg.volleys) {
        // Random aim-driver: which eye targets the player flips each volley.
        const aimEye = rng.next() < 0.5 ? driver : mirror;
        const partner = aimEye === driver ? mirror : driver;
        const adx = pcx - aimEye.x;
        const ady = pcy - aimEye.y;
        const al = Math.hypot(adx, ady) || 1;
        aimEye.aimDx = adx / al;
        aimEye.aimDy = ady / al;
        partner.aimDx = -aimEye.aimDx; // reflection across the vertical axis
        partner.aimDy = aimEye.aimDy;
        phase = PHASE_TELEGRAPH;
        stateTimer = 0;
      }
    } else if (phase === PHASE_TELEGRAPH) {
      anyBusy = true;
      stateTimer += dt;
      if (stateTimer >= cfg.telegraphTime) {
        phase = PHASE_FIRE;
        stateTimer = 0;
        firedVolleys++;
      }
    } else {
      anyBusy = true;
      stateTimer += dt;
      if (stateTimer >= cfg.beamTime) {
        phase = PHASE_ORBIT;
        fireTimer = gap(cfg.eyeFireGapMin, cfg.eyeFireGapMax);
      }
    }

    // 5. Beam collision (both eyes, while firing). No eye-body collision: the
    //    radius clamp keeps the eyes outside the box, so they cannot reach the player.
    if (phase === PHASE_FIRE) {
      for (let i = 0; i < 2; i++) {
        const e = eyes[i];
        const ex = e.x + e.aimDx * BEAM_LEN;
        const ey = e.y + e.aimDy * BEAM_LEN;
        if (distancePointToSegment(pcx, pcy, e.x, e.y, ex, ey) <= cfg.beamWidth / 2 + PLAYER_R) {
          return "lost";
        }
      }
    }

    // 6. Small homing eyes, capped at cfg.smallCount alive at once.
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

  function draw(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < 2; i++) {
      const e = eyes[i];
      const ex = e.x + e.aimDx * BEAM_LEN;
      const ey = e.y + e.aimDy * BEAM_LEN;
      if (phase === PHASE_TELEGRAPH) {
        drawBeamLine(ctx, e.x, e.y, ex, ey, 3, "#ff5cf0", 0.5);
      } else if (phase === PHASE_FIRE) {
        drawBeamLine(ctx, e.x, e.y, ex, ey, cfg.beamWidth, "#ff3b6b", 0.85);
      }
      drawEye(ctx, e.x, e.y, EYE_R, e.lookDx, e.lookDy);
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
