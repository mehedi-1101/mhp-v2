/**
 * /location command stub. Implemented in Issue 7.
 */

import type { CommandContext, CommandResult } from "@mhp/core";

export async function handleLocation(_ctx: CommandContext): Promise<CommandResult> {
  return { content: "Location commands are not yet implemented.", ephemeral: true };
}
