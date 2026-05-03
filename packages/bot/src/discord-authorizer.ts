import type {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerResult,
} from "aws-lambda";

// Header-presence only: API GW V2 authorizers don't receive the body, so full Ed25519
// verification stays in the discord-bot handler. API Gateway itself rejects requests
// missing either identity_source header before this function is invoked.
export async function handler(
  event: APIGatewayRequestAuthorizerEventV2
): Promise<APIGatewaySimpleAuthorizerResult> {
  const headers = event.headers ?? {};
  return {
    isAuthorized:
      Boolean(headers["x-signature-ed25519"]) &&
      Boolean(headers["x-signature-timestamp"]),
  };
}
