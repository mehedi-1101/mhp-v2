/**
 * /headcount command stub.
 * Implemented in Issue 8.
 */

import type { User } from "@mhp/core";
import { ephemeralReply } from "../index.js";

export async function handleHeadcount(
  _interaction: Record<string, unknown>,
  _user: User
): Promise<Record<string, unknown>> {
  return ephemeralReply("Headcount commands are not yet implemented.");
}
