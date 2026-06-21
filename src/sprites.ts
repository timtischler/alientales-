export interface Sprite {
  readonly w: number;
  readonly h: number;
  readonly palette: readonly string[];
  readonly cells: readonly number[];
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  pixel: number,
): void {
  for (let r = 0; r < sprite.h; r++) {
    for (let c = 0; c < sprite.w; c++) {
      const idx = sprite.cells[r * sprite.w + c];
      if (idx === 0) continue;
      ctx.fillStyle = sprite.palette[idx];
      ctx.fillRect(x + c * pixel, y + r * pixel, pixel, pixel);
    }
  }
}

// palette: 0 transparent | 1 body | 2 eyes | 3 antenna tips | 4 mouth
const ALIEN_ROWS: number[][] = [
  [0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0],
  [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1],
  [1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1],
  [1, 1, 1, 1, 4, 4, 4, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0],
];

export const ALIEN: Sprite = {
  w: 11,
  h: 8,
  palette: ["", "#7df9ff", "#ffffff", "#ff5cf0", "#ff3b3b"],
  cells: ALIEN_ROWS.flat(),
};

export const UFO_COLORS: readonly string[] = [
  "#ff5252", "#ffd740", "#69f0ae", "#40c4ff", "#e040fb", "#ff6e40",
];

export function drawUfo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y + h * 0.45, w, h * 0.35);
  ctx.fillRect(x + w * 0.12, y + h * 0.3, w * 0.76, h * 0.3);
  ctx.fillStyle = "#cfe8ff";
  ctx.fillRect(x + w * 0.32, y + h * 0.05, w * 0.36, h * 0.4);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + w * 0.18, y + h * 0.62, 3, 3);
  ctx.fillRect(x + w * 0.45, y + h * 0.62, 3, 3);
  ctx.fillRect(x + w * 0.72, y + h * 0.62, 3, 3);
}

export function drawBeam(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  top: number,
  w: number,
  len: number,
  color: string,
): void {
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = color;
  ctx.fillRect(centerX - w / 2, top, w, len);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(centerX - w / 2, top + len - 3, w, 3);
}

export function drawEye(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  lookDx: number, lookDy: number,
): void {
  ctx.fillStyle = "#f4f4ff";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  const ix = x + lookDx * r * 0.4;
  const iy = y + lookDy * r * 0.4;
  ctx.fillStyle = "#7a3cff";
  ctx.beginPath();
  ctx.arc(ix, iy, r * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0a0010";
  ctx.beginPath();
  ctx.arc(ix, iy, r * 0.24, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(ix - r * 0.12, iy - r * 0.12, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

export function drawSmallEye(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
): void {
  ctx.fillStyle = "#f4f4ff";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#c0182b";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0a0010";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.24, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBeamLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  width: number, color: string, alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// A small blocky cow, drawn centered at (x,y) in a local upright frame (feet at
// local +y). The caller translates to the ring position and rotates by
// `angle - PI/2` so the feet point outward and the head toward the ring center.
// Built entirely from fillRect (mock-ctx friendly). Exactly one muzzle fillRect
// at "#f7b6c2" per cow — render tests count these to census cows.
export function drawCow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  facing: number,
  grazeAmount: number,
  stride: number,
): void {
  const s = scale;
  const f = facing >= 0 ? 1 : -1;

  // Legs (behind body) — two poses for a simple walk cycle.
  ctx.fillStyle = "#2b2b2b";
  const sp = stride === 0 ? 1 : -1;
  const legY = y + 2 * s;
  const legH = 5 * s;
  const legW = 1.6 * s;
  ctx.fillRect(x + (-5 + sp) * s, legY, legW, legH);
  ctx.fillRect(x + (-2 - sp) * s, legY, legW, legH);
  ctx.fillRect(x + (2 + sp) * s, legY, legW, legH);
  ctx.fillRect(x + (5 - sp) * s, legY, legW, legH);

  // Body — white blocky torso.
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(x - 7 * s, y - 4 * s, 14 * s, 8 * s);

  // Spots — black.
  ctx.fillStyle = "#1f1f1f";
  ctx.fillRect(x - 4 * s, y - 2 * s, 3 * s, 3 * s);
  ctx.fillRect(x + 1 * s, y, 3 * s, 3 * s);

  // Tail — trailing side.
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(x - f * 8 * s, y - 3 * s, 1.4 * s, 6 * s);

  // Head — leading side; lowers toward the grass as grazeAmount rises.
  const headX = x + f * 7 * s;
  const headY = y + (-2 + grazeAmount * 7) * s;

  // Horns.
  ctx.fillStyle = "#d8c08a";
  ctx.fillRect(headX - 1.5 * s, headY - 4 * s, 1.2 * s, 2 * s);
  ctx.fillRect(headX + f * 2 * s, headY - 4 * s, 1.2 * s, 2 * s);

  // Ear (trailing edge of head).
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(headX - f * 2 * s, headY - 2.5 * s, 2 * s, 1.6 * s);

  // Head block.
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(headX - 2 * s, headY - 2 * s, 4.5 * s, 4 * s);

  // Muzzle (pink) — exactly one per cow; cow-census signature.
  ctx.fillStyle = "#f7b6c2";
  ctx.fillRect(headX + f * 1.5 * s, headY - 1 * s, 2.2 * s, 2.4 * s);
}
