import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { WorkLocation } from "@mhp/core";
import { docClient, getTableName } from "./client.js";

export async function getUserLocation(date: string, userId: string): Promise<WorkLocation | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: getTableName(),
      Key: { PK: `LOC#${date}`, SK: userId },
    })
  );
  return (result.Item as WorkLocation) ?? null;
}

export async function putLocationRecord(record: WorkLocation): Promise<void> {
  await docClient.send(new PutCommand({ TableName: getTableName(), Item: record }));
}
