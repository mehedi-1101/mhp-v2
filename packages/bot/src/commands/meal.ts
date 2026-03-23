/**
 * /meal command stub. Implemented in Issue 6.
 */

import type { CommandContext, CommandResult } from "@mhp/core";

export async function handleMeal(_ctx: CommandContext): Promise<CommandResult> {
  return { content: "Meal commands are not yet implemented.", ephemeral: true };
}
