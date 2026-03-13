/**
 * Command router.
 *
 * Maps incoming command names to handler functions and enforces role-based
 * access before dispatch. Every handler can assume the caller's role has
 * already been verified — no handler needs to re-check permissions.
 *
 * Role enforcement uses requireRole() from packages/core, which is pure and
 * has no side effects.
 */

import { requireRole } from "@mhp/core";
import type { User, Role } from "@mhp/core";
import { ephemeralReply } from "./index.js";
import { handleMeal } from "./commands/meal.js";
import { handleLocation } from "./commands/location.js";
import { handleHeadcount } from "./commands/headcount.js";
import { handleTeam } from "./commands/team.js";
import { handleSummary } from "./commands/summary.js";

// Role map: which roles are allowed to invoke each top-level command.
const COMMAND_ROLES: Record<string, Role[]> = {
  meal:      ["EMPLOYEE", "TEAM_LEAD", "ADMIN", "LOGISTICS"],
  location:  ["EMPLOYEE", "TEAM_LEAD", "ADMIN", "LOGISTICS"],
  headcount: ["ADMIN", "LOGISTICS"],
  summary:   ["ADMIN", "LOGISTICS"],
  team:      ["TEAM_LEAD", "ADMIN"],
};

type Handler = (
  interaction: Record<string, unknown>,
  user: User
) => Promise<Record<string, unknown>>;

const HANDLERS: Record<string, Handler> = {
  meal:      handleMeal,
  location:  handleLocation,
  headcount: handleHeadcount,
  summary:   handleSummary,
  team:      handleTeam,
};

export async function route(
  interaction: Record<string, unknown>,
  user: User
): Promise<Record<string, unknown>> {
  const data = interaction.data as Record<string, unknown> | undefined;
  const commandName = data?.name as string | undefined;

  if (!commandName) {
    return ephemeralReply("Unknown command.");
  }

  const allowedRoles = COMMAND_ROLES[commandName];
  if (!allowedRoles) {
    return ephemeralReply("Unknown command.");
  }

  if (!requireRole(user, ...allowedRoles)) {
    return ephemeralReply("You don't have permission to use this command.");
  }

  const handler = HANDLERS[commandName];
  return handler(interaction, user);
}
