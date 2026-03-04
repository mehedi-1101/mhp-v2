/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "mhp",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    // AWS resources (DynamoDB tables, Lambda, API Gateway, SQS) added in subsequent issues.
  },
});
