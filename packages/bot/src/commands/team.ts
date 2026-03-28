/**
 * /team summary command — shows team participation breakdown.
 * TEAM_LEAD sees their own team with full meal counts.
 * ADMIN sees all teams with office/WFH counts.
 * Response is always ephemeral.
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

export async function handleTeam(ctx: CommandContext): Promise<CommandResult> {
  const { user, subcommand, args } = ctx;

  if (subcommand !== "summary") {
    return { content: "Unknown subcommand.", ephemeral: true };
  }

  const rawDate = args["date"] as string | undefined;
  const date = resolveDate(rawDate);

  if (!isValidDate(date)) {
    return { content: "Invalid date. Use YYYY-MM-DD format.", ephemeral: true };
  }

  if (user.role === "TEAM_LEAD" && !user.teamId) {
    return { content: "You are not assigned to a team.", ephemeral: true };
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

  if (user.role === "TEAM_LEAD") {
    // Show full breakdown for the caller's team
    const teamUsers = allUsers.filter((u) => u.teamId === user.teamId);
    const teamReport = computeHeadcount(
      date,
      availableMeals,
      teamUsers,
      participationRecords,
      locationRecords,
      settings
    );

    const lines: string[] = [
      `Team ${user.teamId} — ${formatDate(date)}`,
      "",
      `Office: ${teamReport.officeCount} | WFH: ${teamReport.wfhCount}`,
    ];

    if (availableMeals.length === 0) {
      lines.push("", "No meals on this date.");
    } else {
      lines.push("");
      for (const meal of teamReport.meals) {
        const out = teamReport.officeCount - meal.count;
        lines.push(`${MEAL_DISPLAY[meal.mealType]} — IN: ${meal.count}, OUT: ${out}`);
      }
    }

    return { content: lines.join("\n"), ephemeral: true };
  }

  // ADMIN — show all teams from the global report's byTeam breakdown
  const globalReport = computeHeadcount(
    date,
    availableMeals,
    allUsers,
    participationRecords,
    locationRecords,
    settings
  );

  if (globalReport.byTeam.length === 0) {
    return { content: `No team data for ${date}.`, ephemeral: true };
  }

  const lines: string[] = [`Team summary for ${formatDate(date)}`, ""];

  for (const team of globalReport.byTeam) {
    lines.push(`${team.teamId} — Office: ${team.officeCount}, WFH: ${team.wfhCount}`);
  }

  return { content: lines.join("\n"), ephemeral: true };
}
