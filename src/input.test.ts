import { describe, it, expect, beforeEach } from "vitest";
import { createInput } from "./input";

type Handler = (e: any) => void;

class FakeTarget {
  handlers: Record<string, Handler[]> = {};
  addEventListener(type: string, h: Handler) {
    (this.handlers[type] ??= []).push(h);
  }
  removeEventListener(type: string, h: Handler) {
    this.handlers[type] = (this.handlers[type] ?? []).filter((x) => x !== h);
  }
  fire(type: string, e: any) {
    e.preventDefault ??= () => {};
    for (const h of this.handlers[type] ?? []) h(e);
  }
}

let target: FakeTarget;
beforeEach(() => {
  target = new FakeTarget();
});

describe("createInput", () => {
  it("sets the matching direction on keydown", () => {
    const input = createInput(target as any);
    target.fire("keydown", { code: "KeyD", repeat: false });
    expect(input.state.right).toBe(true);
    expect(input.state.left).toBe(false);
  });

  it("clears the direction on keyup", () => {
    const input = createInput(target as any);
    target.fire("keydown", { code: "KeyW", repeat: false });
    expect(input.state.up).toBe(true);
    target.fire("keyup", { code: "KeyW", repeat: false });
    expect(input.state.up).toBe(false);
  });

  it("ignores OS key-repeat events", () => {
    const input = createInput(target as any);
    let prevents = 0;
    target.fire("keydown", { code: "KeyA", repeat: true, preventDefault: () => prevents++ });
    expect(input.state.left).toBe(false);
    expect(prevents).toBe(0);
  });

  it("calls preventDefault on handled keys", () => {
    const input = createInput(target as any);
    let prevented = false;
    target.fire("keydown", { code: "KeyS", repeat: false, preventDefault: () => (prevented = true) });
    expect(prevented).toBe(true);
    expect(input.state.down).toBe(true);
  });

  it("ignores unrelated keys", () => {
    const input = createInput(target as any);
    let prevented = false;
    target.fire("keydown", { code: "KeyQ", repeat: false, preventDefault: () => (prevented = true) });
    expect(prevented).toBe(false);
    expect(input.state).toEqual({ up: false, down: false, left: false, right: false });
  });

  it("dispose removes listeners", () => {
    const input = createInput(target as any);
    input.dispose();
    target.fire("keydown", { code: "KeyD", repeat: false });
    expect(input.state.right).toBe(false);
  });
});
