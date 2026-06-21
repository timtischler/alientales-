import { describe, it, expect } from "vitest";
import { drawSprite, drawUfo, drawBeam, drawEye, drawSmallEye, drawBeamLine, ALIEN, UFO_COLORS } from "./sprites";

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

function eyeFakeCtx() {
  const counts = { arc: 0, fill: 0, stroke: 0 };
  let fillStyle = "";
  let strokeStyle = "";
  let lineWidth = 0;
  let globalAlpha = 1;
  let lineCap = "";
  const stateStack: { globalAlpha: number }[] = [];
  return {
    get fillStyle() { return fillStyle; },
    set fillStyle(v: string) { fillStyle = v; },
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(v: string) { strokeStyle = v; },
    get lineWidth() { return lineWidth; },
    set lineWidth(v: number) { lineWidth = v; },
    get globalAlpha() { return globalAlpha; },
    set globalAlpha(v: number) { globalAlpha = v; },
    get lineCap() { return lineCap; },
    set lineCap(v: string) { lineCap = v; },
    save() { stateStack.push({ globalAlpha }); },
    restore() { const s = stateStack.pop(); if (s) globalAlpha = s.globalAlpha; },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() { counts.arc++; },
    fill() { counts.fill++; },
    stroke() { counts.stroke++; },
    fillRect() {},
    counts,
  };
}

describe("drawEye", () => {
  it("draws several arcs and fills without throwing", () => {
    const ctx = eyeFakeCtx();
    drawEye(ctx as unknown as CanvasRenderingContext2D, 100, 100, 22, 1, 0);
    expect(ctx.counts.arc).toBeGreaterThanOrEqual(3);
    expect(ctx.counts.fill).toBeGreaterThanOrEqual(3);
  });
});

describe("drawSmallEye", () => {
  it("draws arcs without throwing", () => {
    const ctx = eyeFakeCtx();
    drawSmallEye(ctx as unknown as CanvasRenderingContext2D, 50, 60, 7);
    expect(ctx.counts.arc).toBeGreaterThanOrEqual(2);
  });
});

describe("drawBeamLine", () => {
  it("strokes a line and resets alpha", () => {
    const ctx = eyeFakeCtx();
    drawBeamLine(ctx as unknown as CanvasRenderingContext2D, 0, 0, 100, 100, 26, "#ff3b6b", 0.85);
    expect(ctx.counts.stroke).toBeGreaterThanOrEqual(1);
    expect(ctx.globalAlpha).toBe(1);
  });
});

import { drawCow } from "./sprites";

describe("drawCow", () => {
  it("draws exactly one muzzle fillRect (#f7b6c2 cow-census signature)", () => {
    let muzzles = 0;
    let fill = "";
    const ctx = {
      set fillStyle(v: string) { fill = v; },
      get fillStyle() { return fill; },
      fillRect() { if (fill === "#f7b6c2") muzzles++; },
    } as unknown as CanvasRenderingContext2D;
    drawCow(ctx, 0, 0, 1, 1, 0, 0);
    expect(muzzles).toBe(1);
  });

  it("does not throw for grazing pose and reversed facing", () => {
    const ctx = {
      set fillStyle(_v: string) {},
      fillRect() {},
    } as unknown as CanvasRenderingContext2D;
    expect(() => drawCow(ctx, 5, 5, 1.2, -1, 1, 1)).not.toThrow();
  });
});
