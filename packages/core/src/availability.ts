import type { MealType, MealStatus, SpecialDay, Settings } from "./types.js";
import { MEAL_DEFAULTS } from "./constants.js";

export interface MealAvailability {
  mealType: MealType;
  defaultStatus: MealStatus;
}

/**
 * Determines which meals are available on a given date and their default statuses.
 *
 * Rules applied in priority order:
 * 1. Off-days (weekend) → no meals
 * 2. OFFICE_CLOSED or GOVT_HOLIDAY → no meals
 * 3. Working day base → LUNCH (IN), SNACKS (IN)
 * 4. Active Iftar period → add IFTAR (IN)
 * 5. CELEBRATION with extra meals → add those meals with their defaults
 */
export function getAvailableMeals(
  date: string,
  specialDay: SpecialDay | null,
  settings: Settings
): MealAvailability[] {
  const dayOfWeek = new Date(date + "T00:00:00").getDay();

  if (settings.offDays.includes(dayOfWeek)) {
    return [];
  }

  if (
    specialDay !== null &&
    (specialDay.type === "OFFICE_CLOSED" || specialDay.type === "GOVT_HOLIDAY")
  ) {
    return [];
  }

  const meals: MealAvailability[] = [
    { mealType: "LUNCH", defaultStatus: "IN" },
    { mealType: "SNACKS", defaultStatus: "IN" },
  ];

  const inIftarPeriod = settings.iftarPeriods.some(
    (period) => date >= period.startDate && date <= period.endDate
  );
  if (inIftarPeriod) {
    meals.push({ mealType: "IFTAR", defaultStatus: "IN" });
  }

  if (specialDay !== null && specialDay.type === "CELEBRATION") {
    for (const mealType of specialDay.meals) {
      meals.push({ mealType, defaultStatus: MEAL_DEFAULTS[mealType] });
    }
  }

  return meals;
}
