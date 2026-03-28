import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { User } from "@mhp/core";
import { docClient, getTableName } from "./client.js";

/**
 * Returns all User records from the MHP table.
 * Uses Scan + FilterExpression on entityType — PK requires an exact value so
 * begins_with is not usable here. At ~100 users, Scan completes in milliseconds.
 */
export async function getAllUsers(): Promise<User[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: getTableName(),
      FilterExpression: "entityType = :type",
      ExpressionAttributeValues: { ":type": "USER" },
    })
  );
  return (result.Items ?? []) as User[];
}
