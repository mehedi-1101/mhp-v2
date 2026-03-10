/**
 * seed-settings.ts
 *
 * Writes the initial Settings record to DynamoDB with default values.
 * Safe to run multiple times — uses PutItem which overwrites the same key.
 *
 * Usage:
 *   npx tsx scripts/seed-settings.ts
 *
 * Prerequisites:
 *   - AWS credentials configured (aws configure or AWS_PROFILE env var)
 *   - SETTINGS_TABLE env var set (copy .env.example to .env and fill in)
 *   - SST has been deployed at least once so the table exists (npx sst deploy)
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { Settings } from "../packages/core/src/types.js";

const tableName = process.env.SETTINGS_TABLE;
if (!tableName) {
  console.error("Error: SETTINGS_TABLE environment variable is not set.");
  console.error("Copy .env.example to .env and set the SETTINGS_TABLE value.");
  process.exit(1);
}

const region = process.env.AWS_REGION ?? "ap-southeast-1";
const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

const defaultSettings: Settings = {
  settingId: "global",
  offDays: [0, 6],          // 0 = Sunday, 6 = Saturday
  iftarPeriods: [],          // admin configures when Ramadan begins
  companyWfhPeriods: [],     // admin configures when needed
  maxForwardPlanningDays: 14,
  monthlyWfhAllowance: 5,   // soft limit — flagged in WFH overage report (iteration 2)
};

async function seedSettings(): Promise<void> {
  console.log(`Seeding Settings table: ${tableName}`);
  console.log("Record:", JSON.stringify(defaultSettings, null, 2));

  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: defaultSettings,
    })
  );

  console.log("Done. Settings record written (settingId = 'global').");
}

seedSettings().catch((err) => {
  console.error("Failed to seed settings:", err);
  process.exit(1);
});
