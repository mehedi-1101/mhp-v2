import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { Settings } from "@mhp/core";
import { docClient, getTableName } from "./client.js";

export async function getSettings(): Promise<Settings | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: getTableName(),
      Key: { PK: "SETTINGS#global", SK: "SETTINGS#global" },
    })
  );
  return (result.Item as Settings) ?? null;
}
