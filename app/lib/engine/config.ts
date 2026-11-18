import type { EngineConfig } from "./types";

// Starting weights from the project plan; tune here.
export const defaultConfig: EngineConfig = {
  weights: { velocity: 0.35, cover: 0.25, contrast: 0.4 },
  depthMultiplier: 2,
  coverWeeksCap: 4,
  topN: 3,
};
