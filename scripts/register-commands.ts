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
// ---------------------------------------------------------------------------

const commands = [
  {
    name: "meal",
    description: "View or update your meal participation",
    type: 1, // CHAT_INPUT
    options: [
      {
        name: "status",
        description: "View your meal status for a date",
        type: 1, // SUB_COMMAND
        options: [
          {
            name: "date",
            description: "Date to check: today, tomorrow, or YYYY-MM-DD (default: today)",
            type: 3, // STRING
            required: false,
          },
        ],
      },
      {
        name: "set",
        description: "Update your meal participation",
        type: 1, // SUB_COMMAND
        options: [
          {
            name: "meal",
            description: "Which meal to update",
            type: 3, // STRING
            required: true,
            choices: [
              { name: "Lunch", value: "LUNCH" },
              { name: "Snacks", value: "SNACKS" },
              { name: "Iftar", value: "IFTAR" },
              { name: "Event Dinner", value: "EVENT_DINNER" },
              { name: "Optional Dinner", value: "OPTIONAL_DINNER" },
            ],
          },
          {
            name: "status",
            description: "IN or OUT",
            type: 3, // STRING
            required: true,
            choices: [
              { name: "IN", value: "IN" },
              { name: "OUT", value: "OUT" },
            ],
          },
          {
            name: "date",
            description: "Date to update: today, tomorrow, or YYYY-MM-DD (default: today)",
            type: 3, // STRING
            required: false,
          },
        ],
      },
    ],
  },
  {
    name: "location",
    description: "View or update your work location (office/WFH)",
    type: 1,
    options: [
      {
        name: "status",
        description: "View your work location for a date",
        type: 1, // SUB_COMMAND
        options: [
          {
            name: "date",
            description: "Date to check: today, tomorrow, or YYYY-MM-DD (default: today)",
            type: 3, // STRING
            required: false,
          },
        ],
      },
      {
        name: "set",
        description: "Set your work location",
        type: 1, // SUB_COMMAND
        options: [
          {
            name: "location",
            description: "Office or WFH",
            type: 3, // STRING
            required: true,
            choices: [
              { name: "Office", value: "OFFICE" },
              { name: "WFH", value: "WFH" },
            ],
          },
          {
            name: "date",
            description: "Date to set: today, tomorrow, or YYYY-MM-DD (default: today)",
            type: 3, // STRING
            required: false,
          },
        ],
      },
    ],
  },
  {
    name: "headcount",
    description: "View meal headcount for a date (Admin/Logistics)",
    type: 1,
    options: [
      {
        name: "date",
        description: "Date to check: today, tomorrow, or YYYY-MM-DD (default: today)",
        type: 3, // STRING
        required: false,
      },
    ],
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
    options: [
      {
        name: "summary",
        description: "Show team participation breakdown for a date",
        type: 1, // SUB_COMMAND
        options: [
          {
            name: "date",
            description: "Date to check: today, tomorrow, or YYYY-MM-DD (default: today)",
            type: 3, // STRING
            required: false,
          },
        ],
      },
    ],
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
