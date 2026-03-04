# Meal Headcount Planner — v2

Internal tool for daily meal headcount management. Employees update meal participation and work location via Discord. Admins view headcount and generate daily summaries.

## Stack

- **Bot:** Discord slash commands via AWS Lambda
- **Database:** Amazon DynamoDB
- **Infrastructure:** SST v3 on AWS
- **Language:** TypeScript (monorepo — npm workspaces)

## Status

Task 2, Iteration 1 — in progress.

---

## Project Structure

```
mhp-v2/
├── packages/
│   ├── core/     Pure TypeScript business logic. No AWS, no Discord.
│   ├── bot/      Discord interaction Lambda handler.
│   └── infra/    SST infrastructure definitions (tables, functions, queues).
├── scripts/      Admin scripts: seed-users.ts, register-commands.ts (added in later issues)
├── docs/         Design documents (local reference only)
├── sst.config.ts SST entrypoint
└── package.json  npm workspaces root
```

## Prerequisites

- Node.js 20+
- npm 10+
- AWS CLI configured (for deployment)
- SST CLI: `npm install -g sst` (for `sst dev` and `sst deploy`)

## Setup

```bash
# 1. Install all dependencies (runs across all workspaces)
npm install

# 2. Copy environment variables template
cp .env.example .env
# Fill in the values — see .env.example for descriptions

# 3. Verify everything compiles
npm run typecheck

# 4. Run the linter
npm run lint
```

## Development

SST's local dev mode proxies Lambda invocations to your machine. You can run the Discord bot without deploying to AWS on every change.

```bash
# Start local dev mode (requires AWS credentials)
npx sst dev
```

## Scripts

```bash
npm run build       # Build all packages
npm run typecheck   # TypeScript check across all packages (no output files)
npm run lint        # ESLint across all packages
npm run test        # Run tests across all packages
npm run format      # Prettier format all files
```

## Environment Variables

See [.env.example](.env.example) for the full list with descriptions.

## Deployment

```bash
# Deploy to production (requires AWS credentials in CI/CD secrets)
npx sst deploy --stage production
```
