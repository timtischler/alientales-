import { describe, it, expect } from "vitest";
import { loadMode, saveMode } from "./settings";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("settings persistence", () => {
  it("defaults to digital when nothing stored", () => {
    expect(loadMode(fakeStorage())).toBe("digital");
  });

  it("defaults to digital when stored value is invalid", () => {
    expect(loadMode(fakeStorage({ "bullethell.movementMode": "nonsense" }))).toBe("digital");
  });

  it("round-trips a saved mode", () => {
    const s = fakeStorage();
    saveMode(s, "accelerated");
    expect(loadMode(s)).toBe("accelerated");
  });
});
