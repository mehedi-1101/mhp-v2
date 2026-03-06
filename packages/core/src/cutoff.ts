import { CUTOFF_HOUR, TIMEZONE } from "./constants.js";

/**
 * Determines whether the cutoff has passed for a given target date.
 * Pure function — no database reads. Uses CUTOFF_HOUR constant.
 *
 * Rules:
 * - Future date → false (always open)
 * - Past date   → true  (always closed)
 * - Today       → true if current hour >= CUTOFF_HOUR in Asia/Dhaka timezone
 *
 * Callers decide whether to enforce: EMPLOYEE enforces, TEAM_LEAD/ADMIN bypass.
 */
export function isCutoffPassed(targetDate: string): boolean {
  const now = new Date();

  const todayStr = now.toLocaleDateString("en-CA", { timeZone: TIMEZONE }); // YYYY-MM-DD

  if (targetDate > todayStr) return false;
  if (targetDate < todayStr) return true;

  const currentHour = parseInt(
    now.toLocaleString("en-US", { timeZone: TIMEZONE, hour: "numeric", hour12: false }),
    10
  );

  return currentHour >= CUTOFF_HOUR;
}
