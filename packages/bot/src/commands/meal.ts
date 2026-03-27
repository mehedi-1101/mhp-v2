/**
 * /meal command — status and set subcommands.
 */

import type { CommandContext, CommandResult, MealType, ParticipationRecord } from "@mhp/core";
import {
  isValidDate,
  isWorkingDay,
  isWithinPlanningWindow,
  getAvailableMeals,
  isCutoffPassed,
  resolveStatus,
  TIMEZONE,
} from "@mhp/core";
import { getSettings } from "../db/settings.js";
import { getSpecialDay } from "../db/specialDays.js";
import { getUserMeals, putMealRecord } from "../db/meals.js";
import { getUserLocation } from "../db/locations.js";

const MEAL_DISPLAY: Record<MealType, string> = {
  LUNCH: "Lunch",
  SNACKS: "Snacks",
  IFTAR: "Iftar",
  EVENT_DINNER: "Event Dinner",
  OPTIONAL_DINNER: "Optional Dinner",
};

/**
 * Resolves a date string from command args.
 * "today" | "tomorrow" | "YYYY-MM-DD" | undefined → "YYYY-MM-DD"
 */
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

export async function handleMeal(ctx: CommandContext): Promise<CommandResult> {
  const { subcommand, args } = ctx;

  const rawDate = args["date"] as string | undefined;
  const date = resolveDate(rawDate);

  if (!isValidDate(date)) {
    return { content: "Invalid date. Use YYYY-MM-DD format.", ephemeral: true };
  }

  if (subcommand === "status") {
    return handleStatus(ctx, date);
  }

  if (subcommand === "set") {
    return handleSet(ctx, date);
  }

  return { content: "Unknown subcommand.", ephemeral: true };
}

async function handleStatus(ctx: CommandContext, date: string): Promise<CommandResult> {
  const { user } = ctx;

  const [specialDay, settings, meals, locationRecord] = await Promise.all([
    getSpecialDay(date),
    getSettings(),
    getUserMeals(date, user.userId),
    getUserLocation(date, user.userId),
  ]);

  if (!settings) {
    return { content: "Settings not found. Contact an admin.", ephemeral: true };
  }

  const available = getAvailableMeals(date, specialDay, settings);

  if (available.length === 0) {
    return { content: `No meals on ${date}.`, ephemeral: true };
  }

  // Resolve location display
  let locationDisplay: string;
  if (locationRecord) {
    locationDisplay = locationRecord.location;
  } else {
    const inCompanyWfh = settings.companyWfhPeriods.some(
      (p) => date >= p.startDate && date <= p.endDate
    );
    locationDisplay = inCompanyWfh ? "WFH (company policy)" : "OFFICE (default)";
  }

  const mealsMap = new Map(meals.map((r) => [r.mealType, r]));

  const lines = [`Your meal status for ${formatDate(date)}:`];
  lines.push(`  Location — ${locationDisplay}`);

  for (const { mealType, defaultStatus } of available) {
    const record = mealsMap.get(mealType);
    const status = resolveStatus(record, defaultStatus);
    lines.push(`  ${MEAL_DISPLAY[mealType]} — ${status}`);
  }

  return { content: lines.join("\n"), ephemeral: true };
}

async function handleSet(ctx: CommandContext, date: string): Promise<CommandResult> {
  const { user, args } = ctx;

  const mealArg = args["meal"] as string;
  const statusArg = args["status"] as string;

  const [settings, specialDay] = await Promise.all([
    getSettings(),
    getSpecialDay(date),
  ]);

  if (!settings) {
    return { content: "Settings not found. Contact an admin.", ephemeral: true };
  }

  if (!isWithinPlanningWindow(date, settings.maxForwardPlanningDays)) {
    return {
      content: `You can only plan up to ${settings.maxForwardPlanningDays} days in advance.`,
      ephemeral: true,
    };
  }

  if (!isWorkingDay(date, settings, specialDay)) {
    return {
      content: `No meals on ${date} — it is not a working day.`,
      ephemeral: true,
    };
  }

  const available = getAvailableMeals(date, specialDay, settings);
  const mealType = mealArg as MealType;

  if (!available.some((m) => m.mealType === mealType)) {
    return {
      content: `${MEAL_DISPLAY[mealType]} is not available on ${date}.`,
      ephemeral: true,
    };
  }

  if (user.role === "EMPLOYEE" && isCutoffPassed(date)) {
    return {
      content: `The cutoff for ${date} has passed. Contact an admin to make changes.`,
      ephemeral: true,
    };
  }

  const mealStatus = statusArg as "IN" | "OUT";
  const now = new Date().toISOString();

  const record: ParticipationRecord = {
    PK: `PART#${date}`,
    SK: `${user.userId}#${mealType}`,
    entityType: "PART",
    date,
    userId: user.userId,
    mealType,
    status: mealStatus,
    updatedBy: user.userId,
    updatedAt: now,
  };

  await putMealRecord(record);

  return {
    content: `${MEAL_DISPLAY[mealType]} set to ${mealStatus} for ${date}.`,
    ephemeral: true,
  };
}
