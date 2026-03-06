import type { SpecialDay, Settings } from "./types.js";
import { TIMEZONE } from "./constants.js";

/**
 * Returns true if the string is a valid YYYY-MM-DD calendar date.
 */
export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(date + "T00:00:00");
  return !isNaN(d.getTime()) && d.toISOString().startsWith(date);
}

/**
 * Returns true if the date is within the allowed forward planning window
 * (today through today + maxDays, inclusive), in Asia/Dhaka timezone.
 */
export function isWithinPlanningWindow(date: string, maxDays: number): boolean {
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: TIMEZONE });

  const maxDate = new Date(todayStr + "T00:00:00");
  maxDate.setDate(maxDate.getDate() + maxDays);
  const maxDateStr = maxDate.toISOString().slice(0, 10);

  return date >= todayStr && date <= maxDateStr;
}

/**
 * Returns true if the date is a working day:
 * - Not an off-day (weekend)
 * - Not OFFICE_CLOSED or GOVT_HOLIDAY
 */
export function isWorkingDay(
  date: string,
  settings: Settings,
  specialDay: SpecialDay | null
): boolean {
  const dayOfWeek = new Date(date + "T00:00:00").getDay();
  if (settings.offDays.includes(dayOfWeek)) return false;

  if (
    specialDay !== null &&
    (specialDay.type === "OFFICE_CLOSED" || specialDay.type === "GOVT_HOLIDAY")
  ) {
    return false;
  }

  return true;
}
