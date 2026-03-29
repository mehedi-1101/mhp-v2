# Issue 5 — User Management: Seed Script and User DynamoDB Operations

- **Date:** 2026-03-11
- **Issue:** #5
- **Status:** Draft
- **Depends on:** [Issue 4 — Bot Foundation](./i4-bot-foundation.md)

---

## Context

Issue 4 established the bot Lambda plumbing — Lambda Authorizers, `CommandContext`, command router, and role enforcement. This issue adds the remaining prerequisite: getting users into DynamoDB so the bot can resolve them on every command. It also covers slash command registration with Discord.

Before any employee can use the bot, they must exist as a User record in DynamoDB. There is no self-registration flow — this is an internal tool with controlled access. Admins manage the user list.

---

## Summary

- `scripts/seed-users.ts` — reads a JSON file and writes User records to DynamoDB
- `scripts/register-commands.ts` — registers all slash commands with Discord's API
- `packages/core/src/auth.ts` — `requireRole()` utility (delivered in Issue 4, documented here)
- `packages/bot/src/resolve.ts` — Discord user resolution via GetItem (PK constructed from discordId, Issue 4)
- `packages/gchat/src/resolve.ts` — GChat user resolution via Scan (new in this issue)

---

## User Provisioning: Seed Script

### Why a Script, Not Slash Commands

~100 users, managed by HR. User changes happen a few times per quarter. A seed script is appropriate for this frequency — slash commands for user CRUD would add validation, confirmation flows, and error handling for something used maybe 5 times a month. When the web dashboard is built, user management moves there.

### How It Works

`scripts/seed-users.ts` takes a JSON file path as input. Each entry in the file has `discordId`, `gchatUserId` (optional), `name`, `role`, and `teamId`. The script constructs a User record for each entry with `userId = u#<discordId>` and writes it to DynamoDB using a conditional PutItem — skipping users that already exist. At the end it prints a summary of how many were created versus skipped.

`gchatUserId` is optional at seed time and can be filled in once the GChat bot is configured.

**Why conditional PutItem:** Re-running the script after adding new hires should not overwrite existing users — their status or timestamps could have changed. The condition ensures only new users are written; existing records are left untouched.

A `users-seed.example.json` is committed to the repo showing the expected format. No real user data is committed.

---

## Slash Command Registration

`scripts/register-commands.ts` registers all slash commands (Issues 6–9 definitions) with Discord's API in a single bulk call. Commands must be registered before they appear in the Discord `/` menu — this is not automatic.

All commands are registered at once even though their handlers are stubs. Discord only validates that the endpoint responds, not that commands are fully implemented. Re-run the script when command definitions change (new options, modified descriptions) or on first deploy to a new environment.

---

## Role Enforcement Utility

`packages/core/src/auth.ts` exports `requireRole()` — a pure function that checks whether a user's role is in the allowed list. No I/O, no side effects. It is called by `router.ts` before dispatching to any command handler. Every handler can assume the caller's role is verified.

---

## User Resolution

### Discord

`packages/bot/src/resolve.ts` takes a `discordId`, constructs `PK = USER#u#<discordId>`, and does a `GetItem` on the main table. Since `userId = u#<discordId>`, the PK is directly known — no GSI needed. Returns the User record or `null`. If `null`, the bot returns: "You are not registered in this system. Contact an admin."

### GChat

`packages/gchat/src/resolve.ts` takes a `gchatUserId` and runs a DynamoDB Scan with a filter expression. Returns the User record or `null`.

**Why Scan and not a GSI:** At 100 users, a Scan completes in milliseconds. A `gchatUserId-index` GSI would add a write cost on every user mutation for a read that happens once per GChat interaction. PR #19 feedback already noted the importance of keeping GSI count minimal — a third GSI is not justified here.

---

## Access Patterns

| Operation | Method |
|---|---|
| Resolve Discord user | GetItem: PK = `USER#u#<discordId>`, SK = `USER#u#<discordId>` |
| Resolve GChat user | Scan + `FilterExpression: gchatUserId = :id` |
| Seed user | PutItem with `attribute_not_exists(PK)` condition |
| Get all users (headcount) | Scan + `FilterExpression: entityType = "USER"` |

DynamoDB does not support `begins_with` on a partition key — PK requires an exact match. Scan with a filter is the correct approach for getting all users. At 100 users the table is small enough that this is not a concern.

---

## Definition of Done

- [ ] `scripts/seed-users.ts` reads JSON and writes User records to DynamoDB
- [ ] Seed script is idempotent — re-running skips existing users
- [ ] `scripts/register-commands.ts` registers all commands with Discord API
- [ ] `packages/gchat/src/resolve.ts` resolves `gchatUserId` → `User` via Scan
- [ ] `users-seed.example.json` committed with correct format including `gchatUserId` (no real data)
- [ ] `gchatUserId` stored as `null` when not provided
- [ ] `npm run typecheck` passes across all packages
- [ ] `npm run build` compiles without errors
- [ ] `npm run lint` passes

---

## What This Issue Does Not Include

- `/user add`, `/user remove`, `/user list` slash commands (deferred — web dashboard is a better fit)
- User editing after seed (re-seed or direct DynamoDB update for now)
- Any meal or location logic (Issues 6–7)
