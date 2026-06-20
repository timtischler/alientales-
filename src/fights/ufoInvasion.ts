import type { Rng } from "../rng";
import { UFO_COLORS } from "../sprites";
import { ARENA } from "../constants";

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
