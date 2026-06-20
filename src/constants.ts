export const LOGICAL_WIDTH = 800;
export const LOGICAL_HEIGHT = 600;

export const FIXED_DT = 1 / 120;
export const MAX_FRAME_DT = 0.25;

export const CURSOR_SPEED = 240; // logical px per second
export const CURSOR_SIZE = 16; // px (square side)
export const ACCEL_TIME = 0.08; // seconds to reach full speed in accelerated mode

// Arena is a 300x300 square centered in the 800x600 logical space.
export const ARENA = { x: 250, y: 150, w: 300, h: 300 } as const;
