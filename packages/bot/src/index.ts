/**
 * Discord Bot Lambda entry point.
 *
 * Request lifecycle:
 *   1. Verify Ed25519 signature (Discord requires this on every request)
 *   2. Parse body
 *   3. Handle Discord PING (type 1) → { type: 1 }
 *   4. Build CommandContext from interaction data
 *   5. Resolve discordId → User → ephemeral error if not found
 *   6. Dispatch to command router (role check + handler)
 *   7. Format CommandResult → Discord JSON response
 *
 * Signature verification is done here (not in a Lambda Authorizer) because
 * API Gateway V2 Lambda Authorizers do not receive the request body. Ed25519
 * verification requires the raw body, so it must happen in the main handler.
 *
 * All interactions are logged as structured JSON to CloudWatch.
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { CommandContext, CommandResult } from "@mhp/core";
import { resolveUser } from "./resolve.js";
import { route } from "./router.js";
import { log, makeEntry } from "./logger.js";
import { verifyDiscordRequest } from "./verify.js";

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
  event: APIGatewayProxyEventV2 | Record<string, unknown>
): Promise<APIGatewayProxyResultV2> {
  // EventBridge warm-up ping — keeps Lambda warm to avoid cold-start timeouts
  if ((event as Record<string, unknown>).source === "aws.events") {
    return { statusCode: 200, body: "warm" };
  }

  const apiEvent = event as APIGatewayProxyEventV2;
  const startedAt = Date.now();

  // ------------------------------------------------------------------
  // 1. Verify Ed25519 signature
  // ------------------------------------------------------------------
  const signature = apiEvent.headers?.["x-signature-ed25519"] ?? "";
  const timestamp = apiEvent.headers?.["x-signature-timestamp"] ?? "";
  const rawBody = apiEvent.body ?? "";
  const publicKey = process.env.DISCORD_PUBLIC_KEY ?? "";

  if (!verifyDiscordRequest(signature, timestamp, rawBody, publicKey)) {
    return { statusCode: 401, body: "Invalid request signature" };
  }

  // ------------------------------------------------------------------
  // 2. Parse body
  // ------------------------------------------------------------------
  let interaction: Record<string, unknown>;
  try {
    interaction = JSON.parse(apiEvent.body ?? "") as Record<string, unknown>;
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
  const firstOpt = topOptions?.[0];

  // Discord SUB_COMMAND has type 1. Top-level options (STRING, INTEGER, etc.) have other types.
  // When the first option is a subcommand, args live inside its nested options.
  // When there is no subcommand, args are the top-level options directly.
  let subcommand: string | null = null;
  const args: Record<string, string | number | boolean | undefined> = {};

  if (firstOpt?.type === 1) {
    subcommand = (firstOpt.name as string | undefined) ?? null;
    for (const opt of (firstOpt.options as Array<Record<string, unknown>>) ?? []) {
      args[opt.name as string] = opt.value as string | number | boolean | undefined;
    }
  } else {
    for (const opt of topOptions ?? []) {
      args[opt.name as string] = opt.value as string | number | boolean | undefined;
    }
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
