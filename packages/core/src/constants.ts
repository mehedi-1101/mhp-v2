import type { MealType, MealStatus } from "./types.js";

export const CUTOFF_HOUR = 21; // 9 PM Asia/Dhaka — hardcoded, not read from Settings

export const MEAL_DEFAULTS: Record<MealType, MealStatus> = {
  LUNCH: "IN",
  SNACKS: "IN",
  IFTAR: "IN",           // context-dependent — overridden by availability logic when outside period
  EVENT_DINNER: "IN",
  OPTIONAL_DINNER: "OUT",
};

export const TIMEZONE = "Asia/Dhaka";
