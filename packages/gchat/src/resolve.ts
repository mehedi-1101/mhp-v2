/**
 * Resolves a Google Chat user ID to an internal MHP User record.
 *
 * Runs a DynamoDB Scan with FilterExpression on gchatUserId and entityType.
 * No GSI for this lookup — write cost of a third GSI is not justified at ~100
 * users, and GChat has no hard response deadline unlike Discord.
 *
 * Returns null if not found. The caller returns an appropriate error to the user.
 */

import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { User } from "@mhp/core";
import { docClient, getTableName } from "./db/client.js";

export async function resolveGChatUser(gchatUserId: string): Promise<User | null> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: getTableName(),
      FilterExpression: "gchatUserId = :gchatUserId AND entityType = :entityType",
      ExpressionAttributeValues: {
        ":gchatUserId": gchatUserId,
        ":entityType": "USER",
      },
    })
  );

  const item = result.Items?.[0];
  if (!item) return null;

  return item as User;
}
