import { createRng } from "../rng";
import { rectsOverlap, distancePointToSegment } from "../collision";
import { ARENA, CURSOR_SIZE } from "../constants";
import type { Cursor } from "../movement";
import type { Fight, FightStatus, FightDefinition, FightParam } from "./types";
import { drawUfo, drawBeamLine, drawCow } from "../sprites";
import alienSpriteUrl from "../../images/alien_sprite.jpeg";

export interface SaucerRingConfig {
  seed: number;
  volleys: number;
  alienCount: number;
  orbitSpeed: number;
  shotGapMin: number;
  shotGapMax: number;
  shotSpeed: number;
  tractorGapMin: number;
  tractorGapMax: number;
  telegraphTime: number;
  beamTime: number;
  beamWidth: number;
  cowCount: number;
}

export const DEFAULT_SAUCER_RING: SaucerRingConfig = {
  seed: 2025,
  volleys: 16,
  alienCount: 3,
  orbitSpeed: 0.5,
  shotGapMin: 0.8,
  shotGapMax: 1.8,
  shotSpeed: 150,
  tractorGapMin: 3,
  tractorGapMax: 6,
  telegraphTime: 0.6,
  beamTime: 0.4,
  beamWidth: 24,
  cowCount: 5,
};

const CX = ARENA.x + ARENA.w / 2;
const CY = ARENA.y + ARENA.h / 2;
const WORLD_R = 285;
const ALIEN_INSET = 50; // pull saucers inward from the green ring
const ALIEN_R = WORLD_R - ALIEN_INSET;
const PLAYER_R = CURSOR_SIZE / 2;
const UFO_W = 28;
const UFO_H = 11;
const SHOT_R = 5;
const MAX_ALIENS = 8;
const MAX_SHOTS = 64;

// --- Cows (decoration) ---
const COW_R = WORLD_R - 16; // body-center orbit radius; feet ride just inside the ring
const MAX_COWS = 12;
const COW_SCALE = 1.1;
const COW_SPEED = 18; // linear px/s along the ring
const COW_DECISION_GAP_MIN = 2.0;
const COW_DECISION_GAP_MAX = 5.0;
const COW_GRAZE_MIN = 1.5;
const COW_GRAZE_MAX = 4.0;
const COW_TURN_CHANCE = 0.5;
const COW_GRAZE_EASE = 6; // head ease toward target (per s)
const COW_STRIDE_RATE = 6; // stride phase units per s
const COW_STATE_WALK = 0;
const COW_STATE_GRAZE = 1;
const COW_RNG_OFFSET = 70000;

interface Cow {
  active: boolean;
  angle: number;
  dir: number;
  speed: number;
  state: number;
  stateTimer: number;
  graze: number;
  stridePhase: number;
}

function makeCow(): Cow {
  return { active: false, angle: 0, dir: 1, speed: 0, state: COW_STATE_WALK, stateTimer: 0, graze: 0, stridePhase: 0 };
}

// Blue/orange saucer (top sprite row, third group of three frames) on the
// 1024x559 sheet. Starting cell coordinates from the grid (cols ~83px, rows
// ~94px under an ~84px title/header band); fine-tune live so each cell centers.
const SAUCER_FRAMES: readonly { sx: number; sy: number; sw: number; sh: number }[] = [
  { sx: 518, sy: 84, sw: 84, sh: 94 },
  { sx: 601, sy: 84, sw: 84, sh: 94 },
  { sx: 685, sy: 84, sw: 84, sh: 94 },
];
const FRAME_DUR = 0.18;
const SAUCER_DRAW_W = 32;
const SAUCER_DRAW_H = 24;

// One shared sheet image for all instances. Guarded so node/test envs (no DOM)
// fall back to the procedural saucer.
let sheet: HTMLImageElement | null = null;
let sheetReady = false;
if (typeof Image !== "undefined") {
  sheet = new Image();
  sheet.onload = () => {
    sheetReady = true;
  };
  sheet.src = alienSpriteUrl;
}

const PHASE_ORBIT = 0;
const PHASE_TELEGRAPH = 1;
const PHASE_FIRE = 2;

interface Alien {
  angle: number;
  x: number;
  y: number;
  idx: number; // inward unit normal x
  idy: number; // inward unit normal y
  shotTimer: number;
  tractorTimer: number;
  phase: number;
  stateTimer: number;
}

function makeAlien(): Alien {
  return { angle: 0, x: 0, y: 0, idx: 0, idy: 0, shotTimer: 0, tractorTimer: 0, phase: PHASE_ORBIT, stateTimer: 0 };
}

interface Shot {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function makeShot(): Shot {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0 };
}

export function createSaucerRing(cfg: SaucerRingConfig): Fight {
  const rng = createRng(cfg.seed);

  const aliens: Alien[] = [];
  for (let i = 0; i < MAX_ALIENS; i++) aliens.push(makeAlien());
  let activeAliens = 0;

  const shots: Shot[] = [];
  for (let i = 0; i < MAX_SHOTS; i++) shots.push(makeShot());

  const cowRng = createRng(cfg.seed + COW_RNG_OFFSET);
  const cows: Cow[] = [];
  for (let i = 0; i < MAX_COWS; i++) cows.push(makeCow());
  let activeCows = 0;

  let firedVolleys = 0;
  let animClock = 0;

  function gap(min: number, max: number): number {
    return min + rng.next() * (max - min);
  }

  function cowGap(min: number, max: number): number {
    return min + cowRng.next() * (max - min);
  }

  function freeShot(): number {
    for (let i = 0; i < MAX_SHOTS; i++) if (!shots[i].active) return i;
    return -1;
  }

  function reset(): void {
    rng.reseed(cfg.seed);
    firedVolleys = 0;
    activeAliens = Math.min(cfg.alienCount, MAX_ALIENS);
    for (let i = 0; i < activeAliens; i++) {
      const a = aliens[i];
      a.angle = rng.next() * Math.PI * 2;
      a.shotTimer = gap(cfg.shotGapMin, cfg.shotGapMax);
      a.tractorTimer = gap(cfg.tractorGapMin, cfg.tractorGapMax);
      a.phase = PHASE_ORBIT;
      a.stateTimer = 0;
    }
    for (let i = 0; i < MAX_SHOTS; i++) shots[i].active = false;
    cowRng.reseed(cfg.seed + COW_RNG_OFFSET);
    activeCows = Math.min(cfg.cowCount, MAX_COWS);
    for (let i = 0; i < activeCows; i++) {
      const c = cows[i];
      c.active = true;
      c.angle = cowRng.next() * Math.PI * 2;
      c.dir = cowRng.next() < 0.5 ? -1 : 1;
      c.speed = COW_SPEED;
      c.state = COW_STATE_WALK;
      c.stateTimer = cowGap(COW_DECISION_GAP_MIN, COW_DECISION_GAP_MAX);
      c.graze = 0;
      c.stridePhase = cowRng.next() * 1000;
    }
    for (let i = activeCows; i < MAX_COWS; i++) cows[i].active = false;
  }

  reset();

  function update(player: Cursor, dt: number): FightStatus {
    const pcx = player.pos.x + CURSOR_SIZE / 2;
    const pcy = player.pos.y + CURSOR_SIZE / 2;
    animClock += dt;

    for (let i = 0; i < activeCows; i++) {
      const c = cows[i];
      if (c.state === COW_STATE_WALK) {
        c.angle += c.dir * (c.speed / COW_R) * dt;
        c.stridePhase += COW_STRIDE_RATE * dt;
        if (c.graze > 0) c.graze = Math.max(0, c.graze - COW_GRAZE_EASE * dt);
        c.stateTimer -= dt;
        if (c.stateTimer <= 0) {
          if (cowRng.next() < COW_TURN_CHANCE) {
            c.dir = -c.dir;
            c.stateTimer = cowGap(COW_DECISION_GAP_MIN, COW_DECISION_GAP_MAX);
          } else {
            c.state = COW_STATE_GRAZE;
            c.stateTimer = cowGap(COW_GRAZE_MIN, COW_GRAZE_MAX);
          }
        }
      } else {
        if (c.graze < 1) c.graze = Math.min(1, c.graze + COW_GRAZE_EASE * dt);
        c.stateTimer -= dt;
        if (c.stateTimer <= 0) {
          c.state = COW_STATE_WALK;
          c.stateTimer = cowGap(COW_DECISION_GAP_MIN, COW_DECISION_GAP_MAX);
        }
      }
    }

    let anyBusy = false;
    for (let i = 0; i < activeAliens; i++) {
      const a = aliens[i];

      if (a.phase === PHASE_ORBIT) a.angle += cfg.orbitSpeed * dt;
      const ca = Math.cos(a.angle);
      const sa = Math.sin(a.angle);
      a.x = CX + ca * ALIEN_R;
      a.y = CY + sa * ALIEN_R;
      a.idx = -ca;
      a.idy = -sa;

      if (a.phase === PHASE_ORBIT) {
        a.shotTimer -= dt;
        if (a.shotTimer <= 0) {
          const j = freeShot();
          if (j >= 0) {
            const s = shots[j];
            s.active = true;
            s.x = a.x;
            s.y = a.y;
            s.vx = a.idx * cfg.shotSpeed;
            s.vy = a.idy * cfg.shotSpeed;
          }
          a.shotTimer += gap(cfg.shotGapMin, cfg.shotGapMax);
        }
        a.tractorTimer -= dt;
        if (a.tractorTimer <= 0 && firedVolleys < cfg.volleys) {
          a.phase = PHASE_TELEGRAPH;
          a.stateTimer = 0;
        }
      } else if (a.phase === PHASE_TELEGRAPH) {
        anyBusy = true;
        a.stateTimer += dt;
        if (a.stateTimer >= cfg.telegraphTime) {
          a.phase = PHASE_FIRE;
          a.stateTimer = 0;
          firedVolleys++;
        }
      } else {
        anyBusy = true;
        a.stateTimer += dt;
        if (a.stateTimer >= cfg.beamTime) {
          a.phase = PHASE_ORBIT;
          a.tractorTimer = gap(cfg.tractorGapMin, cfg.tractorGapMax);
        }
      }

      if (a.phase === PHASE_FIRE) {
        const ex = a.x + a.idx * 2 * ALIEN_R;
        const ey = a.y + a.idy * 2 * ALIEN_R;
        if (distancePointToSegment(pcx, pcy, a.x, a.y, ex, ey) <= cfg.beamWidth / 2 + PLAYER_R) {
          return "lost";
        }
      }
    }

    for (let i = 0; i < MAX_SHOTS; i++) {
      const s = shots[i];
      if (!s.active) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const ddx = s.x - CX;
      const ddy = s.y - CY;
      if (ddx * ddx + ddy * ddy > WORLD_R * WORLD_R) {
        s.active = false;
        continue;
      }
      if (rectsOverlap(player.pos.x, player.pos.y, CURSOR_SIZE, CURSOR_SIZE,
        s.x - SHOT_R, s.y - SHOT_R, SHOT_R * 2, SHOT_R * 2)) {
        return "lost";
      }
    }

    if (firedVolleys >= cfg.volleys && !anyBusy) return "won";
    return "running";
  }

  function draw(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = "#3ddc52";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(CX, CY, WORLD_R, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < activeCows; i++) {
      const c = cows[i];
      const ca = Math.cos(c.angle);
      const sa = Math.sin(c.angle);
      const cowX = CX + ca * COW_R;
      const cowY = CY + sa * COW_R;
      const stride = c.state === COW_STATE_WALK ? (Math.floor(c.stridePhase) & 1) : 0;
      ctx.save();
      ctx.translate(cowX, cowY);
      ctx.rotate(c.angle - Math.PI / 2);
      // facing = -dir so the head leads the direction of travel (the local +x
      // head maps to the trailing side under rotate(angle - PI/2)).
      drawCow(ctx, 0, 0, COW_SCALE, -c.dir, c.graze, stride);
      ctx.restore();
    }

    for (let i = 0; i < activeAliens; i++) {
      const a = aliens[i];
      const ex = a.x + a.idx * 2 * ALIEN_R;
      const ey = a.y + a.idy * 2 * ALIEN_R;
      if (a.phase === PHASE_TELEGRAPH) {
        drawBeamLine(ctx, a.x, a.y, ex, ey, 3, "#ff5cf0", 0.5);
      } else if (a.phase === PHASE_FIRE) {
        drawBeamLine(ctx, a.x, a.y, ex, ey, cfg.beamWidth, "#ff3b6b", 0.85);
      }
      if (sheetReady && sheet !== null) {
        const f = SAUCER_FRAMES[Math.floor(animClock / FRAME_DUR) % SAUCER_FRAMES.length];
        // Rotate so the sprite's bottom points inward, toward the ring center.
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.angle + Math.PI / 2);
        ctx.drawImage(sheet, f.sx, f.sy, f.sw, f.sh,
          -SAUCER_DRAW_W / 2, -SAUCER_DRAW_H / 2, SAUCER_DRAW_W, SAUCER_DRAW_H);
        ctx.restore();
      } else {
        drawUfo(ctx, a.x - UFO_W / 2, a.y - UFO_H / 2, UFO_W, UFO_H, "#40c4ff");
      }
    }

    for (let i = 0; i < MAX_SHOTS; i++) {
      const s = shots[i];
      if (!s.active) continue;
      ctx.fillStyle = "#ffe14d";
      ctx.beginPath();
      ctx.arc(s.x, s.y, SHOT_R, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return { update, draw, reset };
}

const SAUCER_RING_PARAMS: readonly FightParam[] = [
  { key: "seed", label: "Seed", kind: "seed", min: 0, max: 999999, step: 1 },
  { key: "volleys", label: "Volleys", kind: "int", min: 0, max: 200, step: 1 },
  { key: "alienCount", label: "Saucers", kind: "int", min: 1, max: 8, step: 1 },
  { key: "orbitSpeed", label: "Orbit speed", kind: "float", min: 0.1, max: 3, step: 0.1 },
  { key: "shotGapMin", label: "Shot gap min (s)", kind: "float", min: 0, max: 5, step: 0.1 },
  { key: "shotGapMax", label: "Shot gap max (s)", kind: "float", min: 0, max: 5, step: 0.1 },
  { key: "shotSpeed", label: "Shot speed", kind: "float", min: 20, max: 500, step: 10 },
  { key: "tractorGapMin", label: "Tractor gap min (s)", kind: "float", min: 0, max: 12, step: 0.5 },
  { key: "tractorGapMax", label: "Tractor gap max (s)", kind: "float", min: 0, max: 12, step: 0.5 },
  { key: "telegraphTime", label: "Telegraph (s)", kind: "float", min: 0.1, max: 2, step: 0.05 },
  { key: "beamTime", label: "Beam (s)", kind: "float", min: 0.1, max: 1.5, step: 0.05 },
  { key: "beamWidth", label: "Beam width", kind: "float", min: 6, max: 80, step: 2 },
  { key: "cowCount", label: "Cows", kind: "int", min: 0, max: 12, step: 1 },
];

export const SAUCER_RING: FightDefinition<SaucerRingConfig> = {
  name: "Saucer Ring",
  params: SAUCER_RING_PARAMS,
  defaults: DEFAULT_SAUCER_RING,
  create: (config) => createSaucerRing(config),
};
