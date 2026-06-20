import { describe, it, expect } from "vitest";
import { rectsOverlap, distancePointToSegment } from "./collision";

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

describe("distancePointToSegment", () => {
  it("is zero for a point on the segment", () => {
    expect(distancePointToSegment(5, 0, 0, 0, 10, 0)).toBe(0);
  });
  it("returns the perpendicular distance to the interior", () => {
    expect(distancePointToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
  });
  it("clamps to endpoint A when the projection is before the start", () => {
    expect(distancePointToSegment(-3, 4, 0, 0, 10, 0)).toBeCloseTo(5);
  });
  it("clamps to endpoint B when the projection is past the end", () => {
    expect(distancePointToSegment(13, 4, 0, 0, 10, 0)).toBeCloseTo(5);
  });
  it("returns the distance to the point for a degenerate segment", () => {
    expect(distancePointToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5);
  });
});
