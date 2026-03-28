import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
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

export async function getAllLocationsForDate(date: string): Promise<WorkLocation[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `LOC#${date}` },
    })
  );
  return (result.Items ?? []) as WorkLocation[];
}
