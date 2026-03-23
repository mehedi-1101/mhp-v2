/**
 * GChat Lambda Authorizer.
 *
 * Runs before the GChat Bot Lambda on every request. Verifies the Google-signed
 * JWT that Google Chat attaches to every interaction. Returns { isAuthorized: false }
 * on failure — API Gateway rejects with 403 and the Bot Lambda is never invoked.
 *
 * Google Chat signs requests with a service account JWT. The token is verified
 * against Google's public keys using google-auth-library. The audience must match
 * the Cloud project number configured in GOOGLE_CLOUD_PROJECT env var.
 */

import type { APIGatewayRequestAuthorizerEventV2 } from "aws-lambda";
import { OAuth2Client } from "google-auth-library";

// Payload format 2.0 includes body at runtime, but @types/aws-lambda omits it from the type.
type AuthorizerEvent = APIGatewayRequestAuthorizerEventV2 & { body?: string };

const client = new OAuth2Client();

export async function handler(
  event: AuthorizerEvent
): Promise<{ isAuthorized: boolean }> {
  try {
    const authHeader = event.headers?.["authorization"] ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");

    if (!token) return { isAuthorized: false };

    const audience = process.env.GOOGLE_CLOUD_PROJECT ?? "";
    const ticket = await client.verifyIdToken({ idToken: token, audience });
    const payload = ticket.getPayload();

    // Google Chat requests are issued by Google's Chat service account
    const isGoogleChat = payload?.iss === "chat@system.gserviceaccount.com";
    return { isAuthorized: !!payload && isGoogleChat };
  } catch {
    return { isAuthorized: false };
  }
}
