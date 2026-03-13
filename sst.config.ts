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
    const { createTable } = await import("./packages/infra/src/tables.js");

    const { mhpTable } = createTable();

    const botFunction = new sst.aws.Function("BotFunction", {
      handler: "packages/bot/src/index.handler",
      environment: {
        DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY!,
        MHP_TABLE: mhpTable.name,
      },
      link: [mhpTable],
    });

    const api = new sst.aws.ApiGatewayV2("BotApi", {
      routes: {
        "POST /interactions": botFunction,
      },
    });

    return {
      MHP_TABLE: mhpTable.name,
      apiUrl: api.url,
    };
  },
});
