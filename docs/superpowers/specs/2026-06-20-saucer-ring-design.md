# Saucer Ring Fight (v1 — no cows)

**Date:** 2026-06-20
**Status:** Proposed

A new fight: saucers ride a big green circle around the player and fire inward
through the center — small Space-Invaders shots and occasional Galaga tractor
beams. This is v1; cows, abduction, dive-on-miss, and hostile cows come later.

## World

- A **green circle** centered on the box center `CX,CY = 400,300`, radius
  `WORLD_R = 285`, drawn as a stroked **outline** (not a filled disc), so the
  interior stays black. Everything stays inside it. (Drawing it as an outline
  also lets the JPEG saucer sprites — which carry a dark background, no
  transparency — sit over the black interior where that background blends in.)
- The existing square player box sits in the center. The annulus between the box
  and the circle is alien space.

## Saucers

- `alienCount` saucers (default **3**) ride the rim, orbiting the circle at
  radius `ALIEN_R = WORLD_R - 20`. Each has a seeded initial angle (spread
  around the ring) and a shared angular velocity `orbitSpeed`.
- A saucer's position is `(CX + ALIEN_R*cosθ, CY + ALIEN_R*sinθ)`. It fires
  **inward along the normal** — direction `(-cosθ, -sinθ)`, i.e. straight toward
  the center. Both attack types fire along this line.

## Attacks (both fire through the center)

### Little shots (Space Invaders)
- While orbiting, each saucer fires on a seeded cadence (`shotGapMin/Max`): it
  spawns a small projectile at its position with velocity `inwardDir *
  shotSpeed`. The projectile travels straight (through the center and out the far
  side) and despawns once its distance from the center exceeds `WORLD_R`.
- Projectiles are a fixed pool (`MAX_SHOTS = 64`).

### Tractor beam (Galaga)
- On a separate, slower seeded cadence (`tractorGapMin/Max`), a saucer launches a
  tractor beam: it **holds position** (freezes its orbit), telegraphs a thin line
  along the inward normal for `telegraphTime`, then fires a thick beam (width
  `beamWidth`) along that line for `beamTime`, then resumes orbiting.
- While telegraphing/firing, the saucer pauses its little shots.
- The beam is the segment from the saucer through the center to the opposite rim
  (length `2*ALIEN_R` along the inward normal).

## Saucer sprites (sprite sheet, with fallback)

Saucers are drawn from a provided pixel sprite sheet when available, falling back
to the procedural `drawUfo` otherwise — so the fight works with or without the
asset.

- **Asset:** `images/alien_sprite.jpeg` (the 1024×559 "Funky UFO Invaders"
  sheet), imported as a Vite asset (`import url from "../../images/alien_sprite.jpeg"`)
  so it gets a served, hashed URL.
- **Loading:** a small image loader (`new Image(); img.src = url`) loads it once;
  a `ready` flag flips on `onload`. While not ready (or on error), draw falls
  back to `drawUfo`.
- **Design used:** v1 uses one design — the blue/orange classic saucer (top
  sprite row, third group of three frames). Its three frames (idle / move /
  animate) are a `SAUCER_FRAMES` constant of source rectangles
  `{ sx, sy, sw, sh }`. Starting coordinates come from the sheet grid (1024×559,
  12 columns ≈ 83px, 5 rows ≈ 94px below an ~84px title+header band) and are
  **fine-tuned during live browser verification** so each cell is centered.
- **Animation:** the saucer cycles its three frames on a fixed timer; when ready,
  `draw` uses `ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)` centered on the
  saucer position, sized to the saucer footprint.
- **Orientation:** v1 draws the sprite upright (no rotation). Rotating each
  saucer to face the center is a later polish item.

If the image fails to load the fight still renders (procedural saucers via
`drawUfo`).

## Collision & loss

Each fixed step, the player center (`cursor.pos + CURSOR_SIZE/2`, radius
`CURSOR_SIZE/2`) is tested against:

- every active **little shot** (`rectsOverlap` of the player square vs the shot's
  box, side `2*SHOT_R`), and
- every **firing** saucer's beam (`distancePointToSegment(player, saucer,
  saucer + inwardDir*2*ALIEN_R) <= beamWidth/2 + playerRadius`).

Any overlap → `"lost"`. Telegraph lines do not damage.

## Win

A volley is one tractor-beam fire (`firedVolleys++` on a saucer's telegraph→fire
transition). New tractor volleys stop being initiated once `firedVolleys >=
volleys`. **Win** when `firedVolleys >= volleys` and no saucer is telegraphing or
firing. (Little shots keep flying but do not gate the win.)

## Config (`SaucerRingConfig`)

`seed`, `volleys`, `alienCount`, `orbitSpeed`, `shotGapMin`, `shotGapMax`,
`shotSpeed`, `tractorGapMin`, `tractorGapMax`, `telegraphTime`, `beamTime`,
`beamWidth`.

Defaults: `seed 2025`, `volleys 16`, `alienCount 3`, `orbitSpeed 0.5`,
`shotGapMin 0.8`, `shotGapMax 1.8`, `shotSpeed 150`, `tractorGapMin 3`,
`tractorGapMax 6`, `telegraphTime 0.6`, `beamTime 0.4`, `beamWidth 24`.

The panel param set: `seed, volleys, alienCount, orbitSpeed, shotGapMin,
shotGapMax, shotSpeed, tractorGapMin, tractorGapMax, telegraphTime, beamTime,
beamWidth`.

## Determinism

Fixed timestep + seeded RNG. At `reset()`, saucers are seeded in index order
(each: `angle`, `shotTimer`, `tractorTimer`), with no other draws until spawns.
Little-shot spawns and tractor re-arms draw from the same RNG in fixed order on
the fixed-step timeline. `reset()` reseeds. Aiming is geometric (always toward
the center), so no per-shot randomness.

## Selector

Add `SAUCER_RING: FightDefinition<SaucerRingConfig>` (name "Saucer Ring") to the
`FIGHTS` registry so it appears in the fight dropdown alongside UFO Invasion and
Eye Beams.

## Testing

- **Loss by little shot:** one saucer, no tractor (`tractorGap` huge), fast
  shots, stationary centered player → a shot through the center hits → `"lost"`.
- **Loss by tractor beam:** one saucer, no shots (`shotGap` huge), `tractorGap 0`,
  stationary centered player → the beam through the center hits → `"lost"`.
- **Win:** `volleys 0`, no shots (`shotGap` huge) → no tractor, no hit → `"won"`
  quickly.
- **Determinism:** same seed → same loss step (single saucer).
- **alienCount → saucers drawn:** with `alienCount: P`, `draw` issues exactly `P`
  saucer domes (counted via the public draw surface: `drawUfo` draws one dome
  `fillRect` at fillStyle `#cfe8ff`). Covered for `P = 1` and `P = 3`.
- **Definition:** `SAUCER_RING.params` lists the exact keys; `FIGHTS` includes
  it.

Visuals and feel verified live in the browser.

## Non-Goals (v1)

- No cows, abduction, dive-on-miss, or hostile cows.
- No change to existing fights beyond adding this one to the registry.
