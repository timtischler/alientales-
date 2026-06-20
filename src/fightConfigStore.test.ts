import { describe, it, expect } from "vitest";
import { loadFightConfig, saveFightConfig } from "./fightConfigStore";
import type { FightDefinition } from "./fights/types";

const DEF: FightDefinition<{ seed: number; count: number; keep: number }> = {
  name: "UFO Invasion",
  params: [
    { key: "seed", label: "Seed", kind: "seed" },
    { key: "count", label: "Count", kind: "int" },
  ],
  defaults: { seed: 1337, count: 30, keep: 7 },
  create: () => ({ update: () => "running", draw: () => {}, reset: () => {} }),
};

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  };
}

describe("fight config persistence", () => {
  it("returns defaults when nothing stored", () => {
    expect(loadFightConfig(fakeStorage(), DEF)).toEqual(DEF.defaults);
  });
  it("returns defaults on malformed JSON", () => {
    const s = fakeStorage({ "bullethell.fight.UFO Invasion": "{not json" });
    expect(loadFightConfig(s, DEF)).toEqual(DEF.defaults);
  });
  it("returns defaults when a param key is missing or non-numeric", () => {
    const s = fakeStorage({ "bullethell.fight.UFO Invasion": JSON.stringify({ seed: "x", count: 5 }) });
    expect(loadFightConfig(s, DEF)).toEqual(DEF.defaults);
  });
  it("round-trips a saved config", () => {
    const s = fakeStorage();
    saveFightConfig(s, DEF, { seed: 42, count: 12, keep: 7 });
    expect(loadFightConfig(s, DEF)).toEqual({ seed: 42, count: 12, keep: 7 });
  });
  it("keeps default values for keys absent from the stored object", () => {
    const s = fakeStorage({ "bullethell.fight.UFO Invasion": JSON.stringify({ seed: 9, count: 3 }) });
    expect(loadFightConfig(s, DEF)).toEqual({ seed: 9, count: 3, keep: 7 });
  });
});
