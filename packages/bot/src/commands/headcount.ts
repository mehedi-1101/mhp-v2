/**
 * /headcount command stub. Implemented in Issue 8.
 */

import type { CommandContext, CommandResult } from "@mhp/core";

export async function handleHeadcount(_ctx: CommandContext): Promise<CommandResult> {
  return { content: "Headcount commands are not yet implemented.", ephemeral: true };
}
