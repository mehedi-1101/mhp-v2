# Meal Headcount Planner — v2

Internal tool for daily meal headcount management. Employees update meal participation and work location via Discord and Google Chat. Admins view headcount and generate daily summaries.

## Stack

- **Bots:** Discord slash commands + Google Chat slash commands, both via AWS Lambda
- **Database:** Amazon DynamoDB (single-table design)
- **Async jobs:** SQS + worker Lambda for daily summary generation
- **Infrastructure:** Terraform on AWS (region: `ap-south-1`)
- **Language:** TypeScript (monorepo — npm workspaces)

## Status

All implementation issues complete and deployed. Architecture review in progress — see `docs/final.md` for the active improvement plan.

---

## Project Structure

```
mhp-v2/
├── packages/
│   ├── core/     Pure TypeScript business logic. No AWS, no Discord, no GChat.
│   ├── bot/      Discord interaction Lambda + summary worker + summary scheduler + shared router.
│   └── gchat/    Google Chat interaction Lambda + JWT authorizer Lambda. Imports router from @mhp/bot.
├── scripts/      Admin scripts: seed-settings.ts, seed-users.ts, register-commands.ts, set-gchat-ids.ts
├── docs/         Design documents (local reference only — not committed)
├── terraform/    Infrastructure as code (active deployment tool)
└── package.json  npm workspaces root
```

## Prerequisites

- Node.js 20+
- npm 11+
- Terraform CLI
- AWS CLI configured with MFA (project enforces `craftsmen-EnforceMFA`)

## Setup

```bash
# 1. Install all dependencies (runs across all workspaces)
npm install

# 2. Build all packages (required before typecheck on a fresh checkout)
npm run build

# 3. Verify everything compiles
npm run typecheck

# 4. Run the linter
npm run lint
```

## Scripts

```bash
npm run build       # Build all packages
npm run typecheck   # TypeScript check across all packages (no output files)
npm run lint        # ESLint across all packages
npm run format      # Prettier format all files
```

## Deployment

```bash
# 1. One-time MFA session (PowerShell only — credentials last ~12 hours)
. .\mfa-auth.ps1

# 2. Deploy with Terraform
cd terraform
terraform plan        # preview changes
terraform apply       # deploy
```

Secrets live in `terraform/terraform.tfvars` (git-ignored). Lambdas are bundled with esbuild as part of `terraform apply` (see `terraform/build.tf`).
