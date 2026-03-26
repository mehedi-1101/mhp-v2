/**
 * Defines the single MHP DynamoDB table.
 *
 * Called from sst.config.ts inside run(). Returns the table construct so
 * sst.config.ts can pass its name as the MHP_TABLE environment variable
 * to Lambda functions.
 *
 * Single-table design: all entity types (User, Team, Participation,
 * WorkLocation, SpecialDay, Settings, SummaryJob) share one table.
 * Entity types are distinguished by key prefixes and the entityType attribute.
 *
 * Billing: PAY_PER_REQUEST is SST's default — no override needed.
 *
 * GSI: 1 total.
 * - userId-date-index (Participation + WorkLocation items) — meal history + WFH monthly history.
 *   Discord User lookup uses GetItem (PK constructed from discordId) — no GSI needed.
 */
export function createTable() {
  // ---------------------------------------------------------------------------
  // MHP — single table for all entity types
  //
  // Key namespace:
  //   User          PK: USER#<userId>       SK: USER#<userId>
  //   Team          PK: TEAM#<teamId>       SK: TEAM#<teamId>
  //   Participation PK: PART#<date>         SK: <userId>#<mealType>
  //   WorkLocation  PK: LOC#<date>          SK: <userId>
  //   SpecialDay    PK: SDAY#<yearMonth>    SK: <date>
  //   Settings      PK: SETTINGS#global     SK: SETTINGS#global
  //   SummaryJob    PK: JOB#<date>          SK: <jobId>
  //
  // Only attributes used in keys or GSIs are declared here.
  // All other attributes are schema-free (standard DynamoDB behaviour).
  // ---------------------------------------------------------------------------
  const mhpTable = new sst.aws.Dynamo("MHP", {
    fields: {
      PK:     "string",  // partition key
      SK:     "string",  // sort key
      userId: "string",  // GSI PK — Participation + WorkLocation items
      date:   "string",  // GSI SK — Participation + WorkLocation items
    },
    primaryIndex: {
      hashKey:  "PK",
      rangeKey: "SK",
    },
    globalIndexes: {
      // Shared by Participation and WorkLocation items.
      // Both carry userId and date as plain attributes and project into this index.
      // entityType ("PART" or "LOC") distinguishes them in application code.
      // Covers: user meal history (PART) + WFH monthly history (LOC).
      "userId-date-index": {
        hashKey:  "userId",
        rangeKey: "date",
      },
    },
  });

  return { mhpTable };
}
