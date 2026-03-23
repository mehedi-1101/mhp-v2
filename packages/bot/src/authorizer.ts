/**
 * Discord Lambda Authorizer.
 *
 * Runs before the Discord Bot Lambda on every request. Verifies the Ed25519
 * signature Discord attaches to every interaction. Returns { isAuthorized: false }
 * on failure — API Gateway rejects with 403 and the Bot Lambda is never invoked.
 *
 * TTL is set to 0 in sst.config.ts — Discord signatures are unique per request,
 * so caching an authorizer result would break verification on the next request.
 *
 * Payload format 2.0 (HTTP API) includes the raw request body, which is required
 * for Ed25519 verification (signed message = timestamp + raw body).
 */

import type { APIGatewayRequestAuthorizerEventV2 } from "aws-lambda";
import { verifyDiscordRequest } from "./verify.js";

// Payload format 2.0 includes body at runtime, but @types/aws-lambda omits it from the type.
type AuthorizerEvent = APIGatewayRequestAuthorizerEventV2 & { body?: string };

export async function handler(
  event: AuthorizerEvent
): Promise<{ isAuthorized: boolean }> {
  const signature = event.headers?.["x-signature-ed25519"] ?? "";
  const timestamp = event.headers?.["x-signature-timestamp"] ?? "";
  const rawBody = event.body ?? "";
  const publicKey = process.env.DISCORD_PUBLIC_KEY ?? "";

  const isAuthorized = verifyDiscordRequest(signature, timestamp, rawBody, publicKey);
  return { isAuthorized };
}
