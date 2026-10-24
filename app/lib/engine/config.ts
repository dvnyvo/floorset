import type { EngineConfig } from "./types";

// Starting weights from the project plan; tune here.
export const defaultConfig: EngineConfig = {
  weights: { velocity: 0.35, cover: 0.25, balance: 0.25, contrast: 0.15 },
  categoryCap: 2,
  depthMultiplier: 2,
  coverWeeksCap: 12,
  topN: 3,
};
