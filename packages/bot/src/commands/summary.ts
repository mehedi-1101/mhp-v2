/**
 * /summary command stub. Implemented in Issue 9.
 */

import type { CommandContext, CommandResult } from "@mhp/core";

export async function handleSummary(_ctx: CommandContext): Promise<CommandResult> {
  return { content: "Summary commands are not yet implemented.", ephemeral: true };
}
