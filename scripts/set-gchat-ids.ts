/**
 * set-gchat-ids.ts
 *
 * Patches gchatUserId onto existing User records by matching on name.
 * Run this once after getting GChat user IDs from CloudWatch logs.
 *
 * Usage:
 *   MHP_TABLE=mhp-v2-table npx tsx scripts/set-gchat-ids.ts <path-to-gchat-ids.json>
 *
 * Input format: [{ "name": "Mehedi Hasan", "gchatUserId": "users/xxx" }, ...]
 */

import { readFileSync } from "fs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

interface Entry {
  name: string;
  gchatUserId: string;
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: MHP_TABLE=... npx tsx scripts/set-gchat-ids.ts <path-to-gchat-ids.json>");
  process.exit(1);
}

const table = process.env.MHP_TABLE;
if (!table) {
  console.error("Error: MHP_TABLE is not set.");
  process.exit(1);
}

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const entries: Entry[] = JSON.parse(readFileSync(filePath, "utf-8")) as Entry[];

async function run(): Promise<void> {
  const scan = await docClient.send(
    new ScanCommand({
      TableName: table,
      FilterExpression: "entityType = :t",
      ExpressionAttributeValues: { ":t": "USER" },
    })
  );

  const users = scan.Items ?? [];

  for (const entry of entries) {
    const user = users.find((u) => u["name"] === entry.name);
    if (!user) {
      console.error(`  Not found: "${entry.name}"`);
      continue;
    }
    await docClient.send(
      new UpdateCommand({
        TableName: table,
        Key: { PK: user["PK"], SK: user["SK"] },
        UpdateExpression: "SET gchatUserId = :v, updatedAt = :ts",
        ExpressionAttributeValues: {
          ":v": entry.gchatUserId,
          ":ts": new Date().toISOString(),
        },
      })
    );
    console.log(`  Updated: ${entry.name} → ${entry.gchatUserId}`);
  }

  console.log("\nDone.");
}

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
