/**
 * /headcount command — shows full meal headcount for a date.
 * Accessible to ADMIN and LOGISTICS. Response is non-ephemeral.
 */

import type { CommandContext, CommandResult, MealType } from "@mhp/core";
import {
  isValidDate,
  getAvailableMeals,
  computeHeadcount,
  TIMEZONE,
} from "@mhp/core";
import { getSettings } from "../db/settings.js";
import { getSpecialDay } from "../db/specialDays.js";
import { getAllUsers } from "../db/users.js";
import { getAllParticipationForDate } from "../db/meals.js";
import { getAllLocationsForDate } from "../db/locations.js";

const MEAL_DISPLAY: Record<MealType, string> = {
  LUNCH: "Lunch",
  SNACKS: "Snacks",
  IFTAR: "Iftar",
  EVENT_DINNER: "Event Dinner",
  OPTIONAL_DINNER: "Optional Dinner",
};

function resolveDate(arg: string | undefined): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
  if (!arg || arg === "today") return today;
  if (arg === "tomorrow") {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  return arg;
}

function formatDate(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  const dayName = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return `${dayName}, ${date}`;
}

export async function handleHeadcount(ctx: CommandContext): Promise<CommandResult> {
  const { args } = ctx;

  const rawDate = args["date"] as string | undefined;
  const date = resolveDate(rawDate);

  if (!isValidDate(date)) {
    return { content: "Invalid date. Use YYYY-MM-DD format.", ephemeral: true };
  }

  const [specialDay, settings, allUsers, participationRecords, locationRecords] =
    await Promise.all([
      getSpecialDay(date),
      getSettings(),
      getAllUsers(),
      getAllParticipationForDate(date),
      getAllLocationsForDate(date),
    ]);

  if (!settings) {
    return { content: "Settings not found. Contact an admin.", ephemeral: true };
  }

  const availableMeals = getAvailableMeals(date, specialDay, settings);

  if (availableMeals.length === 0) {
    return { content: `No meals on ${date}.`, ephemeral: false };
  }

  const report = computeHeadcount(
    date,
    availableMeals,
    allUsers,
    participationRecords,
    locationRecords,
    settings
  );

  const lines: string[] = [
    `Headcount for ${formatDate(date)}`,
    "",
    `Office: ${report.officeCount} | WFH: ${report.wfhCount} | Total: ${report.totalUsers}`,
    "",
  ];

  for (const meal of report.meals) {
    const out = report.officeCount - meal.count;
    lines.push(`${MEAL_DISPLAY[meal.mealType]} — IN: ${meal.count}, OUT: ${out}`);
  }

  return { content: lines.join("\n"), ephemeral: false };
}
