import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { Settings } from "@mhp/core";
import { docClient, getTableName } from "./client.js";

const TTL_MS = 5 * 60 * 1000;

let cached: Settings | null = null;
let cachedAt = 0;

export async function getSettings(): Promise<Settings | null> {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;

  const result = await docClient.send(
    new GetCommand({
      TableName: getTableName(),
      Key: { PK: "SETTINGS#global", SK: "SETTINGS#global" },
    })
  );

  cached = (result.Item as Settings) ?? null;
  cachedAt = Date.now();
  return cached;
}
