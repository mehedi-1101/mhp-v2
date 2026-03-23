/**
 * /team command stub. Implemented in Issue 8.
 */

import type { CommandContext, CommandResult } from "@mhp/core";

export async function handleTeam(_ctx: CommandContext): Promise<CommandResult> {
  return { content: "Team summary is not yet implemented.", ephemeral: true };
}
