# Issue 8 — Headcount and Team Summary Commands

- **Date:** 2026-03-11
- **Issue:** #8
- **Status:** Draft
- **Depends on:** [Issue 7 — Location Commands](./i7-location-commands.md)

---

## Context

Issues 6–7 implemented the daily self-service commands for employees. This issue implements the operational view commands: headcount for ADMIN/LOGISTICS, and team summary for TEAM_LEAD/ADMIN.

These commands are read-only — they compute and display data, never write. All computation goes through `computeHeadcount()` from `packages/core`.

**Platform scope:** Discord fully implemented. GChat uses the same `handleHeadcount(ctx: CommandContext)` and `handleTeamSummary(ctx: CommandContext)` handlers — same computation, GChat-formatted response.

---

## Summary

- `/headcount [date]` — shows full meal headcount for a date (ADMIN, LOGISTICS)
- `/team summary [date]` — shows a team lead's own team's participation summary (TEAM_LEAD, ADMIN)

Both default to today's date. Date input accepts `today`, `tomorrow`, or `YYYY-MM-DD` format (Asia/Dhaka timezone). Both call `computeHeadcount()` from `packages/core` and format the result for Discord.

---

## Commands

### /headcount

**Syntax:** `/headcount [date]`

**Who can use it:** ADMIN, LOGISTICS

**Response:** Not ephemeral — visible to everyone in the channel

**What it does:**
1. Resolve and validate date
2. Fetch all required data for `computeHeadcount()`:
   - `SpecialDay` record for the date (GetItem)
   - `Settings` (GetItem)
   - All `User` records — Scan + `FilterExpression: entityType = "USER"` (~100 users)
   - All `ParticipationRecord`s for the date (Query: PK = `PART#<date>`)
   - All `WorkLocation` records for the date (Query: PK = `LOC#<date>`)
3. Call `getAvailableMeals(date, specialDay, settings)` — if `[]`, respond "No meals on this date."
4. Call `computeHeadcount(date, availableMeals, users, participationRecords, locationRecords, settings)`
5. Format and return the `HeadcountReport` as a Discord message

**Example response:**
```
Headcount for Monday, 2026-03-16

Office: 78  |  WFH: 12  |  Total: 90

Lunch    IN: 71   OUT: 7
Snacks   IN: 65   OUT: 13
Iftar    IN: 68   OUT: 10
```

**Why not ephemeral:**
The headcount is shared with the team — logistics and admins typically post it to a shared channel so everyone can see the day's count. Making it non-ephemeral means the message is visible to all channel members, which is the intended use case.

### /team summary

**Syntax:** `/team summary [date]`

**Who can use it:** TEAM_LEAD, ADMIN

**Response:** Ephemeral

**What it does:**
1. Resolve and validate date
2. Fetch the same data as `/headcount` (same DynamoDB operations)
3. Call `computeHeadcount()` — the `byTeam` field in `HeadcountReport` contains per-team stats
4. For TEAM_LEAD: filter `byTeam` to only their own team (`caller.teamId`)
5. For ADMIN: show all teams
6. Return formatted ephemeral response showing team-level breakdown

**Example response (TEAM_LEAD):**
```
Team Alpha — 2026-03-16

Office: 8  |  WFH: 2

Lunch    IN: 7    OUT: 1
Snacks   IN: 6    OUT: 2
```

**Why ephemeral:**
Team-level participation data is internal to each team lead. Making it non-ephemeral would expose one team's participation to other team leads. ADMIN sees all teams but still ephemerally — this is operational data, not meant for public channel display.

**Why ADMIN can see all teams:**
An admin may need to check any team's status. The `byTeam` data is already computed by `computeHeadcount()` — filtering it to one team is the only difference between the TEAM_LEAD and ADMIN views.

---

## Data Fetching Strategy

Both commands fetch the same set of data. The DynamoDB operations:

| Data | Operation |
|---|---|
| SpecialDay | GetItem: PK = `SDAY#<yearMonth>`, SK = `<date>` |
| Settings | GetItem: PK = `SETTINGS#global` |
| All users | Scan + `FilterExpression: entityType = "USER"` |
| All participation for date | Query: PK = `PART#<date>` |
| All locations for date | Query: PK = `LOC#<date>` |

All operations on the single `MHP` table.

**Why Scan for users:**
DynamoDB does not support `begins_with` on a partition key — PK requires an exact value. All `USER` items carry `entityType = "USER"`, so Scan + FilterExpression is the correct approach. At ~100 users the table is small — Scan completes in milliseconds. INACTIVE users are further filtered inside `computeHeadcount()` — they have `status: INACTIVE` and are excluded from all counts.

**Why not pre-compute and cache headcount:**
Headcount is computed fresh on every `/headcount` call. This guarantees the result always reflects current DynamoDB state — no staleness, no cache invalidation complexity. At ~100 users with a handful of DynamoDB reads, fresh computation completes in well under 1 second.

---

## computeHeadcount() Integration

The handler's only responsibility is fetching data and formatting the response. All business logic lives in `packages/core`. The handler passes raw DynamoDB records to `computeHeadcount()` and receives back a `HeadcountReport` — it applies no business rules itself.

`HeadcountReport` contains: date, total/office/WFH user counts, per-meal IN/OUT counts for office users, and a per-team breakdown. `/headcount` displays the office/WFH totals and per-meal counts. `/team summary` displays the per-team slice filtered to the caller's team (or all teams for ADMIN).

---

## Definition of Done

- [ ] `/headcount` calls `computeHeadcount()` with correct inputs and formats `HeadcountReport`
- [ ] `/headcount` returns a non-ephemeral message
- [ ] `/headcount` returns "No meals on this date." for off-days and closed days
- [ ] `/team summary` returns ephemeral team breakdown filtered to the caller's team (TEAM_LEAD)
- [ ] `/team summary` returns all teams for ADMIN
- [ ] Both commands validate date and return clear errors for invalid input
- [ ] Role enforcement: ADMIN and LOGISTICS for `/headcount`; TEAM_LEAD and ADMIN for `/team summary`
- [ ] WFH users excluded from all meal counts (verified via `computeHeadcount()`)
- [ ] `npm run typecheck` passes across all packages
- [ ] `npm run build` compiles without errors
- [ ] `npm run lint` passes

---

## What This Issue Does Not Include

- `/summary generate` and `/summary status` (Issue 9 — async pattern with SQS and worker Lambda)
- Posting headcount to a channel automatically on a schedule (future iteration — not a slash command)
- Per-employee participation list in `/headcount` (too verbose for Discord — web dashboard concern)
- Historical headcount comparison across dates (future iteration)
- WFH overage report (requires WorkLocations GSI — deferred)
