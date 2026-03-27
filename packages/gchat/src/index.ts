/**
 * GChat Bot Lambda entry point.
 *
 * Request lifecycle (JWT verification is handled by the Lambda Authorizer):
 *   1. Parse GChat event body
 *   2. Extract gchatUserId from event sender
 *   3. Resolve gchatUserId → User (Scan) → error text if not found
 *   4. Parse subcommand and args from argumentText
 *   5. Build CommandContext and dispatch via shared route()
 *   6. Format CommandResult → GChat text response
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { CommandContext } from "@mhp/core";
import { route } from "@mhp/bot/router";
import { resolveGChatUser } from "./resolve.js";
import { log, makeEntry } from "./logger.js";

function textResponse(text: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  };
}

/**
 * Parses subcommand and args from GChat argumentText.
 * GChat sends everything after the slash command name as raw text.
 *
 * /meal status [date]         → parts: ["status", "<date>?"]
 * /meal set <MEAL> <IN|OUT> [date] → parts: ["set", "LUNCH", "IN", "<date>?"]
 */
function parseMealArgs(
  parts: string[]
): Record<string, string | number | boolean | undefined> {
  const subcommand = parts[0];
  if (subcommand === "status") {
    return { date: parts[1] }; // optional
  }
  if (subcommand === "set") {
    return {
      meal: parts[1]?.toUpperCase(),   // e.g. "LUNCH"
      status: parts[2]?.toUpperCase(), // e.g. "IN"
      date: parts[3],                  // optional
    };
  }
  return {};
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
  // 3. Extract command name and argumentText
  // ------------------------------------------------------------------
  const message = gchatEvent.message as Record<string, unknown> | undefined;
  const slashCommand = message?.slashCommand as Record<string, unknown> | undefined;
  const commandName = ((slashCommand?.commandName as string | undefined) ?? "").replace(/^\//, "");
  const argumentText = ((message?.argumentText as string | undefined) ?? "").trim();
  const parts = argumentText.split(/\s+/).filter(Boolean);
  const subcommand = parts[0] ?? null;

  // ------------------------------------------------------------------
  // 4. Resolve GChat user → internal User
  // ------------------------------------------------------------------
  const user = await resolveGChatUser(gchatUserId);

  if (!user) {
    log(makeEntry(gchatUserId, "unregistered", null, commandName, subcommand, "not_registered", startedAt));
    return textResponse("You are not registered in this system. Contact an admin.");
  }

  // ------------------------------------------------------------------
  // 5. Parse command args from argumentText
  // ------------------------------------------------------------------
  let args: Record<string, string | number | boolean | undefined> = {};

  if (commandName === "meal") {
    args = parseMealArgs(parts);

    // Validate required args for /meal set before routing
    if (subcommand === "set" && (!args["meal"] || !args["status"])) {
      return textResponse(
        "Usage: /meal set <meal> <IN|OUT> [date]\nMeal options: LUNCH, SNACKS, IFTAR, EVENT_DINNER, OPTIONAL_DINNER"
      );
    }
  }

  // ------------------------------------------------------------------
  // 6. Build CommandContext and dispatch
  // ------------------------------------------------------------------
  const ctx: CommandContext = {
    user,
    platform: "gchat",
    commandName,
    subcommand,
    args,
  };

  const result = await route(ctx);
  log(makeEntry(gchatUserId, user.userId, user.teamId, commandName, subcommand, "success", startedAt));
  return textResponse(result.content);
}
