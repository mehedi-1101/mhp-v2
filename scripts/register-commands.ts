/**
 * register-commands.ts
 *
 * Registers all MHP slash commands with the Discord API.
 * Run once after first deploy, or whenever command definitions change.
 *
 * Usage:
 *   npx tsx scripts/register-commands.ts
 *
 * Prerequisites:
 *   - DISCORD_BOT_TOKEN set in .env (or environment)
 *   - DISCORD_APPLICATION_ID set in .env (or environment)
 *
 * This script uses Discord's bulk overwrite endpoint — it replaces all
 * registered commands with the definitions below. Safe to re-run.
 */

const DISCORD_API = "https://discord.com/api/v10";

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APPLICATION_ID;

if (!token) {
  console.error("Error: DISCORD_BOT_TOKEN is not set.");
  process.exit(1);
}
if (!appId) {
  console.error("Error: DISCORD_APPLICATION_ID is not set.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Command definitions
//
// These match the 5 stubs in packages/bot/src/commands/.
// Subcommands and options will be expanded in Issues 5–9 as handlers are
// implemented. For now, top-level commands with no options are sufficient
// to verify the end-to-end pipeline works.
// ---------------------------------------------------------------------------

const commands = [
  {
    name: "meal",
    description: "View or update your meal participation",
    type: 1, // CHAT_INPUT
  },
  {
    name: "location",
    description: "View or update your work location (office/WFH)",
    type: 1,
  },
  {
    name: "headcount",
    description: "View meal headcount for a date (Admin/Logistics)",
    type: 1,
  },
  {
    name: "summary",
    description: "Generate or check daily meal summary (Admin/Logistics)",
    type: 1,
  },
  {
    name: "team",
    description: "View team participation summary (Team Lead/Admin)",
    type: 1,
  },
];

// ---------------------------------------------------------------------------
// Register using bulk overwrite — PUT replaces all global commands at once.
// https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
// ---------------------------------------------------------------------------

async function registerCommands(): Promise<void> {
  const url = `${DISCORD_API}/applications/${appId}/commands`;

  console.log(`Registering ${commands.length} commands for application ${appId}...`);

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Discord API error (${response.status}): ${body}`);
    process.exit(1);
  }

  const registered = (await response.json()) as Array<{ name: string; id: string }>;

  console.log("Registered commands:");
  for (const cmd of registered) {
    console.log(`  /${cmd.name} (${cmd.id})`);
  }
  console.log("Done.");
}

registerCommands().catch((err) => {
  console.error("Failed to register commands:", err);
  process.exit(1);
});
