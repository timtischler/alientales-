import { describe, it, expect } from "vitest";
import { drawSprite, drawUfo, drawBeam, ALIEN, UFO_COLORS } from "./sprites";

function fakeCtx() {
  const calls: { x: number; y: number; w: number; h: number; fill: string }[] = [];
  let fill = "";
  let alpha = 1;
  return {
    set fillStyle(v: string) { fill = v; },
    get fillStyle() { return fill; },
    set globalAlpha(v: number) { alpha = v; },
    get globalAlpha() { return alpha; },
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ x, y, w, h, fill });
    },
    calls,
  };
}

describe("drawSprite", () => {
  it("draws one rect per non-transparent cell at scaled coordinates", () => {
    const sprite = { w: 2, h: 2, palette: ["", "#f00"], cells: [0, 1, 1, 0] };
    const ctx = fakeCtx();
    drawSprite(ctx as unknown as CanvasRenderingContext2D, sprite, 5, 5, 10);
    expect(ctx.calls).toEqual([
      { x: 15, y: 5, w: 10, h: 10, fill: "#f00" },
      { x: 5, y: 15, w: 10, h: 10, fill: "#f00" },
    ]);
  });
});

describe("ALIEN", () => {
  it("has cells matching its dimensions and valid palette indices", () => {
    expect(ALIEN.cells.length).toBe(ALIEN.w * ALIEN.h);
    for (const c of ALIEN.cells) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(ALIEN.palette.length);
    }
  });
});

describe("drawUfo", () => {
  it("uses the given color and draws several rects", () => {
    const ctx = fakeCtx();
    drawUfo(ctx as unknown as CanvasRenderingContext2D, 100, 50, 40, 16, "#40c4ff");
    expect(ctx.calls.length).toBeGreaterThan(2);
    expect(ctx.calls.some((c) => c.fill === "#40c4ff")).toBe(true);
  });
});

describe("drawBeam", () => {
  it("draws a translucent column and resets alpha to 1", () => {
    const ctx = fakeCtx();
    drawBeam(ctx as unknown as CanvasRenderingContext2D, 200, 60, 28, 100, "#69f0ae");
    expect(ctx.calls.length).toBeGreaterThanOrEqual(2);
    expect(ctx.globalAlpha).toBe(1);
  });
});

describe("UFO_COLORS", () => {
  it("has six colors", () => {
    expect(UFO_COLORS.length).toBe(6);
  });
});
