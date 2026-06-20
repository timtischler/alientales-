import { describe, it, expect } from "vitest";
import { rectsOverlap } from "./collision";

describe("rectsOverlap", () => {
  it("true when rectangles overlap", () => {
    expect(rectsOverlap(0, 0, 10, 10, 5, 5, 10, 10)).toBe(true);
  });
  it("false when separated on x", () => {
    expect(rectsOverlap(0, 0, 10, 10, 20, 0, 10, 10)).toBe(false);
  });
  it("false when separated on y", () => {
    expect(rectsOverlap(0, 0, 10, 10, 0, 20, 10, 10)).toBe(false);
  });
  it("false when only edges touch", () => {
    expect(rectsOverlap(0, 0, 10, 10, 10, 0, 10, 10)).toBe(false);
  });
  it("true when one contains the other", () => {
    expect(rectsOverlap(0, 0, 100, 100, 40, 40, 5, 5)).toBe(true);
  });
});
