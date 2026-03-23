# Issue 6 — Meal Commands: /meal status and /meal set

- **Date:** 2026-03-11
- **Issue:** #6
- **Status:** Draft
- **Depends on:** [Issue 5 — User Management](./i5-user-management.md)

---

## Context

Issue 4 built the bot plumbing — Lambda Authorizers, `CommandContext`, command router. Issue 5 added user management. This issue implements the two meal commands that employees use daily: checking their meal status and opting in or out of a meal.

These are the highest-frequency commands in the system — every employee uses them every working day. Correctness and clear error messages matter more here than anywhere else.

**Platform scope:** Discord fully implemented. GChat uses the same command handlers via `CommandContext` — the GChat Bot Lambda formats the same `CommandResult` as a GChat text response. GChat response formatting is confirmed working in this issue (not a stub).

---

## Summary

- `/meal status [date]` — shows a user's meal status for a date (all roles)
- `/meal set <meal> <in|out> [date]` — updates a meal opt-in/out record (all roles)

Both commands default to today's date if no date is provided. Date input accepts `today`, `tomorrow`, or `YYYY-MM-DD` format. All date resolution uses Asia/Dhaka timezone.

---

## Commands

### /meal status

**Syntax:** `/meal status [date]`

**Who can use it:** All roles (EMPLOYEE, TEAM_LEAD, ADMIN, LOGISTICS)

**Response:** Ephemeral (visible only to the caller)

**What it does:**
1. Resolve date: use provided date or today in `Asia/Dhaka` timezone
2. Validate date: `isValidDate()` from `packages/core`
3. Fetch `SpecialDay` record for the date (if any)
4. Fetch `Settings` (single record — `settingId = "global"`)
5. Call `getAvailableMeals(date, specialDay, settings)` — if `[]`, respond "No meals on this date."
6. Fetch the user's `ParticipationRecord`s for the date (Query by `date` PK + `userId` prefix on SK)
7. For each available meal: call `resolveStatus(record, meal.defaultStatus)` to get effective status
8. Return formatted ephemeral response showing each meal and its status (IN/OUT)

**Example response:**
```
Your meal status for Monday, 2026-03-16:
  Location — OFFICE (default)
  Lunch    — IN
  Snacks   — IN
  Iftar    — OUT
```

The response includes the user's work location for context — WFH users are excluded from headcount regardless of meal status.

### /meal set

**Syntax:** `/meal set meal:<meal> status:<in|out> [date]`

**Who can use it:** All roles

**Response:** Ephemeral

**What it does:**
1. Resolve and validate date
2. Fetch `SpecialDay` and `Settings`
3. Validate working day: `isWorkingDay(date, settings, specialDay)` — reject if false
4. Validate meal is available: call `getAvailableMeals()` — reject if target meal not in result
5. Check cutoff: `isCutoffPassed(date)` — EMPLOYEE enforces, TEAM_LEAD/ADMIN bypass
6. Write `ParticipationRecord`:
   - PK: `PART#<date>` (e.g. `PART#2026-03-16`)
   - SK: `<userId>#<mealType>` (e.g. `u#123456789#LUNCH`)
   - `entityType: "PART"`, `date`, `userId`, `mealType`, `status`, `updatedBy: caller.userId`, `updatedAt: now`
7. Return ephemeral confirmation: "Lunch set to OUT for 2026-03-16."

**DynamoDB operation:** `PutItem` on Participation table (overwrites any existing record for the same user+date+meal)

---

## Handler Interface

Both Discord and GChat call the same handler in `packages/bot/src/commands/meal.ts`. It receives a `CommandContext` (resolved User, platform, command name, subcommand, parsed args) and returns a `CommandResult` (content string, ephemeral flag). The handler never imports Discord or GChat types — each platform's Bot Lambda formats the result into its own response shape.

## Business Logic (from packages/core)

All business rules are in `packages/core` — the handler fetches data from DynamoDB and passes it to core functions. The handler does not re-implement rules.

| Rule | Core Function | Enforced By |
|---|---|---|
| Date validity | `isValidDate()` | Handler |
| Working day check | `isWorkingDay()` | Handler |
| Meal availability | `getAvailableMeals()` | Handler |
| Cutoff enforcement | `isCutoffPassed()` | Handler (role-conditional) |
| Status with default | `resolveStatus()` | Handler (for /meal status) |

### Cutoff Rule

Cutoff is at **21:00 on the day before the target date** in Asia/Dhaka timezone. For example, to change meals for Tuesday 2026-03-17, the cutoff is Monday 2026-03-16 at 21:00.

This matches the mhp-v1 behavior. The cutoff logic is implemented in `packages/core/src/cutoff.ts` (`isCutoffPassed()`), which is role-agnostic — it returns true or false based on time. The handler decides whether to enforce:

- **EMPLOYEE:** if `isCutoffPassed()` is true → reject with "The cutoff for this date has passed. Contact an admin to make changes."
- **TEAM_LEAD, ADMIN, LOGISTICS:** cutoff check is skipped entirely — all three bypass cutoff

This means TEAM_LEAD can update their own meal after cutoff (useful for last-minute changes). ADMIN can update any employee's meal after cutoff (handled via admin override, not a separate command in this issue).

### Admin Override Scope

In this issue, `/meal set` only updates the caller's own meal. Admin override of another user's meal is not in scope — the command only accepts a meal type and status, not a target user. This is intentional for this issue. Bulk or targeted overrides are a future iteration concern (noted in the design doc as deferred).

---

## Validation Error Messages

Clear error messages are important for a daily-use command:

| Condition | Error Message |
|---|---|
| Invalid date format | "Invalid date. Use YYYY-MM-DD format." |
| Date not a working day | "No meals on `<date>` — it is not a working day." |
| Meal not available on date | "`<meal>` is not available on `<date>`." |
| Cutoff passed (EMPLOYEE) | "The cutoff for `<date>` has passed. Contact an admin to make changes." |
| Date outside planning window | "You can only plan up to `<n>` days in advance." |

---

## Access Patterns Used

| Operation | Table | Method |
|---|---|---|
| Get special day | MHP | GetItem (PK: `SDAY#<yearMonth>`, SK: `<date>`) |
| Get settings | MHP | GetItem (PK: `SETTINGS#global`) |
| Get user's meals for a date | MHP | Query (PK: `PART#<date>`, SK begins_with: `<userId>`) |
| Write meal record | MHP | PutItem |

---

## Definition of Done

- [ ] `/meal status` returns correct status for all available meals on the date
- [ ] `/meal status` returns "no meals" message for off-days and closed days
- [ ] `/meal set` writes a `ParticipationRecord` with correct PK/SK format
- [ ] Cutoff (day-before at 21:00) enforced for EMPLOYEE, bypassed for TEAM_LEAD, ADMIN, and LOGISTICS
- [ ] Working day check rejects mutations on off-days and closed days
- [ ] Meal availability check rejects meals not available on the date
- [ ] `updatedBy` set to caller's `userId` (not discordId)
- [ ] All responses are ephemeral
- [ ] `npm run typecheck` passes across all packages
- [ ] `npm run build` compiles without errors
- [ ] `npm run lint` passes

---

## What This Issue Does Not Include

- Admin override of another user's meal (deferred — no target user option in this issue)
- Bulk opt-out (out of scope for slash commands — web dashboard concern)
- `/meal status` for another user (ADMIN viewing employee status — deferred to Issue 8 headcount view)
- Any location logic (Issue 7)
