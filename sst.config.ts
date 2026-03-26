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

    // Discord Authorizer — verifies Ed25519 signature before Bot Lambda runs.
    // DISCORD_PUBLIC_KEY is on the authorizer only; the Bot Lambda does not need it.
    const discordAuthorizer = api.addAuthorizer({
      name: "DiscordAuthorizer",
      lambda: {
        function: {
          handler: "packages/bot/src/authorizer.handler",
          environment: {
            DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY!,
          },
        },
        identitySources: ["$request.header.X-Signature-Ed25519"],
        ttl: "0 seconds",
      },
    });

    // GChat Authorizer — verifies Google-signed JWT before GChat Bot Lambda runs.
    // GCHAT_ENDPOINT_URL is the audience used for JWT verification (Method 1 — HTTP endpoint URL).
    // In Google Cloud Console, set "Authentication Audience" to "HTTP endpoint URL".
    const gchatAuthorizer = api.addAuthorizer({
      name: "GChatAuthorizer",
      lambda: {
        function: {
          handler: "packages/gchat/src/authorizer.handler",
          environment: {
            GCHAT_ENDPOINT_URL: process.env.GCHAT_ENDPOINT_URL!,
          },
        },
        identitySources: ["$request.header.Authorization"],
        ttl: "0 seconds",
      },
    });

    api.route("POST /discord-interactions", {
      handler: "packages/bot/src/index.handler",
      auth: { lambda: discordAuthorizer.id },
      environment: { MHP_TABLE: mhpTable.name },
      link: [mhpTable],
    });

    api.route("POST /gchat-interactions", {
      handler: "packages/gchat/src/index.handler",
      auth: { lambda: gchatAuthorizer.id },
      environment: { MHP_TABLE: mhpTable.name },
      link: [mhpTable],
    });

    return {
      MHP_TABLE: mhpTable.name,
      apiUrl: api.url,
    };
  },
});
