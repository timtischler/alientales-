import { createRng } from "../rng";
import { circleRectOverlap } from "../collision";
import { ARENA, CURSOR_SIZE } from "../constants";
import type { Cursor } from "../movement";
import type { Fight, FightStatus, FightDefinition, FightParam } from "./types";
import { drawTunnel, drawTempestMonster } from "../sprites";

export interface TempestConfig {
  seed: number;
  monsterCount: number;
  lanes: number;
  spawnInterval: number;
  speed: number;
  monsterSize: number;
}

export const DEFAULT_TEMPEST: TempestConfig = {
  seed: 7,
  monsterCount: 24,
  lanes: 12,
  spawnInterval: 0.9,
  speed: 0.33,
  monsterSize: 34,
};

const CX = ARENA.x + ARENA.w / 2;
const CY = ARENA.y + ARENA.h / 2;
const RIM_RADIUS = Math.min(ARENA.w, ARENA.h) / 2;
const RINGS = 6;
const MAX_MONSTERS = 64;
const DEEP_PX = 3; // pixel size at the vanishing point
const NEAR_THRESHOLD = 0.5; // progress before a monster shares the player's plane
const SPIN_MAX = 2.5; // rad/s wobble, cosmetic only

const COLORS: readonly string[] = [
  "#ffd740", "#69f0ae", "#40c4ff", "#e040fb", "#ff6e40", "#7df9ff",
];

interface Monster {
  active: boolean;
  lane: number;
  dirX: number;
  dirY: number;
  p: number; // depth progress: 0 deep (far) -> 1 rim (near)
  spin: number;
  spinSpeed: number;
}

function makeMonster(): Monster {
  return { active: false, lane: 0, dirX: 1, dirY: 0, p: 0, spin: 0, spinSpeed: 0 };
}

// Screen radius from the vanishing point for a given depth progress.
function screenRadius(p: number): number {
  return RIM_RADIUS * p;
}

function monsterPixels(p: number, monsterSize: number): number {
  return DEEP_PX + (monsterSize - DEEP_PX) * p;
}

export function createTempest(cfg: TempestConfig): Fight {
  const rng = createRng(cfg.seed);

  const monsters: Monster[] = [];
  for (let i = 0; i < MAX_MONSTERS; i++) monsters.push(makeMonster());

  let spawned = 0;
  let resolved = 0;
  let spawnTimer = 0;

  function freeSlot(): number {
    for (let i = 0; i < MAX_MONSTERS; i++) if (!monsters[i].active) return i;
    return -1;
  }

  function spawn(): void {
    const slot = freeSlot();
    if (slot === -1) return;
    const lanes = Math.max(3, Math.floor(cfg.lanes));
    const lane = Math.floor(rng.next() * lanes);
    const a = (lane / lanes) * Math.PI * 2;
    const m = monsters[slot];
    m.active = true;
    m.lane = lane;
    m.dirX = Math.cos(a);
    m.dirY = Math.sin(a);
    m.p = 0;
    m.spin = rng.next() * Math.PI * 2;
    m.spinSpeed = (rng.next() - 0.5) * 2 * SPIN_MAX;
    spawned++;
  }

  function reset(): void {
    rng.reseed(cfg.seed);
    spawned = 0;
    resolved = 0;
    for (let i = 0; i < MAX_MONSTERS; i++) monsters[i].active = false;
    spawnTimer = 0; // first monster emerges right away
  }

  reset();

  function update(player: Cursor, dt: number): FightStatus {
    if (spawned < cfg.monsterCount) {
      spawnTimer -= dt;
      while (spawnTimer <= 0 && spawned < cfg.monsterCount) {
        spawn();
        spawnTimer += cfg.spawnInterval;
      }
    }

    for (let i = 0; i < MAX_MONSTERS; i++) {
      const m = monsters[i];
      if (!m.active) continue;
      m.p += cfg.speed * dt;
      m.spin += m.spinSpeed * dt;

      if (m.p >= 1) {
        m.active = false;
        resolved++;
        continue;
      }

      if (m.p >= NEAR_THRESHOLD) {
        const r = screenRadius(m.p);
        const mx = CX + m.dirX * r;
        const my = CY + m.dirY * r;
        const pr = monsterPixels(m.p, cfg.monsterSize) / 2;
        if (circleRectOverlap(mx, my, pr, player.pos.x, player.pos.y, CURSOR_SIZE, CURSOR_SIZE)) {
          return "lost";
        }
      }
    }

    if (spawned >= cfg.monsterCount && resolved >= cfg.monsterCount) return "won";
    return "running";
  }

  function draw(ctx: CanvasRenderingContext2D): void {
    const lanes = Math.max(3, Math.floor(cfg.lanes));
    drawTunnel(ctx, CX, CY, RIM_RADIUS, lanes, RINGS);
    for (let i = 0; i < MAX_MONSTERS; i++) {
      const m = monsters[i];
      if (!m.active) continue;
      const r = screenRadius(m.p);
      const mx = CX + m.dirX * r;
      const my = CY + m.dirY * r;
      const size = monsterPixels(m.p, cfg.monsterSize);
      const angle = Math.atan2(m.dirY, m.dirX) + m.spin * 0.15;
      drawTempestMonster(ctx, mx, my, size, angle, COLORS[m.lane % COLORS.length]);
    }
  }

  return { update, draw, reset };
}

const TEMPEST_PARAMS: readonly FightParam[] = [
  { key: "seed", label: "Seed", kind: "seed", min: 0, max: 999999, step: 1 },
  { key: "monsterCount", label: "Monster count", kind: "int", min: 0, max: MAX_MONSTERS, step: 1 },
  { key: "lanes", label: "Tunnel lanes", kind: "int", min: 3, max: 24, step: 1 },
  { key: "spawnInterval", label: "Spawn interval (s)", kind: "float", min: 0.05, max: 5, step: 0.05 },
  { key: "speed", label: "Approach speed", kind: "float", min: 0.05, max: 1.5, step: 0.01 },
  { key: "monsterSize", label: "Monster size", kind: "float", min: 8, max: 80, step: 1 },
];

export const TEMPEST: FightDefinition<TempestConfig> = {
  name: "Tempest",
  params: TEMPEST_PARAMS,
  defaults: DEFAULT_TEMPEST,
  create: (config) => createTempest(config),
};
