/**
 * seed-users.ts
 *
 * Reads a JSON file and writes User records to DynamoDB.
 * Skips users that already exist (conditional PutItem on PK).
 * Idempotent — safe to re-run when adding new hires.
 *
 * Usage:
 *   npx tsx scripts/seed-users.ts <path-to-users.json>
 *
 * Prerequisites:
 *   - MHP_TABLE set in environment
 *   - AWS credentials set in environment
 *
 * Input format: see scripts/users-seed.example.json
 */

import { readFileSync } from "fs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { Role, UserStatus } from "@mhp/core";

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

interface SeedEntry {
  discordId: string;
  gchatUserId?: string | null;
  name: string;
  role: Role;
  teamId?: string | null;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npx tsx scripts/seed-users.ts <path-to-users.json>");
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

// ---------------------------------------------------------------------------
// Load and validate input
// ---------------------------------------------------------------------------

let entries: SeedEntry[];
try {
  const raw = readFileSync(filePath, "utf-8");
  entries = JSON.parse(raw) as SeedEntry[];
} catch (err) {
  console.error(`Failed to read ${filePath}:`, err);
  process.exit(1);
}

if (!Array.isArray(entries) || entries.length === 0) {
  console.error("Input file must be a non-empty JSON array.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seedUsers(): Promise<void> {
  const now = new Date().toISOString();
  let created = 0;
  let skipped = 0;

  for (const entry of entries) {
    const userId = `u#${entry.discordId}`;
    const pk = `USER#${userId}`;

    const item = {
      PK: pk,
      SK: pk,
      entityType: "USER" as const,
      userId,
      discordId: entry.discordId,
      gchatUserId: entry.gchatUserId ?? null,
      name: entry.name,
      role: entry.role,
      teamId: entry.teamId ?? null,
      status: "ACTIVE" as UserStatus,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: table,
          Item: item,
          ConditionExpression: "attribute_not_exists(PK)",
        })
      );
      console.log(`  Created: ${entry.name} (${entry.discordId})`);
      created++;
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "name" in err &&
        (err as { name: string }).name === "ConditionalCheckFailedException"
      ) {
        console.log(`  Skipped: ${entry.name} (${entry.discordId}) — already exists`);
        skipped++;
      } else {
        throw err;
      }
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
}

seedUsers().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
