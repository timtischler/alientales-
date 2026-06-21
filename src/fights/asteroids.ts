import { createRng } from "../rng";
import { circleRectOverlap } from "../collision";
import { ARENA, CURSOR_SIZE } from "../constants";
import type { Cursor } from "../movement";
import type { Fight, FightStatus, FightDefinition, FightParam } from "./types";
import { drawAsteroid } from "../sprites";

export interface AsteroidsConfig {
  seed: number;
  count: number;
  minSize: number;
  maxSize: number;
  avgSize: number;
  speed: number;
  spawnInterval: number;
}

export const DEFAULT_ASTEROIDS: AsteroidsConfig = {
  seed: 1337,
  count: 6,
  minSize: 14,
  maxSize: 46,
  avgSize: 28,
  speed: 70,
  spawnInterval: 2.5,
};

export const SURVIVE_TIME = 30; // seconds to survive for a win

const MAX_ASTEROIDS = 48;
const VERTS = 11;
const ROT_SPEED_MAX = 1.2; // rad/s

interface Asteroid {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  rotSpeed: number;
  shape: number[]; // per-vertex radius multipliers, length VERTS
}

function makeAsteroid(): Asteroid {
  return {
    active: false, x: 0, y: 0, vx: 0, vy: 0, r: 0, rot: 0, rotSpeed: 0,
    shape: new Array(VERTS).fill(1),
  };
}

// Triangular distribution over [min, max] with mode at avg (all clamped).
function triangular(rng: { next(): number }, min: number, max: number, avg: number): number {
  if (max <= min) return min;
  const mode = Math.min(Math.max(avg, min), max);
  const u = rng.next();
  const f = (mode - min) / (max - min);
  if (u < f) return min + Math.sqrt(u * (max - min) * (mode - min));
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

export function createAsteroids(cfg: AsteroidsConfig): Fight {
  const rng = createRng(cfg.seed);

  const rocks: Asteroid[] = [];
  for (let i = 0; i < MAX_ASTEROIDS; i++) rocks.push(makeAsteroid());

  let elapsed = 0;
  let spawnTimer = 0;

  function activeCount(): number {
    let n = 0;
    for (let i = 0; i < MAX_ASTEROIDS; i++) if (rocks[i].active) n++;
    return n;
  }

  function freeSlot(): number {
    for (let i = 0; i < MAX_ASTEROIDS; i++) if (!rocks[i].active) return i;
    return -1;
  }

  // Spawn on a random arena edge, drifting roughly inward with angular spread.
  function spawn(): void {
    const slot = freeSlot();
    if (slot === -1) return;
    const a = rocks[slot];
    a.active = true;
    a.r = triangular(rng, cfg.minSize, cfg.maxSize, cfg.avgSize);

    const edge = Math.floor(rng.next() * 4);
    let inward: number;
    if (edge === 0) {
      a.x = ARENA.x + rng.next() * ARENA.w;
      a.y = ARENA.y;
      inward = Math.PI / 2;
    } else if (edge === 1) {
      a.x = ARENA.x + ARENA.w;
      a.y = ARENA.y + rng.next() * ARENA.h;
      inward = Math.PI;
    } else if (edge === 2) {
      a.x = ARENA.x + rng.next() * ARENA.w;
      a.y = ARENA.y + ARENA.h;
      inward = -Math.PI / 2;
    } else {
      a.x = ARENA.x;
      a.y = ARENA.y + rng.next() * ARENA.h;
      inward = 0;
    }

    const dir = inward + (rng.next() - 0.5) * 1.2;
    const mag = cfg.speed * (0.75 + rng.next() * 0.5);
    a.vx = Math.cos(dir) * mag;
    a.vy = Math.sin(dir) * mag;
    a.rot = rng.next() * Math.PI * 2;
    a.rotSpeed = (rng.next() - 0.5) * 2 * ROT_SPEED_MAX;
    for (let i = 0; i < VERTS; i++) a.shape[i] = 0.7 + rng.next() * 0.5;
  }

  function reset(): void {
    rng.reseed(cfg.seed);
    elapsed = 0;
    for (let i = 0; i < MAX_ASTEROIDS; i++) rocks[i].active = false;
    const initial = Math.min(cfg.count, MAX_ASTEROIDS);
    for (let i = 0; i < initial; i++) spawn();
    spawnTimer = cfg.spawnInterval;
  }

  reset();

  function update(player: Cursor, dt: number): FightStatus {
    elapsed += dt;

    if (cfg.spawnInterval > 0) {
      spawnTimer -= dt;
      while (spawnTimer <= 0) {
        if (activeCount() < MAX_ASTEROIDS) spawn();
        spawnTimer += cfg.spawnInterval;
      }
    }

    for (let i = 0; i < MAX_ASTEROIDS; i++) {
      const a = rocks[i];
      if (!a.active) continue;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.rot += a.rotSpeed * dt;

      // Screen-wrap within the arena, using the radius as margin.
      const m = a.r;
      if (a.x < ARENA.x - m) a.x += ARENA.w + 2 * m;
      else if (a.x > ARENA.x + ARENA.w + m) a.x -= ARENA.w + 2 * m;
      if (a.y < ARENA.y - m) a.y += ARENA.h + 2 * m;
      else if (a.y > ARENA.y + ARENA.h + m) a.y -= ARENA.h + 2 * m;

      if (circleRectOverlap(a.x, a.y, a.r, player.pos.x, player.pos.y, CURSOR_SIZE, CURSOR_SIZE)) {
        return "lost";
      }
    }

    if (elapsed >= SURVIVE_TIME) return "won";
    return "running";
  }

  function draw(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < MAX_ASTEROIDS; i++) {
      const a = rocks[i];
      if (!a.active) continue;
      drawAsteroid(ctx, a.x, a.y, a.r, a.rot, a.shape);
    }
  }

  return { update, draw, reset };
}

const ASTEROIDS_PARAMS: readonly FightParam[] = [
  { key: "seed", label: "Seed", kind: "seed", min: 0, max: 999999, step: 1 },
  { key: "count", label: "Asteroid count", kind: "int", min: 0, max: MAX_ASTEROIDS, step: 1 },
  { key: "minSize", label: "Min size", kind: "float", min: 4, max: 120, step: 1 },
  { key: "maxSize", label: "Max size", kind: "float", min: 4, max: 120, step: 1 },
  { key: "avgSize", label: "Average size", kind: "float", min: 4, max: 120, step: 1 },
  { key: "speed", label: "Speed", kind: "float", min: 0, max: 300, step: 5 },
  { key: "spawnInterval", label: "Spawn interval (s)", kind: "float", min: 0, max: 10, step: 0.1 },
];

export const ASTEROIDS: FightDefinition<AsteroidsConfig> = {
  name: "Asteroids",
  params: ASTEROIDS_PARAMS,
  defaults: DEFAULT_ASTEROIDS,
  create: (config) => createAsteroids(config),
};
