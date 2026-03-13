/**
 * Bot Lambda entry point.
 *
 * Request lifecycle:
 *   1. Verify Ed25519 signature → 401 if invalid
 *   2. Handle Discord PING (type 1) → { type: 1 }
 *   3. Resolve discordId → User → ephemeral error if not found
 *   4. Enforce role via router → ephemeral error if unauthorized
 *   5. Dispatch to command handler stub → ephemeral placeholder response
 *
 * All interactions are logged as structured JSON to CloudWatch.
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { verifyDiscordRequest } from "./verify.js";
import { resolveUser } from "./resolve.js";
import { route } from "./router.js";
import { log, makeEntry } from "./logger.js";

// Discord interaction types
const PING = 1;
const APPLICATION_COMMAND = 2;

/**
 * Helper: builds an ephemeral Discord message response.
 * Ephemeral = only the invoking user sees it (flags: 64).
 */
export function ephemeralReply(content: string): Record<string, unknown> {
  return {
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      content,
      flags: 64, // EPHEMERAL
    },
  };
}

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const startedAt = Date.now();

  // ------------------------------------------------------------------
  // 1. Signature verification — security boundary.
  //    Reject anything that isn't a genuine Discord request.
  // ------------------------------------------------------------------
  const signature = event.headers["x-signature-ed25519"] ?? "";
  const timestamp = event.headers["x-signature-timestamp"] ?? "";
  const rawBody = event.body ?? "";
  const publicKey = process.env.DISCORD_PUBLIC_KEY ?? "";

  if (!verifyDiscordRequest(signature, timestamp, rawBody, publicKey)) {
    return { statusCode: 401, body: "Invalid request signature" };
  }

  // ------------------------------------------------------------------
  // 2. Parse body
  // ------------------------------------------------------------------
  let interaction: Record<string, unknown>;
  try {
    interaction = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { statusCode: 400, body: "Invalid JSON body" };
  }

  const interactionType = interaction.type as number | undefined;

  // ------------------------------------------------------------------
  // 3. Discord PING — must respond with { type: 1 } to activate endpoint
  // ------------------------------------------------------------------
  if (interactionType === PING) {
    log(makeEntry("system", "system", null, "PING", null, "ping", startedAt));
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: 1 }),
    };
  }

  // ------------------------------------------------------------------
  // 4. Only APPLICATION_COMMAND interactions are handled here.
  //    Other types (components, modals) are not used in this iteration.
  // ------------------------------------------------------------------
  if (interactionType !== APPLICATION_COMMAND) {
    return { statusCode: 400, body: "Unsupported interaction type" };
  }

  // ------------------------------------------------------------------
  // 5. Resolve the Discord caller to an internal MHP User
  // ------------------------------------------------------------------
  const member = interaction.member as Record<string, unknown> | undefined;
  const discordUser = member?.user as Record<string, unknown> | undefined;
  const discordId = (discordUser?.id as string | undefined) ?? "";

  const data = interaction.data as Record<string, unknown> | undefined;
  const commandName = (data?.name as string | undefined) ?? "unknown";
  const options = data?.options as Array<Record<string, unknown>> | undefined;
  const subcommand = (options?.[0]?.name as string | undefined) ?? null;

  const user = await resolveUser(discordId);

  if (!user) {
    log(makeEntry(discordId, "unregistered", null, commandName, subcommand, "not_registered", startedAt));
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        ephemeralReply("You are not registered in this system. Contact an admin.")
      ),
    };
  }

  // ------------------------------------------------------------------
  // 6. Dispatch to command router (role check + handler)
  // ------------------------------------------------------------------
  const response = await route(interaction, user);

  log(makeEntry(discordId, user.userId, user.teamId, commandName, subcommand, "success", startedAt));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(response),
  };
}
