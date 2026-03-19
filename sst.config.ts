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

    const api = new sst.aws.ApiGatewayV2("BotApi");
    api.route("POST /interactions", {
      handler: "packages/bot/src/index.handler",
      environment: {
        DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY!,
        MHP_TABLE: mhpTable.name,
      },
      link: [mhpTable],
    });

    return {
      MHP_TABLE: mhpTable.name,
      apiUrl: api.url,
    };
  },
});
