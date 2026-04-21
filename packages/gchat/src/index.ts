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

// Google Workspace Add-ons Chat apps require this nested structure.
// { "text": "..." } is the legacy standalone bot format and is ignored.
function textResponse(text: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hostAppDataAction: {
        chatDataAction: {
          createMessageAction: {
            message: { text },
          },
        },
      },
    }),
  };
}

/**
 * Parses subcommand and args from GChat argumentText.
 * GChat sends everything after the slash command name as raw text.
 *
 * /meal status [date]              → parts: ["status", "<date>?"]
 * /meal set <MEAL> <IN|OUT> [date] → parts: ["set", "LUNCH", "IN", "<date>?"]
 * /location status [date]          → parts: ["status", "<date>?"]
 * /location set <OFFICE|WFH> [date] → parts: ["set", "OFFICE", "<date>?"]
 */
function parseMealArgs(
  parts: string[]
): Record<string, string | number | boolean | undefined> {
  const subcommand = parts[0];
  if (subcommand === "status") {
    return { date: parts[1] };
  }
  if (subcommand === "set") {
    return {
      meal: parts[1]?.toUpperCase(),
      status: parts[2]?.toUpperCase(),
      date: parts[3],
    };
  }
  return {};
}

function parseLocationArgs(
  parts: string[]
): Record<string, string | number | boolean | undefined> {
  const subcommand = parts[0];
  if (subcommand === "status") {
    return { date: parts[1] };
  }
  if (subcommand === "set") {
    return {
      location: parts[1]?.toUpperCase(), // e.g. "OFFICE" or "WFH"
      date: parts[2],
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
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf-8")
      : (event.body ?? "");
    gchatEvent = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { statusCode: 400, body: "Invalid JSON body" };
  }

  // ------------------------------------------------------------------
  // 2. Extract gchatUserId
  // Newer GChat API wraps all Chat-specific fields under the "chat" key.
  // User ID is at chat.user.name (e.g. "users/12345").
  // ------------------------------------------------------------------
  const chat = gchatEvent.chat as Record<string, unknown> | undefined;
  const sender = chat?.user as Record<string, unknown> | undefined;
  const gchatUserId = (sender?.name as string | undefined) ?? "";

  if (!gchatUserId) {
    return textResponse("Unable to identify sender.");
  }

  // ------------------------------------------------------------------
  // 3. Extract command name and argumentText
  // Slash command data is in chat.appCommandPayload.message — not chat.message.
  // commandName is parsed from message.text ("/meal status" → "meal").
  // ------------------------------------------------------------------
  const appCommandPayload = (chat as Record<string, unknown>)?.["appCommandPayload"] as Record<string, unknown> | undefined;
  const message = appCommandPayload?.["message"] as Record<string, unknown> | undefined;
  const messageText = ((message?.["text"] as string | undefined) ?? "").trim();
  const commandName = messageText.split(/\s+/)[0]?.replace(/^\//, "") ?? "";
  const argumentText = ((message?.["argumentText"] as string | undefined) ?? "").trim();
  const parts = argumentText.split(/\s+/).filter(Boolean);
  let subcommand: string | null = parts[0] ?? null;

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

    if (subcommand === "set" && (!args["meal"] || !args["status"])) {
      return textResponse(
        "Usage: /meal set <meal> <IN|OUT> [date]\nMeal options: LUNCH, SNACKS, IFTAR, EVENT_DINNER, OPTIONAL_DINNER"
      );
    }
  } else if (commandName === "location") {
    args = parseLocationArgs(parts);

    if (subcommand === "set" && !args["location"]) {
      return textResponse("Usage: /location set <OFFICE|WFH> [date]");
    }
  } else if (commandName === "headcount") {
    // No subcommand — argumentText is just the optional date
    subcommand = null;
    args = { date: parts[0] };
  } else if (commandName === "team") {
    // subcommand is "summary", date follows it
    args = { date: parts[1] };
  } else if (commandName === "summary") {
    // subcommand is "generate" or "status", date follows it
    args = { date: parts[1] };
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
