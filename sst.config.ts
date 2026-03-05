/// <reference path="./.sst/platform/config.d.ts" /> // eslint-disable-line @typescript-eslint/triple-slash-reference

export default $config({
  app(input) {
    return {
      name: "mhp",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    const { createTables } = await import("./packages/infra/src/tables.js");

    const {
      usersTable,
      participationTable,
      workLocationsTable,
      specialDaysTable,
      settingsTable,
      summaryJobsTable,
    } = createTables();

    // Table names returned here so they appear in sst outputs.
    // Lambda functions (added in Issue 4) will receive these as environment
    // variables: environment: { USERS_TABLE: usersTable.name, ... }
    return {
      usersTable: usersTable.name,
      participationTable: participationTable.name,
      workLocationsTable: workLocationsTable.name,
      specialDaysTable: specialDaysTable.name,
      settingsTable: settingsTable.name,
      summaryJobsTable: summaryJobsTable.name,
    };
  },
});
