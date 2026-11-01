// Shared types for the replacement rules engine. No Shopify or UI imports here.

export const SIZES = ["XXS", "XS", "S", "M", "L", "XL"] as const;
export type Size = (typeof SIZES)[number];
export type SizeCounts = Partial<Record<Size, number>>;
import type { ColorFamily } from "./colors";
export type { ColorFamily };
export type FixtureType = "rail" | "table";

/** A style-color that could fill a slot. Counts are sellable units only. */
export interface Candidate {
  productId: string;
  title: string;
  category: string;
  department: string;
  colorFamily: ColorFamily;
  fixtureType: FixtureType | "both";
  back: SizeCounts; // sellable units in back stock
  damaged: SizeCounts; // damaged units in back stock (never counted as sellable)
  placed: boolean; // already on the floor somewhere
  weeklyVelocity: number; // recent units sold per week
}

/** What currently sits in a slot. */
export interface SlotItem {
  productId: string;
  title: string;
  category: string;
  colorFamily: ColorFamily;
}

export interface FixtureContext {
  name: string;
  type: FixtureType;
  zone: { name: string; department: string; palette: ColorFamily[] };
  slots: (SlotItem | null)[]; // ordered left to right
}

export type CadenceLookup = (fixtureType: FixtureType, category: string) => SizeCounts | undefined;

export interface Weights {
  velocity: number;
  cover: number;
  balance: number;
  contrast: number;
}

/** Soft and hard preferences a person (or the copilot) can add. Never loosens a hard rule. */
export interface Preferences {
  weights?: Partial<Weights>;
  category?: string; // "I want a top"
  colorFamilies?: ColorFamily[]; // "something brighter" -> ["red", "blue", "pink"]
}

export interface EngineConfig {
  weights: Weights;
  categoryCap: number; // max styles of one category per fixture
  depthMultiplier: number; // back stock must refill the cadence this many times
  coverWeeksCap: number; // cover score saturates at this many weeks
  topN: number;
}

/** Result of a single hard rule. */
export type RuleResult = { ok: true } | { ok: false; rule: string; reason: string };

export const pass: RuleResult = { ok: true };
export const fail = (rule: string, reason: string): RuleResult => ({ ok: false, rule, reason });
