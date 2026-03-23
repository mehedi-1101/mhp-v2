/**
 * Discord Bot Lambda entry point.
 *
 * Request lifecycle (signature verification is handled by the Lambda Authorizer):
 *   1. Parse body
 *   2. Handle Discord PING (type 1) → { type: 1 }
 *   3. Build CommandContext from interaction data
 *   4. Resolve discordId → User → ephemeral error if not found
 *   5. Dispatch to command router (role check + handler)
 *   6. Format CommandResult → Discord JSON response
 *
 * All interactions are logged as structured JSON to CloudWatch.
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { CommandContext, CommandResult } from "@mhp/core";
import { resolveUser } from "./resolve.js";
import { route } from "./router.js";
import { log, makeEntry } from "./logger.js";

const PING = 1;
const APPLICATION_COMMAND = 2;

function toDiscordResponse(result: CommandResult): Record<string, unknown> {
  return {
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      content: result.content,
      ...(result.ephemeral ? { flags: 64 } : {}),
    },
  };
}

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const startedAt = Date.now();

  // ------------------------------------------------------------------
  // 1. Parse body
  // ------------------------------------------------------------------
  let interaction: Record<string, unknown>;
  try {
    interaction = JSON.parse(event.body ?? "") as Record<string, unknown>;
  } catch {
    return { statusCode: 400, body: "Invalid JSON body" };
  }

  const interactionType = interaction.type as number | undefined;

  // ------------------------------------------------------------------
  // 2. Discord PING — must respond with { type: 1 } to activate endpoint
  // ------------------------------------------------------------------
  if (interactionType === PING) {
    log(makeEntry("system", "system", null, "PING", null, "ping", startedAt));
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: 1 }),
    };
  }

  if (interactionType !== APPLICATION_COMMAND) {
    return { statusCode: 400, body: "Unsupported interaction type" };
  }

  // ------------------------------------------------------------------
  // 3. Extract interaction fields
  // ------------------------------------------------------------------
  const member = interaction.member as Record<string, unknown> | undefined;
  const discordUser = member?.user as Record<string, unknown> | undefined;
  const discordId = (discordUser?.id as string | undefined) ?? "";

  const data = interaction.data as Record<string, unknown> | undefined;
  const commandName = (data?.name as string | undefined) ?? "unknown";
  const topOptions = data?.options as Array<Record<string, unknown>> | undefined;
  const subcommand = (topOptions?.[0]?.name as string | undefined) ?? null;
  const subOptions = topOptions?.[0]?.options as Array<Record<string, unknown>> | undefined;

  const args: Record<string, string | number | boolean | undefined> = {};
  for (const opt of subOptions ?? []) {
    args[opt.name as string] = opt.value as string | number | boolean | undefined;
  }

  // ------------------------------------------------------------------
  // 4. Resolve Discord caller to an internal MHP User
  // ------------------------------------------------------------------
  const user = await resolveUser(discordId);

  if (!user) {
    log(makeEntry(discordId, "unregistered", null, commandName, subcommand, "not_registered", startedAt));
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        toDiscordResponse({ content: "You are not registered in this system. Contact an admin.", ephemeral: true })
      ),
    };
  }

  // ------------------------------------------------------------------
  // 5. Build CommandContext and dispatch
  // ------------------------------------------------------------------
  const ctx: CommandContext = {
    user,
    platform: "discord",
    commandName,
    subcommand,
    args,
  };

  const result = await route(ctx);

  log(makeEntry(discordId, user.userId, user.teamId, commandName, subcommand, "success", startedAt));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toDiscordResponse(result)),
  };
}
