import { describe, it, expect } from "vitest";
import { makeCursor, stepMovement } from "./movement";
import { ARENA, CURSOR_SIZE, CURSOR_SPEED } from "./constants";

const noInput = { up: false, down: false, left: false, right: false };

describe("makeCursor", () => {
  it("centers the cursor in the arena with zero velocity", () => {
    const c = makeCursor();
    expect(c.pos.x).toBe(ARENA.x + (ARENA.w - CURSOR_SIZE) / 2);
    expect(c.pos.y).toBe(ARENA.y + (ARENA.h - CURSOR_SIZE) / 2);
    expect(c.vel).toEqual({ x: 0, y: 0 });
  });
});

describe("stepMovement digital", () => {
  it("moves right at full speed instantly", () => {
    const c = makeCursor();
    const startX = c.pos.x;
    stepMovement(c, { ...noInput, right: true }, 0.1, "digital");
    expect(c.pos.x).toBeCloseTo(startX + CURSOR_SPEED * 0.1, 5);
  });

  it("stops instantly on release (no momentum)", () => {
    const c = makeCursor();
    stepMovement(c, { ...noInput, right: true }, 0.1, "digital");
    const afterMove = c.pos.x;
    stepMovement(c, noInput, 0.1, "digital");
    expect(c.pos.x).toBe(afterMove);
  });

  it("normalizes diagonal speed", () => {
    const c = makeCursor();
    const start = { x: c.pos.x, y: c.pos.y };
    stepMovement(c, { ...noInput, right: true, down: true }, 0.1, "digital");
    const dx = c.pos.x - start.x;
    const dy = c.pos.y - start.y;
    const dist = Math.hypot(dx, dy);
    expect(dist).toBeCloseTo(CURSOR_SPEED * 0.1, 4);
  });

  it("clamps to the right edge", () => {
    const c = makeCursor();
    stepMovement(c, { ...noInput, right: true }, 100, "digital");
    expect(c.pos.x).toBe(ARENA.x + ARENA.w - CURSOR_SIZE);
  });

  it("clamps to the left edge", () => {
    const c = makeCursor();
    stepMovement(c, { ...noInput, left: true }, 100, "digital");
    expect(c.pos.x).toBe(ARENA.x);
  });

  it("clamps to the bottom edge", () => {
    const c = makeCursor();
    stepMovement(c, { ...noInput, down: true }, 100, "digital");
    expect(c.pos.y).toBe(ARENA.y + ARENA.h - CURSOR_SIZE);
  });

  it("clamps to the top edge", () => {
    const c = makeCursor();
    stepMovement(c, { ...noInput, up: true }, 100, "digital");
    expect(c.pos.y).toBe(ARENA.y);
  });
});

describe("stepMovement accelerated", () => {
  it("does not reach full speed instantly", () => {
    const c = makeCursor();
    const startX = c.pos.x;
    // One short step: should move less than full-speed distance.
    stepMovement(c, { up: false, down: false, left: false, right: true }, 0.02, "accelerated");
    const moved = c.pos.x - startX;
    expect(moved).toBeLessThan(CURSOR_SPEED * 0.02);
    expect(moved).toBeGreaterThan(0);
  });

  it("ramps up to full speed after ACCEL_TIME of holding", () => {
    const c = makeCursor();
    const input = { up: false, down: false, left: false, right: true };
    // Advance well past ACCEL_TIME in small steps.
    for (let i = 0; i < 60; i++) stepMovement(c, input, 1 / 120, "accelerated");
    expect(c.vel.x).toBeCloseTo(CURSOR_SPEED, 1);
  });

  it("decelerates toward zero on release", () => {
    const c = makeCursor();
    const input = { up: false, down: false, left: false, right: true };
    for (let i = 0; i < 60; i++) stepMovement(c, input, 1 / 120, "accelerated");
    const noInput = { up: false, down: false, left: false, right: false };
    const velBefore = c.vel.x;
    stepMovement(c, noInput, 1 / 120, "accelerated");
    expect(c.vel.x).toBeLessThan(velBefore);
    expect(c.vel.x).toBeGreaterThanOrEqual(0);
  });
});
