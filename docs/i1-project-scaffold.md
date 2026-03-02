# Issue 1 — Project Scaffold: TypeScript Monorepo + SST Setup

- **Date:** 2026-03-02
- **Issue:** #1
- **Status:** In Review
---

## Context

This is the first design document in the Task 2 series. It covers the foundational project structure that every subsequent issue builds on. There is no business logic in this issue — only the skeleton, tooling, and infrastructure bootstrap.

The full system overview, problem statement, and goals are documented in the [Task 2 Technical Design](../technical-design.md). This document focuses specifically on the decisions made for the project scaffold.

---

## Summary

MHP Task 2 is a clean rebuild in TypeScript. The previous system (Node.js + JSON files + React SPA) is kept as reference only. This issue establishes:

- A monorepo with three packages: `core`, `bot`, `infra`
- TypeScript configuration shared across packages
- ESLint and Prettier for consistent code style
- SST v3 as the infrastructure framework
- A working local development environment via `sst dev`

Nothing is deployed to AWS in this issue. The goal is a skeleton that compiles, lints, and synthesizes infrastructure without errors.

---

## Problem Statement

Starting a multi-package TypeScript project without a proper scaffold leads to:
- Duplicated `tsconfig.json` settings across packages
- Inconsistent linting rules between contributors
- No shared type definitions — each package redefines the same interfaces
- Slow feedback loop — deploying to AWS to test every Lambda change

This issue solves all of these upfront so they never become problems during implementation.

---

## Package Structure

```
mhp-v2/
├── packages/
│   ├── core/       Pure business logic. No AWS, no Discord.
│   ├── bot/        Discord interaction Lambda handler.
│   └── infra/      SST infrastructure definitions.
├── scripts/        Admin scripts (seed users, register commands).
├── docs/           Design documents.
├── package.json    npm workspaces root.
├── tsconfig.json   Root TypeScript config — all packages extend this.
├── .eslintrc.js    Shared ESLint rules.
├── .prettierrc     Shared Prettier config.
└── .env.example    All required environment variables documented.
```

### Why three packages and not one?

Each package has a distinctly different dependency profile:

| Package | Dependencies | Deployed as |
|---|---|---|
| `core` | None (pure TypeScript) | Not deployed — imported by bot and worker |
| `bot` | `@aws-sdk/client-dynamodb`, `discord-interactions` | Lambda function |
| `infra` | `sst`, `aws-cdk-lib` | Infrastructure synthesis only |

If everything were in one package, the Lambda bundle would include SST and CDK libraries (tens of MB). Separating them keeps the Lambda bundle small and each package independently testable.

### Why npm workspaces over Turborepo?

Turborepo adds build caching and parallel task execution — valuable at large scale. For three packages with a small team, it introduces configuration complexity that outweighs the benefit. npm workspaces gives us cross-package imports with zero extra tooling. We can migrate to Turborepo later with minimal effort if build times become a concern.

---

## TypeScript Configuration

Root `tsconfig.json` sets the baseline:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist"
  }
}
```

Each package has its own `tsconfig.json` that extends the root:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

**Why `strict: true`?**
Strict mode catches null/undefined errors, implicit any types, and other issues that cause runtime bugs in JavaScript. On a clean rebuild this has zero migration cost. Not enabling it from the start means fixing hundreds of errors later.

**Why `NodeNext` module resolution?**
SST's bundler (esbuild) and Jest both handle this correctly. It ensures import paths are explicit and compatible with both the Lambda runtime and local test execution without extra configuration.

---

## SST v3

SST (Serverless Stack) is the infrastructure framework. It is built on AWS CDK but provides:

- TypeScript-first constructs for Lambda, API Gateway, DynamoDB, SQS
- `sst dev` — local development mode that proxies Lambda invocations to your machine. Write code, save, the Lambda updates instantly without redeploying to AWS.
- Automatic IAM permission wiring between resources
- Stage support (`dev`, `prod`) — same config, different environments

**Why SST over raw CDK?**
Raw CDK requires writing CloudFormation-equivalent boilerplate for every resource connection. SST's `Function`, `Table`, and `Api` constructs handle the common patterns (Lambda + DynamoDB permissions, environment variable injection, API Gateway routing) in a few lines. At our scale and team experience level, SST's abstraction is the right trade-off.

**`sst.config.ts` initial state (this issue):**
```typescript
export default $config({
  app(input) {
    return {
      name: "mhp",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    // Resources added in subsequent issues
  },
});
```

No AWS resources are defined in this issue. The config is valid and synthesizable. Resources are added in Issue 2 (DynamoDB tables) and Issue 4 (API Gateway + Lambda).

---

## Environment Variables

All required environment variables are documented in `.env.example`. Nothing has a default value that could silently hide a misconfiguration.

| Variable | Used by | Purpose |
|---|---|---|
| `DISCORD_BOT_TOKEN` | `scripts/register-commands.ts` | Registering slash commands with Discord API |
| `DISCORD_PUBLIC_KEY` | Bot Lambda | Ed25519 signature verification |
| `DISCORD_APPLICATION_ID` | `scripts/register-commands.ts` | Identifies the Discord application |
| `DISCORD_SUMMARY_CHANNEL_ID` | Worker Lambda | Channel to post generated summaries |
| `AWS_REGION` | All AWS operations | Target region for DynamoDB and Lambda |
| `USERS_TABLE` | Bot Lambda | DynamoDB table name (injected by SST) |
| `PARTICIPATION_TABLE` | Bot Lambda | DynamoDB table name (injected by SST) |
| `WORK_LOCATIONS_TABLE` | Bot Lambda | DynamoDB table name (injected by SST) |
| `SPECIAL_DAYS_TABLE` | Bot Lambda | DynamoDB table name (injected by SST) |
| `SETTINGS_TABLE` | Bot Lambda | DynamoDB table name (injected by SST) |
| `SUMMARY_JOBS_TABLE` | Bot + Worker Lambda | DynamoDB table name (injected by SST) |
| `SUMMARY_QUEUE_URL` | Bot Lambda | SQS queue URL (injected by SST) |

Table names and queue URLs are injected automatically by SST at deploy time. They are listed here for documentation and for use in local development scripts.

---

## Definition of Done

- [ ] `npm install` from root installs all workspace dependencies
- [ ] `npm run typecheck` passes with zero errors across all packages
- [ ] `npm run lint` passes with zero errors across all packages
- [ ] `npx sst synth` runs without errors (no AWS credentials needed for synthesis)
- [ ] Each package has its own `package.json` with correct name and workspace reference
- [ ] Root scripts (`build`, `lint`, `test`, `typecheck`) run across all packages
- [ ] `.env.example` documents all variables listed above
- [ ] `README.md` updated with new setup instructions for the rebuilt project

---

## What This Issue Does Not Include

- No DynamoDB tables (Issue 2)
- No Lambda handlers (Issue 4 onwards)
- No business logic (Issue 3)
- No deployment to AWS (only `sst synth` is verified)

The scaffold is intentionally empty of application code. Reviewers should focus on structure, tooling config, and whether the package separation makes sense.
