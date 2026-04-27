/**
 * seed-settings.ts
 *
 * Writes the initial Settings record to the MHP single table.
 * Idempotent — uses a condition expression so it only writes if the record
 * does not already exist. Re-running is safe.
 *
 * Usage:
 *   npx tsx scripts/seed-settings.ts
 *
 * Prerequisites:
 *   - AWS credentials configured (run `. .\mfa-auth.ps1` for MFA session)
 *   - MHP_TABLE env var set to the deployed DynamoDB table name
 *   - Terraform has been applied at least once so the table exists (`cd terraform && terraform apply`)
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { Settings } from "../packages/core/src/types.js";

const tableName = process.env.MHP_TABLE;
if (!tableName) {
  console.error("Error: MHP_TABLE environment variable is not set.");
  console.error("Set MHP_TABLE to the deployed DynamoDB table name (see `terraform output dynamodb_table_name`).");
  process.exit(1);
}

const region = process.env.AWS_REGION ?? "ap-south-1";
const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

const defaultSettings: Settings = {
  PK: "SETTINGS#global",
  SK: "SETTINGS#global",
  entityType: "SETTINGS",
  settingId: "global",
  offDays: [0, 6],          // 0 = Sunday, 6 = Saturday
  iftarPeriods: [],          // admin configures when Ramadan begins
  companyWfhPeriods: [],     // admin configures when needed
  maxForwardPlanningDays: 14,
  monthlyWfhAllowance: 5,   // soft limit — flagged in WFH overage report (iteration 2)
};

async function seedSettings(): Promise<void> {
  console.log(`Seeding MHP table: ${tableName}`);
  console.log("Record:", JSON.stringify(defaultSettings, null, 2));

  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: defaultSettings,
        ConditionExpression: "attribute_not_exists(PK)",
      })
    );
    console.log("Done. Settings record created.");
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as { name: string }).name === "ConditionalCheckFailedException"
    ) {
      console.log("Settings record already exists — skipping.");
    } else {
      throw err;
    }
  }
}

seedSettings().catch((err) => {
  console.error("Failed to seed settings:", err);
  process.exit(1);
});
