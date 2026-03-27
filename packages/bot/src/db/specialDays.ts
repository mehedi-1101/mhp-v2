import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { SpecialDay } from "@mhp/core";
import { docClient, getTableName } from "./client.js";

export async function getSpecialDay(date: string): Promise<SpecialDay | null> {
  const yearMonth = date.slice(0, 7); // "YYYY-MM"
  const result = await docClient.send(
    new GetCommand({
      TableName: getTableName(),
      Key: { PK: `SDAY#${yearMonth}`, SK: date },
    })
  );
  return (result.Item as SpecialDay) ?? null;
}
