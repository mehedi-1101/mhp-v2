/**
 * /location command — status and set subcommands.
 */

import type { CommandContext, CommandResult, Location, WorkLocation } from "@mhp/core";
import {
  isValidDate,
  isWorkingDay,
  isWithinPlanningWindow,
  isCutoffPassed,
  TIMEZONE,
} from "@mhp/core";
import { getSettings } from "../db/settings.js";
import { getSpecialDay } from "../db/specialDays.js";
import { getUserLocation, putLocationRecord } from "../db/locations.js";

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

export async function handleLocation(ctx: CommandContext): Promise<CommandResult> {
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

  const [settings, locationRecord] = await Promise.all([
    getSettings(),
    getUserLocation(date, user.userId),
  ]);

  if (!settings) {
    return { content: "Settings not found. Contact an admin.", ephemeral: true };
  }

  let display: string;
  if (locationRecord) {
    display = `${locationRecord.location} (you set this)`;
  } else {
    const activePeriod = settings.companyWfhPeriods.find(
      (p) => date >= p.startDate && date <= p.endDate
    );
    display = activePeriod
      ? `WFH (company WFH period: ${activePeriod.reason})`
      : "OFFICE (default)";
  }

  return {
    content: `Your location for ${formatDate(date)}: ${display}`,
    ephemeral: true,
  };
}

async function handleSet(ctx: CommandContext, date: string): Promise<CommandResult> {
  const { user, args } = ctx;

  const locationArg = args["location"] as string;

  const [settings, specialDay] = await Promise.all([
    getSettings(),
    getSpecialDay(date),
  ]);

  if (!settings) {
    return { content: "Settings not found. Contact an admin.", ephemeral: true };
  }

  if (!isWorkingDay(date, settings, specialDay)) {
    return { content: `${date} is not a working day.`, ephemeral: true };
  }

  if (user.role === "EMPLOYEE" && isCutoffPassed(date)) {
    return {
      content: `The cutoff for ${date} has passed. Contact an admin to make changes.`,
      ephemeral: true,
    };
  }

  if (!isWithinPlanningWindow(date, settings.maxForwardPlanningDays)) {
    return {
      content: `You can only set location up to ${settings.maxForwardPlanningDays} days in advance.`,
      ephemeral: true,
    };
  }

  const location = locationArg as Location;
  const now = new Date().toISOString();

  const record: WorkLocation = {
    PK: `LOC#${date}`,
    SK: user.userId,
    entityType: "LOC",
    date,
    userId: user.userId,
    location,
    updatedBy: user.userId,
    updatedAt: now,
  };

  await putLocationRecord(record);

  return {
    content: `Location set to ${location} for ${date}.`,
    ephemeral: true,
  };
}
