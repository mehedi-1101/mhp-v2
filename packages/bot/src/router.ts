/**
 * Command router.
 *
 * Maps incoming command names to handler functions and enforces role-based
 * access before dispatch. Every handler can assume the caller's role has
 * already been verified — no handler needs to re-check permissions.
 */

import { requireRole } from "@mhp/core";
import type { CommandContext, CommandResult, Role } from "@mhp/core";
import { handleMeal } from "./commands/meal.js";
import { handleLocation } from "./commands/location.js";
import { handleHeadcount } from "./commands/headcount.js";
import { handleTeam } from "./commands/team.js";
import { handleSummary } from "./commands/summary.js";

const COMMAND_ROLES: Record<string, Role[]> = {
  meal:      ["EMPLOYEE", "TEAM_LEAD", "ADMIN", "LOGISTICS"],
  location:  ["EMPLOYEE", "TEAM_LEAD", "ADMIN", "LOGISTICS"],
  headcount: ["ADMIN", "LOGISTICS"],
  summary:   ["ADMIN", "LOGISTICS"],
  team:      ["TEAM_LEAD", "ADMIN"],
};

type Handler = (ctx: CommandContext) => Promise<CommandResult>;

const HANDLERS: Record<string, Handler> = {
  meal:      handleMeal,
  location:  handleLocation,
  headcount: handleHeadcount,
  summary:   handleSummary,
  team:      handleTeam,
};

export async function route(ctx: CommandContext): Promise<CommandResult> {
  const allowedRoles = COMMAND_ROLES[ctx.commandName];

  if (!allowedRoles) {
    return { content: "Unknown command.", ephemeral: true };
  }

  if (!requireRole(ctx.user, ...allowedRoles)) {
    return { content: "You don't have permission to use this command.", ephemeral: true };
  }

  const handler = HANDLERS[ctx.commandName];
  return handler(ctx);
}
