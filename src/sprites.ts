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
