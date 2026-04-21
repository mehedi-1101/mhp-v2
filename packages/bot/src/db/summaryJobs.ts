import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { SummaryJob } from "@mhp/core";
import { docClient, getTableName } from "./client.js";

export async function getSummaryJob(date: string, jobId: string): Promise<SummaryJob | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: getTableName(),
      Key: { PK: `JOB#${date}`, SK: jobId },
    })
  );
  return (result.Item as SummaryJob) ?? null;
}

export async function getLatestSummaryJob(date: string): Promise<SummaryJob | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `JOB#${date}` },
      ScanIndexForward: false,
      Limit: 1,
    })
  );
  return result.Items?.[0] ? (result.Items[0] as SummaryJob) : null;
}

export async function putSummaryJob(job: SummaryJob): Promise<void> {
  await docClient.send(new PutCommand({ TableName: getTableName(), Item: job }));
}
