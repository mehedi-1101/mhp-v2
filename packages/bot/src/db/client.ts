/**
 * DynamoDB DocumentClient singleton.
 *
 * Created once per Lambda container and reused across warm invocations.
 * The table name is read from MHP_TABLE env var, which SST injects at
 * deploy time and sst dev injects during local development.
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
