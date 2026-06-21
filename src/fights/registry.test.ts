import { describe, it, expect } from "vitest";
import { FIGHTS } from "./registry";

describe("FIGHTS registry", () => {
  it("lists all fights by name", () => {
    expect(FIGHTS.map((f) => f.name)).toEqual(["UFO Invasion", "Eye Beams", "Asteroids", "Tempest"]);
  });
  it("each definition is usable (params + create)", () => {
    for (const f of FIGHTS) {
      expect(f.params.length).toBeGreaterThan(0);
      expect(typeof f.create).toBe("function");
    }
  });
});
