import { CUTOFF_HOUR, TIMEZONE } from "./constants.js";

/**
 * Determines whether the cutoff has passed for a given target date.
 * Pure function — no database reads. Uses CUTOFF_HOUR constant.
 *
 * Rules:
 * - Cutoff is at CUTOFF_HOUR on the DAY BEFORE the target date, in Asia/Dhaka timezone.
 * - e.g. for target date 2026-03-12, cutoff is 2026-03-11 at 21:00 Asia/Dhaka.
 *
 * Callers decide whether to enforce: EMPLOYEE/LOGISTICS enforce, TEAM_LEAD/ADMIN bypass.
 */
export function isCutoffPassed(targetDate: string): boolean {
  const now = new Date();

  // Get today's date string in Asia/Dhaka timezone
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: TIMEZONE });

  // Cutoff applies to the day before targetDate.
  // Build that date string by decrementing the date.
  const [y, m, d] = targetDate.split("-").map(Number);
  const dayBefore = new Date(y, m - 1, d - 1);
  const dayBeforeStr = dayBefore.toLocaleDateString("en-CA"); // YYYY-MM-DD

  // If the day before target is in the future, cutoff has not passed
  if (dayBeforeStr > todayStr) return false;

  // If the day before target is in the past, cutoff has passed
  if (dayBeforeStr < todayStr) return true;

  // Day before target is today — check if current hour >= CUTOFF_HOUR
  const currentHour = parseInt(
    now.toLocaleString("en-US", { timeZone: TIMEZONE, hour: "numeric", hour12: false }),
    10
  );

  return currentHour >= CUTOFF_HOUR;
}
