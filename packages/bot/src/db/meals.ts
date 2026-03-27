import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { ParticipationRecord } from "@mhp/core";
import { docClient, getTableName } from "./client.js";

export async function getUserMeals(date: string, userId: string): Promise<ParticipationRecord[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `PART#${date}`, ":prefix": `${userId}#` },
    })
  );
  return (result.Items ?? []) as ParticipationRecord[];
}

export async function putMealRecord(record: ParticipationRecord): Promise<void> {
  await docClient.send(new PutCommand({ TableName: getTableName(), Item: record }));
}
