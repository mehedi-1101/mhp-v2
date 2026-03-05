/**
 * Defines all 6 DynamoDB tables for MHP.
 *
 * Called from sst.config.ts inside run(). Returns all table constructs so
 * sst.config.ts can pass their names as environment variables to Lambda functions.
 *
 * Billing: PAY_PER_REQUEST is SST's default — no override needed.
 *
 * GSI budget: 2 total across all tables.
 * - discordId-index on Users        (every bot command resolves discordId → user)
 * - userId-date-index on Participation  (employee status view)
 */
export function createTables() {
  // ---------------------------------------------------------------------------
  // Users
  // PK: userId (format: u#<discordId>)
  // GSI: discordId-index — resolves Discord user → internal user on every command.
  // Without this GSI every bot command would require a full table scan.
  // ---------------------------------------------------------------------------
  const usersTable = new sst.aws.Dynamo("Users", {
    fields: {
      userId: "string",
      discordId: "string",
    },
    primaryIndex: {
      hashKey: "userId",
    },
    globalIndexes: {
      "discordId-index": {
        hashKey: "discordId",
      },
    },
  });

  // ---------------------------------------------------------------------------
  // Participation
  // PK: date (YYYY-MM-DD)   SK: userId#mealType (e.g. u#123456789#LUNCH)
  // Composite SK enables prefix queries: begins_with("u#123") = one user's meals.
  // GSI: userId-date-index — employee status view (user first, then date).
  // ---------------------------------------------------------------------------
  const participationTable = new sst.aws.Dynamo("Participation", {
    fields: {
      date: "string",
      "userId#mealType": "string",
      userId: "string",
    },
    primaryIndex: {
      hashKey: "date",
      rangeKey: "userId#mealType",
    },
    globalIndexes: {
      "userId-date-index": {
        hashKey: "userId",
        rangeKey: "date",
      },
    },
  });

  // ---------------------------------------------------------------------------
  // WorkLocations
  // PK: date (YYYY-MM-DD)   SK: userId
  // Absence of a record means OFFICE (default).
  // No GSI in this iteration — monthly history deferred to WFH overage report feature.
  // ---------------------------------------------------------------------------
  const workLocationsTable = new sst.aws.Dynamo("WorkLocations", {
    fields: {
      date: "string",
      userId: "string",
    },
    primaryIndex: {
      hashKey: "date",
      rangeKey: "userId",
    },
  });

  // ---------------------------------------------------------------------------
  // SpecialDays
  // PK: yearMonth (YYYY-MM)   SK: date (YYYY-MM-DD)
  // yearMonth as PK enables both single-date lookup AND list-by-month without a GSI.
  // If date were the PK, listing a month's special days would require a full scan.
  // ---------------------------------------------------------------------------
  const specialDaysTable = new sst.aws.Dynamo("SpecialDays", {
    fields: {
      yearMonth: "string",
      date: "string",
    },
    primaryIndex: {
      hashKey: "yearMonth",
      rangeKey: "date",
    },
  });

  // ---------------------------------------------------------------------------
  // Settings
  // PK: settingId — always "global" (single record table).
  // All reads are GetItem PK="global". All writes replace the full record.
  // No SK, no GSI needed.
  // ---------------------------------------------------------------------------
  const settingsTable = new sst.aws.Dynamo("Settings", {
    fields: {
      settingId: "string",
    },
    primaryIndex: {
      hashKey: "settingId",
    },
  });

  // ---------------------------------------------------------------------------
  // SummaryJobs
  // PK: date (YYYY-MM-DD)   SK: jobId (UUID)
  // Jobs are looked up by the date they cover, not by job ID.
  // SK ensures uniqueness when multiple jobs exist for the same date (retries).
  // ---------------------------------------------------------------------------
  const summaryJobsTable = new sst.aws.Dynamo("SummaryJobs", {
    fields: {
      date: "string",
      jobId: "string",
    },
    primaryIndex: {
      hashKey: "date",
      rangeKey: "jobId",
    },
  });

  return {
    usersTable,
    participationTable,
    workLocationsTable,
    specialDaysTable,
    settingsTable,
    summaryJobsTable,
  };
}
