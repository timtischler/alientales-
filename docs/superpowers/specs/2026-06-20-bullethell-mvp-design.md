# Bullethell MVP — Arena + WASD Cursor

**Date:** 2026-06-20
**Status:** Approved

## Goal

The first slice of an Undertale-style bullethell game: a centered arena box
with a cursor the player moves via WASD. The overriding requirement is that
movement **feels fast and responsive** with no periodic lag. Every design choice
below serves that constraint first.

## Environment

- Developed in WSL2 Ubuntu on a Windows host.
- The game runs in a **native Windows browser** (Chrome/Edge) at
  `localhost:5173`, served by a Vite dev server running in WSL2. WSL2 forwards
  `localhost` to Windows automatically.
- This path deliberately **avoids WSLg**. A Linux-native engine build inside
  WSL2 would display through WSLg's RDP/compositor layer, adding input latency
  and frame-pacing jitter — the exact problem we are avoiding. The native
  Windows browser uses the native input path and GPU with no such layer.

## Stack

- **Vite + TypeScript**, no UI framework.
- A single `<canvas>` rendered with **Canvas2D**.
- Canvas2D (not three.js/WebGL) is chosen deliberately: the scene is flat 2D,
  and `fillRect` draws hundreds of bullets at 60fps without trouble. WebGL buys
  nothing at this scale. It remains a later swap **only** if we ever measure
  real jank with many bullets.

## The Responsiveness Core

This is where the game's feel lives.

### Loop

- `requestAnimationFrame` drives rendering, aligned to vsync.
- A **fixed-timestep accumulator** simulates at **120 Hz**.
- The renderer draws the **latest** simulated state with **no interpolation**.
  Interpolation between sim states would add up to ~1 frame of input latency; we
  trade it away in favor of tightness. At 120 Hz sim on a 60 Hz display, every
  rendered frame already reflects a fresh, recent simulation step.
- `dt` is **clamped** (e.g. to 0.25s max per frame) to prevent the
  spiral-of-death after a tab stall or breakpoint.

### Zero per-frame allocation

- The loop allocates nothing per frame: no `new`, no array/object literals, no
  per-frame closures.
- This is the single biggest defense against the "periodic lag" common in
  browser games. That lag is almost always **GC pauses**. If we never allocate
  during play, we never trigger GC during play.

### Input

- A keystate `Set<string>` is updated by `window` `keydown`/`keyup` listeners.
- `event.repeat` is ignored (OS key-repeat must not affect movement).
- The keystate is **sampled at the start of each simulation step**, not driven
  by individual events. This is frame-independent and lowest-latency.
- `preventDefault` is applied to game keys to stop browser side effects (e.g.
  page scroll) as they are added.

### Canvas

- A fixed **logical resolution** (e.g. 800×600) defines the coordinate space.
- The backing store is scaled by `devicePixelRatio` for crisp pixels on
  high-DPI displays.

## Visual Layout

- Black background.
- A **white square outline** centered on screen — the arena / "battle box".
- A small **filled cursor** starting at the center, moved by WASD, **clamped**
  so it cannot leave the arena bounds.

## Movement Model

A **pure, unit-testable** function is the heart of the feel:

```
move(pos, input, dt, mode) -> pos
```

- `mode = "digital"` (default): full speed the instant a key is pressed, dead
  stop the instant it is released. No acceleration, no momentum. Maximally
  precise — how Undertale's heart moves.
- `mode = "accelerated"`: ramps to full speed over ~80ms and decelerates on
  release. Smoother/weightier, slightly less precise.
- The returned position is **clamped to the arena bounds**.

Because this function is pure (no DOM, no globals), it is tested directly with
unit tests covering: single-axis motion, diagonal motion, stop-on-release,
clamping at each edge, and both modes.

## Settings

- A minimal **HTML overlay** (outside the canvas, so it never touches the render
  loop) provides a movement-mode toggle.
- The selected mode is persisted to `localStorage` and restored on load.
- Default is `digital`.

## File Shape

Small, focused units, each with one purpose:

- `index.html` — canvas + settings overlay markup.
- `src/main.ts` — bootstrap and the fixed-timestep game loop.
- `src/input.ts` — keystate tracking.
- `src/movement.ts` — the pure movement model (with co-located unit tests).
- `src/render.ts` — Canvas2D drawing of arena and cursor.
- `src/settings.ts` — movement-mode toggle and `localStorage` persistence.

## Testing & Verification

- **Unit tests** (Vitest) cover the pure movement/clamping math.
- The **loop and feel** are verified by running the dev server and observing the
  game in the Windows browser — responsiveness is a felt property, not a unit
  test.

## Non-Goals (this slice)

- No bullets, enemies, collision, health, or combat yet.
- No sprites/art beyond plain rectangles.
- No audio.

These follow in later slices, built on this responsiveness foundation.
