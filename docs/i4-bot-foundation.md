# Issue 4 — Bot Foundation: Lambda Authorizers, Command Router, GChat Stub

- **Date:** 2026-03-11
- **Issue:** #4
- **Status:** Draft
- **Depends on:** [Issue 3 — Core Domain Package](./i3-core-domain.md)

---

## Context

Issue 3 implemented the pure business logic layer. This issue wires the complete bot interaction pipeline for both Discord and Google Chat: API Gateway exposes two HTTP endpoints, each protected by a dedicated Lambda Authorizer, each routing to its own Bot Lambda. Both platforms share the same command handlers via the `CommandContext` interface introduced here.

Issues 5–8 add real command logic. This issue ensures the entire request lifecycle — auth, user resolution, role check, dispatch — is correct and consistent across both platforms before any command logic is added.

---

## Summary

- Two API Gateway routes: `POST /discord-interactions` and `POST /gchat-interactions`
- Two Lambda Authorizers: Discord (Ed25519) and GChat (Google JWT)
- Two Bot Lambdas: Discord Bot and GChat Bot
- `CommandContext` and `CommandResult` interfaces added to `packages/core/src/types.ts`
- Discord Bot: PING handler, user resolution via GSI 1, parse to CommandContext, dispatch
- GChat Bot: user resolution via Scan, parse to CommandContext, dispatch (same handlers)
- Command stubs return ephemeral placeholder responses on both platforms
- `scripts/register-commands.ts` registers all 5 slash commands with Discord API

No real command logic is implemented here. Stubs return placeholder responses.

---

## Problem Statement

Discord requires a verified HTTPS endpoint before any slash commands can be registered or tested. Google Chat requires the same. Until both Lambdas are deployed and correctly responding to verification requests, no end-to-end command flow is possible on either platform.

Both platforms also define a strict latency budget: Discord requires a response within 3 seconds, Google Chat within 30 seconds. All synchronous commands must complete within these windows. Commands that cannot (like `/summary generate`) use the async pattern introduced in Issue 9.

---

## Architecture

### Request Flow

```
Discord API
  └─ POST /discord-interactions  (Ed25519 signed)
       └─ API Gateway
            └─ Discord Authorizer Lambda
                 ├─ verify Ed25519 signature → { isAuthorized: false } → 403
                 └─ { isAuthorized: true } → Discord Bot Lambda
                      ├─ handle PING (type 1) → { type: 1 }
                      ├─ resolve discordId → User (discordId-index GSI)
                      ├─ build CommandContext
                      ├─ check role via requireRole()
                      ├─ dispatch to handler stub
                      └─ format Discord JSON response

Google Chat API
  └─ POST /gchat-interactions  (Google JWT signed)
       └─ API Gateway
            └─ GChat Authorizer Lambda
                 ├─ verify Google JWT → { isAuthorized: false } → 403
                 └─ { isAuthorized: true } → GChat Bot Lambda
                      ├─ resolve gchatUserId → User (Scan)
                      ├─ build CommandContext
                      ├─ check role via requireRole()
                      ├─ dispatch to same handler stub
                      └─ format GChat text response
```

Both platforms call the same command handlers (`packages/bot/src/commands/`). Platform-specific parsing and response formatting stays in each Bot Lambda.

### Package Structure

```
packages/bot/src/
├── authorizer.ts       Discord Authorizer Lambda — Ed25519 verify, returns { isAuthorized }
├── index.ts            Discord Bot Lambda — PING, resolve user, build CommandContext, dispatch
├── router.ts           Command name → handler + role enforcement
├── resolve.ts          discordId → User via discordId-index GSI
├── logger.ts           Structured JSON logging
├── db/
│   └── client.ts       DynamoDB DocumentClient singleton
└── commands/
    ├── meal.ts         Stub
    ├── location.ts     Stub
    ├── headcount.ts    Stub
    ├── team.ts         Stub
    └── summary.ts      Stub

packages/gchat/src/
├── authorizer.ts       GChat Authorizer Lambda — Google JWT verify, returns { isAuthorized }
└── index.ts            GChat Bot Lambda — resolve user, build CommandContext, dispatch

packages/core/src/
└── types.ts            Adds CommandContext + CommandResult interfaces (shared by both platforms)

scripts/
└── register-commands.ts  Registers all 5 slash commands with Discord API (bulk overwrite)
```

---

## Key Design Decisions

### Lambda Authorizer per Platform

Each API Gateway route is protected by a dedicated Lambda Authorizer. The authorizer runs before the Bot Lambda — the Bot Lambda never handles an unauthorized request.

**How it works:**
API Gateway invokes the authorizer function first. The authorizer returns `{ isAuthorized: true }` or `{ isAuthorized: false }`. If false, API Gateway returns 403 immediately — the Bot Lambda is never invoked.

**Why a Lambda Authorizer per platform:**
- **Separation of concerns:** Authentication logic (Ed25519, Google JWT) is completely isolated from business logic. Each authorizer does one thing: verify a signature. The Bot Lambda can assume the request is genuine and focus entirely on command handling.
- **Platform independence:** Discord and GChat have completely different auth mechanisms. Keeping them in separate Authorizer Lambdas means adding or replacing a platform only requires changing its authorizer — the command handlers are untouched.
- **Independent deployability:** Each authorizer can be updated, tested, and deployed without touching command logic.
- **TTL = 0:** Discord signatures are unique per request — caching an authorizer result is meaningless. GChat tokens have short expiry. Both authorizers run on every request.

SST v3 uses `api.addAuthorizer({ name, lambda: { function, identitySources, ttl: "0 seconds" } })` for Lambda Authorizers with payload format 2.0 (includes raw body, needed for Ed25519 verification).

### CommandContext — Platform-Agnostic Command Handlers

Command handlers in `packages/bot/src/commands/` do not import any Discord or GChat types. Both Bot Lambdas parse their platform-specific event into a `CommandContext` before calling any handler, then format the `CommandResult` into their platform's response shape.

```typescript
// packages/core/src/types.ts

interface CommandContext {
  user: User;
  platform: "discord" | "gchat";
  commandName: string;
  subcommand: string | null;
  args: Record<string, string | number | boolean | undefined>;
}

interface CommandResult {
  content: string;
  ephemeral: boolean;
}
```

Discord Bot: `parse interaction → CommandContext → handler → format Discord JSON`
GChat Bot: `parse GChat event → CommandContext → same handler → format GChat text`

This means all command logic is written once and shared across both platforms.

### Single Bot Lambda per Platform

All Discord commands route through one Discord Bot Lambda. All GChat commands through one GChat Bot Lambda.

| Approach | Trade-off |
|---|---|
| One Lambda per command | Granular IAM, independent scaling — adds 8+ Lambda functions with no benefit at 100 users |
| One Lambda per platform | One cold start pool per platform, one deploy unit per platform, simple routing table |

Discord's 3-second response limit makes cold starts important. A single Lambda per platform with one warm instance pool is more reliable than multiple per-command Lambdas each with their own cold start.

### GChat Scope in This Issue

The GChat Authorizer and GChat Bot are scaffolded here but command responses are stubs. Real GChat command responses are added in Issues 6–8 alongside Discord. The stub architecture still demonstrates a correct multi-platform design — same handlers, platform-specific formatting.

### userId Format: `u#<discordId>`

Users are identified internally as `u#<discordId>`. The `u#` prefix decouples internal identity from Discord — GChat users, future web dashboard users, or admin accounts can exist without restructuring the key namespace. The trade-off is one GSI lookup per Discord request (`discordId-index`). For GChat, user resolution uses `Scan + FilterExpression: gchatUserId = :id` — no additional GSI needed at 100 users.

### Structured Logging

Every interaction is logged with:
- `timestamp`, `discordId` or `gchatUserId`, `userId`, `teamId`, `commandName`, `subcommand`
- `responseType`: `ping` / `success` / `not_registered` / `permission_denied` / `error`
- `durationMs`

Logs go to CloudWatch via `console.log(JSON.stringify(...))`. No library needed at this scale.

---

## Infrastructure Changes (`sst.config.ts`)

```typescript
const api = new sst.aws.ApiGatewayV2("BotApi");

const discordAuthorizer = api.addAuthorizer({
  name: "DiscordAuthorizer",
  lambda: {
    function: {
      handler: "packages/bot/src/authorizer.handler",
      environment: { DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY! },
    },
    identitySources: ["$request.header.X-Signature-Ed25519"],
    ttl: "0 seconds",
  },
});

const gchatAuthorizer = api.addAuthorizer({
  name: "GChatAuthorizer",
  lambda: {
    function: "packages/gchat/src/authorizer.handler",
    identitySources: ["$request.header.Authorization"],
    ttl: "0 seconds",
  },
});

// Bot Lambdas only need MHP_TABLE — auth is fully handled by authorizers above
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
```

**Note:** `api.route()` with inline handler definition is the correct SST v3 pattern — pre-created `Function` components passed to the constructor's `routes` property are silently dropped.

---

## Role Permission Map

Enforced in `router.ts` before dispatch. Every handler can assume the caller's role is verified.

| Command | Allowed Roles |
|---|---|
| `/meal` | EMPLOYEE, TEAM_LEAD, ADMIN, LOGISTICS |
| `/location` | EMPLOYEE, TEAM_LEAD, ADMIN, LOGISTICS |
| `/headcount` | ADMIN, LOGISTICS |
| `/summary` | ADMIN, LOGISTICS |
| `/team` | TEAM_LEAD, ADMIN |

---

## Command Stubs (This Issue)

Each stub returns an immediate ephemeral response on both platforms:

| Command | Stub Response |
|---|---|
| `/meal` | "Meal commands are not yet implemented." |
| `/location` | "Location commands are not yet implemented." |
| `/headcount` | "Headcount commands are not yet implemented." |
| `/summary` | "Summary commands are not yet implemented." |
| `/team` | "Team summary is not yet implemented." |

Role checks still apply — an unauthorized user receives a permission error even for stubs.

---

## Definition of Done

- [ ] `POST /discord-interactions` deployed with Lambda Authorizer
- [ ] `POST /gchat-interactions` deployed with Lambda Authorizer
- [ ] Discord PING verification passes (Discord verifies on endpoint save)
- [ ] Invalid Discord signature returns 403 (authorizer returns `isAuthorized: false`)
- [ ] Invalid GChat JWT returns 403
- [ ] Unknown Discord user returns ephemeral "not registered" error
- [ ] Unknown GChat user returns text "not registered" error
- [ ] All 5 command stubs return placeholder responses on Discord
- [ ] All 5 command stubs return placeholder responses on GChat
- [ ] Role enforcement rejects unauthorized callers
- [ ] `CommandContext` and `CommandResult` exported from `packages/core`
- [ ] `MHP_TABLE` injected via `process.env` on both Bot Lambdas
- [ ] `DISCORD_PUBLIC_KEY` on Discord Authorizer Lambda only
- [ ] `DISCORD_BOT_TOKEN` not in any Lambda — local scripts only
- [ ] All interactions logged with structured JSON
- [ ] `npm run typecheck` passes across all packages
- [ ] `npm run build` compiles without errors
- [ ] `npm run lint` passes
- [ ] `scripts/register-commands.ts` registers all 5 slash commands

---

## What This Issue Does Not Include

- Real command logic (Issues 5–8)
- SQS queue or Worker Lambda (Issue 9)
- Any DynamoDB writes — stubs are read-only or return immediately
- GChat command registration in Google Cloud Console (manual step — done once after deploy)
- User seed script (Issue 5)
- `packages/bot/src/db/users.ts` (Issue 5)
