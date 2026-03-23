/**
 * GChat Bot Lambda entry point.
 *
 * Request lifecycle (JWT verification is handled by the Lambda Authorizer):
 *   1. Parse GChat event body
 *   2. Extract gchatUserId from event sender
 *   3. Resolve gchatUserId → User (Scan) → error text if not found
 *   4. Build CommandContext and dispatch
 *   5. Format CommandResult → GChat text response
 *
 * Issue 4: All command handlers return stubs. Real implementations added in Issues 6–8.
 * The router and handler structure mirrors packages/bot — same CommandContext, same stubs.
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { requireRole } from "@mhp/core";
import type { CommandContext, CommandResult, Role } from "@mhp/core";
import { resolveGChatUser } from "./resolve.js";
import { log, makeEntry } from "./logger.js";

// GChat text response format
function textResponse(text: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  };
}

// Role map — mirrors packages/bot/src/router.ts
const COMMAND_ROLES: Record<string, Role[]> = {
  meal:      ["EMPLOYEE", "TEAM_LEAD", "ADMIN", "LOGISTICS"],
  location:  ["EMPLOYEE", "TEAM_LEAD", "ADMIN", "LOGISTICS"],
  headcount: ["ADMIN", "LOGISTICS"],
  summary:   ["ADMIN", "LOGISTICS"],
  team:      ["TEAM_LEAD", "ADMIN"],
};

// Stub responses — replaced with real handlers in Issues 6–8
const STUB_RESPONSES: Record<string, string> = {
  meal:      "Meal commands are not yet implemented.",
  location:  "Location commands are not yet implemented.",
  headcount: "Headcount commands are not yet implemented.",
  summary:   "Summary commands are not yet implemented.",
  team:      "Team summary is not yet implemented.",
};

async function route(ctx: CommandContext): Promise<CommandResult> {
  const allowedRoles = COMMAND_ROLES[ctx.commandName];

  if (!allowedRoles) {
    return { content: "Unknown command.", ephemeral: true };
  }

  if (!requireRole(ctx.user, ...allowedRoles)) {
    return { content: "You don't have permission to use this command.", ephemeral: true };
  }

  return { content: STUB_RESPONSES[ctx.commandName] ?? "Unknown command.", ephemeral: true };
}

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const startedAt = Date.now();

  // ------------------------------------------------------------------
  // 1. Parse GChat event
  // ------------------------------------------------------------------
  let gchatEvent: Record<string, unknown>;
  try {
    gchatEvent = JSON.parse(event.body ?? "") as Record<string, unknown>;
  } catch {
    return { statusCode: 400, body: "Invalid JSON body" };
  }

  // ------------------------------------------------------------------
  // 2. Extract gchatUserId
  // Google Chat sends the sender as { name: "users/<id>" }
  // ------------------------------------------------------------------
  const sender = gchatEvent.user as Record<string, unknown> | undefined;
  const gchatUserId = (sender?.name as string | undefined) ?? "";

  if (!gchatUserId) {
    return textResponse("Unable to identify sender.");
  }

  // ------------------------------------------------------------------
  // 3. Extract command name and subcommand
  // ------------------------------------------------------------------
  const message = gchatEvent.message as Record<string, unknown> | undefined;
  const slashCommand = message?.slashCommand as Record<string, unknown> | undefined;
  const commandName = ((slashCommand?.commandName as string | undefined) ?? "").replace(/^\//, "");
  const argumentText = ((message?.argumentText as string | undefined) ?? "").trim();
  const subcommand = argumentText.split(/\s+/)[0] || null;

  // ------------------------------------------------------------------
  // 4. Resolve GChat user → internal User
  // ------------------------------------------------------------------
  const user = await resolveGChatUser(gchatUserId);

  if (!user) {
    log(makeEntry(gchatUserId, "unregistered", null, commandName, subcommand, "not_registered", startedAt));
    return textResponse("You are not registered in this system. Contact an admin.");
  }

  // ------------------------------------------------------------------
  // 5. Build CommandContext and dispatch
  // ------------------------------------------------------------------
  const ctx: CommandContext = {
    user,
    platform: "gchat",
    commandName,
    subcommand,
    args: {},
  };

  const result = await route(ctx);
  log(makeEntry(gchatUserId, user.userId, user.teamId, commandName, subcommand, "success", startedAt));
  return textResponse(result.content);
}
