/**
 * /meal command stub.
 * Implemented in Issue 6.
 */

import type { User } from "@mhp/core";
import { ephemeralReply } from "../index.js";

export async function handleMeal(
  _interaction: Record<string, unknown>,
  _user: User
): Promise<Record<string, unknown>> {
  return ephemeralReply("Meal commands are not yet implemented.");
}
