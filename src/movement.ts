import type { InputState, MovementMode, Vec2 } from "./types";
import { ARENA, CURSOR_SIZE, CURSOR_SPEED, ACCEL_TIME } from "./constants";

export interface Cursor {
  pos: Vec2;
  vel: Vec2;
}

export function makeCursor(): Cursor {
  return {
    pos: {
      x: ARENA.x + (ARENA.w - CURSOR_SIZE) / 2,
      y: ARENA.y + (ARENA.h - CURSOR_SIZE) / 2,
    },
    vel: { x: 0, y: 0 },
  };
}

function clampToArena(cursor: Cursor): void {
  const maxX = ARENA.x + ARENA.w - CURSOR_SIZE;
  const maxY = ARENA.y + ARENA.h - CURSOR_SIZE;
  if (cursor.pos.x < ARENA.x) cursor.pos.x = ARENA.x;
  else if (cursor.pos.x > maxX) cursor.pos.x = maxX;
  if (cursor.pos.y < ARENA.y) cursor.pos.y = ARENA.y;
  else if (cursor.pos.y > maxY) cursor.pos.y = maxY;
}

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
}

export function stepMovement(
  cursor: Cursor,
  input: InputState,
  dt: number,
  mode: MovementMode,
): void {
  // Desired direction from input (-1, 0, or 1 per axis).
  let dirX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dirY = (input.down ? 1 : 0) - (input.up ? 1 : 0);

  // Normalize so diagonals are not faster than cardinals.
  if (dirX !== 0 && dirY !== 0) {
    const inv = 1 / Math.SQRT2;
    dirX *= inv;
    dirY *= inv;
  }

  if (mode === "digital") {
    cursor.vel.x = dirX * CURSOR_SPEED;
    cursor.vel.y = dirY * CURSOR_SPEED;
  } else {
    const targetX = dirX * CURSOR_SPEED;
    const targetY = dirY * CURSOR_SPEED;
    const maxDelta = (CURSOR_SPEED / ACCEL_TIME) * dt;
    cursor.vel.x = approach(cursor.vel.x, targetX, maxDelta);
    cursor.vel.y = approach(cursor.vel.y, targetY, maxDelta);
  }

  cursor.pos.x += cursor.vel.x * dt;
  cursor.pos.y += cursor.vel.y * dt;
  clampToArena(cursor);
}

export function resetCursor(cursor: Cursor): void {
  cursor.pos.x = ARENA.x + (ARENA.w - CURSOR_SIZE) / 2;
  cursor.pos.y = ARENA.y + (ARENA.h - CURSOR_SIZE) / 2;
  cursor.vel.x = 0;
  cursor.vel.y = 0;
}
