# Issue 7 — Location Commands: /location status and /location set

- **Date:** 2026-03-11
- **Issue:** #7
- **Status:** Draft
- **Depends on:** [Issue 6 — Meal Commands](./i6-meal-commands.md)

---

## Context

Issue 6 implemented meal commands. This issue implements the two location commands that let employees declare whether they are working from the office or from home on a given date.

Location data feeds directly into headcount calculations. A user declared as WFH is fully excluded from all meal counts — their participation records are irrelevant. Getting location right is therefore a prerequisite for accurate headcount output.

**Platform scope:** Discord fully implemented. GChat uses the same `handleLocation(ctx: CommandContext)` handler — same logic, GChat-formatted response.

---

## Summary

- `/location status [date]` — shows a user's work location for a date (all roles)
- `/location set <office|wfh> [date]` — sets a user's work location for a date (all roles)

Both commands default to today's date if no date is provided. Date input accepts `today`, `tomorrow`, or `YYYY-MM-DD` format. All date resolution uses Asia/Dhaka timezone.

---

## Commands

### /location status

**Syntax:** `/location status [date]`

**Who can use it:** All roles

**Response:** Ephemeral

**What it does:**
1. Resolve date: use provided date or today in `Asia/Dhaka` timezone
2. Validate date: `isValidDate()` from `packages/core`
3. Fetch `Settings` (for `companyWfhPeriods` and `offDays`)
4. Fetch `WorkLocation` record for `(date, userId)` — `GetItem`
5. Resolve effective location using the same priority as `computeHeadcount`:
   - Explicit `WorkLocation` record → use it
   - Active `companyWfhPeriod` in Settings → WFH
   - Default → OFFICE
6. Return ephemeral response showing resolved location and its source

**Example responses:**
```
Your location for Monday, 2026-03-16: OFFICE (default)
Your location for Monday, 2026-03-16: WFH (you set this)
Your location for Monday, 2026-03-16: WFH (company WFH period: Ramadan 2026)
```

Showing the source (why they are WFH/OFFICE) prevents confusion when a company WFH period is active.

### /location set

**Syntax:** `/location set location:<office|wfh> [date]`

**Who can use it:** All roles

**Response:** Ephemeral

**What it does:**
1. Resolve and validate date
2. Validate working day: `isWorkingDay(date, settings, specialDay)` — reject if false
3. Check cutoff: `isCutoffPassed(date)` — EMPLOYEE enforces, TEAM_LEAD/ADMIN bypass
4. Validate planning window: `isWithinPlanningWindow(date, settings.maxForwardPlanningDays)`
5. Write `WorkLocation` record:
   - PK: `LOC#<date>` (e.g. `LOC#2026-03-16`)
   - SK: `<userId>` (e.g. `u#123456789`)
   - `entityType: "LOC"`, `date`, `userId`, `location`, `updatedBy: caller.userId`, `updatedAt: now`
6. Return ephemeral confirmation: "Location set to WFH for 2026-03-16."

**DynamoDB operation:** `PutItem` on `MHP` table (overwrites any existing WorkLocation record for the same date + userId)

**Important:** Setting location to OFFICE does not delete the record — it writes an explicit OFFICE record. This is intentional: the record's presence is distinct from the default. The headcount formula resolves priority correctly in either case.

---

## Location Resolution Logic

The resolution priority used in `/location status` must match the priority used in `computeHeadcount()` exactly. Both use:

1. Explicit `WorkLocation` record for the date → use `record.location`
2. Active `companyWfhPeriod` in Settings → `WFH`
3. Default → `OFFICE`

**Why this must be consistent:**
If `/location status` shows OFFICE but `computeHeadcount()` resolves to WFH (or vice versa), employees would have no way to know their location affects headcount incorrectly. The display and the calculation must agree.

The resolution logic is a private function (`resolveLocation`) inside `packages/core/src/participation.ts`, used by `computeHeadcount()`. The location command handler must replicate the same priority logic for its status display. Both use the same three-step priority: explicit record → company WFH period → default OFFICE.

---

## Cutoff and Planning Window

Cutoff is at **21:00 on the day before the target date** in Asia/Dhaka timezone (same rule as `/meal set`).

Both cutoff and planning window apply the same way as in `/meal set`:

| Role | Cutoff | Planning Window |
|---|---|---|
| EMPLOYEE | Enforced | Enforced |
| TEAM_LEAD | Bypassed | Enforced |
| ADMIN | Bypassed | Enforced |
| LOGISTICS | Bypassed | Enforced |

The planning window applies to all roles — no one can set location beyond `maxForwardPlanningDays` days in advance.

---

## Why Location Changes Affect Historical Headcount

Setting WFH for a past date (allowed for ADMIN, bypassing cutoff) retroactively changes how that date's headcount would be computed. This is intentional — the source of truth is always the DynamoDB records, not a pre-computed value. The `/summary generate` command (Issue 9) computes headcount fresh from current records.

This means an admin can correct a location entry after the fact, and the next `/summary generate` for that date will reflect the correction.

---

## Validation Error Messages

| Condition | Error Message |
|---|---|
| Invalid date format | "Invalid date. Use YYYY-MM-DD format." |
| Date not a working day | "`<date>` is not a working day." |
| Cutoff passed (EMPLOYEE) | "The cutoff for `<date>` has passed. Contact an admin to make changes." |
| Date outside planning window | "You can only set location up to `<n>` days in advance." |

---

## Access Patterns Used

| Operation | Table | Method |
|---|---|---|
| Get settings | MHP | GetItem (PK: `SETTINGS#global`) |
| Get special day | MHP | GetItem (PK: `SDAY#<yearMonth>`, SK: `<date>`) |
| Get user's location for a date | MHP | GetItem (PK: `LOC#<date>`, SK: `<userId>`) |
| Write location record | MHP | PutItem |

---

## Definition of Done

- [ ] `/location status` shows resolved location with correct source (explicit / company WFH period / default)
- [ ] `/location set` writes a `WorkLocation` record with correct PK/SK
- [ ] Location resolution priority matches `computeHeadcount()`: explicit record → company WFH period → OFFICE
- [ ] Cutoff (day-before at 21:00) enforced for EMPLOYEE, bypassed for TEAM_LEAD/ADMIN/LOGISTICS
- [ ] Planning window enforced for all roles
- [ ] Working day check rejects mutations on off-days and closed days
- [ ] `updatedBy` set to caller's `userId`
- [ ] All responses are ephemeral
- [ ] `npm run typecheck` passes across all packages
- [ ] `npm run build` compiles without errors
- [ ] `npm run lint` passes

---

## What This Issue Does Not Include

- Admin override of another user's location (same pattern as meal — deferred)
- WFH overage reporting (deferred to future iteration — the GSI data is available, the command is not in scope)
- Company WFH period management (admin configures this via Settings — deferred to a settings command, not in this iteration)
- Viewing location history per user per month via bot (deferred — data is queryable via GSI 2, but no bot command in this iteration)
