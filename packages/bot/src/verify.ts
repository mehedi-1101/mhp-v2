/**
 * Ed25519 signature verification for Discord interactions.
 *
 * Discord signs every HTTP request with a private key held by Discord.
 * We verify the signature using our bot's public key (DISCORD_PUBLIC_KEY).
 * Any request that fails verification is rejected with HTTP 401 before
 * reaching any business logic.
 *
 * Signed message = timestamp + raw body (as bytes).
 * Discord docs: https://discord.com/developers/docs/interactions/receiving-and-responding
 *
 * Library: tweetnacl — the library Discord's own documentation recommends.
 * Do not implement Ed25519 verification from scratch.
 */

import nacl from "tweetnacl";

export function verifyDiscordRequest(
  signature: string,
  timestamp: string,
  rawBody: string,
  publicKey: string
): boolean {
  try {
    return nacl.sign.detached.verify(
      Buffer.from(timestamp + rawBody),
      Buffer.from(signature, "hex"),
      Buffer.from(publicKey, "hex")
    );
  } catch {
    // Invalid hex strings or malformed inputs should be treated as failed verification
    return false;
  }
}
