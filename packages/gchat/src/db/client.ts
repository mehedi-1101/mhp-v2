/**
 * DynamoDB DocumentClient singleton for GChat Lambda.
 * Same setup as packages/bot/src/db/client.ts.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const region = process.env.AWS_REGION ?? "ap-southeast-1";

const ddbClient = new DynamoDBClient({ region });

export const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export function getTableName(): string {
  const table = process.env.MHP_TABLE;
  if (!table) {
    throw new Error("MHP_TABLE environment variable is not set");
  }
  return table;
}
