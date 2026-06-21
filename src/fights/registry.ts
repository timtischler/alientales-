import type { FightDefinition } from "./types";
import { UFO_INVASION } from "./ufoInvasion";
import { EYE_BEAMS } from "./eyeBeams";
import { ASTEROIDS } from "./asteroids";
import { TEMPEST } from "./tempest";

export const FIGHTS: readonly FightDefinition<unknown>[] = [UFO_INVASION, EYE_BEAMS, ASTEROIDS, TEMPEST];
