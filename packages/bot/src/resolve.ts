/**
 * Resolves a Discord user ID to an internal MHP User record.
 *
 * Queries the discordId-index GSI on the MHP table. This lookup runs on
 * every bot command — the GSI makes it a single-item query (~1–5ms).
 *
 * Returns null if the discordId is not found. The caller is responsible
 * for returning an appropriate ephemeral error to the user.
 */

import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { User } from "@mhp/core";
import { docClient, getTableName } from "./db/client.js";

export async function resolveUser(discordId: string): Promise<User | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTableName(),
      IndexName: "discordId-index",
      KeyConditionExpression: "discordId = :discordId",
      ExpressionAttributeValues: {
        ":discordId": discordId,
      },
      Limit: 1,
    })
  );

  const item = result.Items?.[0];
  if (!item) return null;

  return item as User;
}
