/**
 * Resolves a Discord user ID to an internal MHP User record.
 *
 * Uses GetItem directly on the main table. Since userId = u#<discordId>,
 * the PK is constructable from the discordId — no GSI needed.
 *
 * Returns null if the discordId is not found. The caller is responsible
 * for returning an appropriate ephemeral error to the user.
 */

import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { User } from "@mhp/core";
import { docClient, getTableName } from "./db/client.js";

export async function resolveUser(discordId: string): Promise<User | null> {
  const pk = `USER#u#${discordId}`;
  const result = await docClient.send(
    new GetCommand({
      TableName: getTableName(),
      Key: { PK: pk, SK: pk },
    })
  );

  if (!result.Item) return null;

  return result.Item as User;
}
