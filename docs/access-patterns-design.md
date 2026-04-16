# DynamoDB Single Table Design -- Access Patterns & Schema

Access patterns for **Task 1 (Iterations 1, 2, and 3)** and **Task 2 (Iteration 1, 2)**.

Task 1 and Task 2 share the same domain entities (Users, Teams, Participation, WorkLocation, SpecialDay, Settings, SummaryJob). Task 2 adds the Discord bot and DynamoDB persistence, but the underlying data model is the same. One schema design covers both tasks.

All entity types live in one table named `MHP`. GSI count: **2**.

## Conventions

- Keys use `TYPE#value` prefixes to prevent collisions and enable `begins_with` queries per entity type.
- Every item has an `entityType` attribute (`"USER"`, `"PART"`, `"LOC"`, etc.) used to filter mixed results from GSIs.
- `userId` format is `u#<discordId>`. This decouples internal identity from Discord so future platforms (web dashboard, HR sync) don't require schema migration. It also means SK values in Participation and WorkLocation can be constructed from the Discord ID without a prior user lookup.

---

### Users

#### Access Patterns

1. Get user by Discord ID (runs on every bot command)
2. Get user by internal userId
3. Get all users (for headcount, ~100 users)

#### DB Schema

```
PK: USER#<userId>       e.g. USER#u#123456789
SK: USER#<userId>       same as PK
```

Pattern 1 uses **GSI 1 (`discordId-index`)**: `PK = discordId`. User items carry a plain `discordId` attribute that projects into this GSI. Without it, every command would need a table scan. This is the most frequent read in the system.

Pattern 2: `GetItem` on table PK.

Pattern 3: `Query PK begins_with "USER#"`. Returns the full list in one page at ~100 users.

---

### Team

#### Access Patterns

1. Get team by teamId
2. Get all teams

#### DB Schema

```
PK: TEAM#<teamId>       e.g. TEAM#mimir
SK: TEAM#<teamId>       same as PK
```

Pattern 1: `GetItem` on table PK.

Pattern 2: `Query PK begins_with "TEAM#"`.

No GSI needed. Team lead is identified by `role: TEAM_LEAD` on the User record, not stored on the Team item. At ~100 users, in-memory filter is sufficient.

---

### Meal Participation

#### Access Patterns

1. Get all participation records for a date (headcount)
2. Get a specific user's meals for a date (meal status view)
3. Get a specific meal record (user + date + mealType)
4. Write or update a meal record
5. Get a user's participation history across dates (reporting)

#### DB Schema

```
PK: PART#<date>                  e.g. PART#2026-03-13
SK: <userId>#<mealType>          e.g. u#123456789#LUNCH
```

Extra plain attributes on each item:
```
date:   "2026-03-13"       (needed as GSI 2 SK, cannot extract from PK prefix)
userId: "u#123456789"      (needed as GSI 2 PK, cannot extract from composite SK)
```

**Why date-first PK:** The dominant operation is "calculate today's headcount." Date-first means one `Query` returns all records for the day. User-first would require N queries or an extra GSI.

**Why composite SK (`<userId>#<mealType>`):** One SK supports three access patterns:
- Pattern 1: `Query PK = PART#<date>` returns all records for the day
- Pattern 2: `Query PK = PART#<date>, SK begins_with <userId>` returns one user's meals
- Pattern 3: `GetItem PK + SK` returns one exact record

Pattern 4: `PutItem`.

Pattern 5 uses **GSI 2 (`userId-date-index`)**: `PK = userId, SK = date`. Example: `Query PK = u#123456789, SK between 2026-03-01 and 2026-03-31`.

---

### Work Location

#### Access Patterns

1. Get all location records for a date (headcount, to exclude WFH users)
2. Get a specific user's location for a date
3. Get a user's location records for a month (WFH monthly usage)

#### DB Schema

```
PK: LOC#<date>           e.g. LOC#2026-03-13
SK: <userId>             e.g. u#123456789
```

Extra plain attributes on each item:
```
date:   "2026-03-13"       (needed as GSI 2 SK)
userId: "u#123456789"      (needed as GSI 2 PK)
```

Pattern 1: `Query PK = LOC#<date>`.

Pattern 2: `GetItem PK + SK`.

Pattern 3 uses **GSI 2**, the same index as Participation. Both entity types carry `userId` and `date` as plain attributes and project into the same GSI. `entityType` (`"LOC"` vs `"PART"`) separates them in application code. This is what keeps the total GSI count at 2.

**Location resolution priority** (applied before headcount calculation):
1. Explicit WorkLocation record for the date
2. Active `companyWfhPeriod` in Settings
3. Default: OFFICE

Absence of a record means OFFICE.

---

### Special Day

#### Access Patterns

1. Get special day for a specific date (holiday check, meal availability)
2. Get all special days in a month (month view)

#### DB Schema

```
PK: SDAY#<yearMonth>    e.g. SDAY#2026-03
SK: <date>              e.g. 2026-03-26
```

Pattern 1: `GetItem PK = SDAY#2026-03, SK = 2026-03-26`.

Pattern 2: `Query PK = SDAY#2026-03`.

No GSI needed. `yearMonth` as PK means both single-date lookup and month listing work without a scan.

---

### Settings

#### Access Patterns

1. Read global configuration
2. Update global configuration

#### DB Schema

```
PK: SETTINGS#global
SK: SETTINGS#global
```

Single record. Pattern 1: `GetItem`. Pattern 2: `PutItem` (full replace). No GSI needed.

Contains: `offDays`, `iftarPeriods`, `companyWfhPeriods`, `maxForwardPlanningDays`, `monthlyWfhAllowance`.

Cutoff time is hardcoded as `CUTOFF_HOUR = 21` in code, not stored here. It changes at most once a year and doesn't justify a DynamoDB read on every mutation.

Infrastructure values (`DISCORD_PUBLIC_KEY`, `MHP_TABLE`, `SUMMARY_QUEUE_URL`) are Lambda env vars, not DynamoDB config.

---

### Summary Job

#### Access Patterns

1. Get latest summary job for a date (status check)
2. Get a specific job by jobId (worker Lambda processing)
3. Create a new job (`/summary generate`)
4. Update job status (PENDING > PROCESSING > READY/FAILED)

#### DB Schema

```
PK: JOB#<date>          e.g. JOB#2026-03-13
SK: <jobId>             e.g. 550e8400-e29b-41d4-a716-446655440000  (UUID)
```

Pattern 1: `Query PK = JOB#<date>`, sort `createdAt` desc.

Pattern 2: `GetItem PK + SK`.

Pattern 3: `PutItem` with new UUID SK.

Pattern 4: `UpdateItem` on status + timestamps.

No GSI needed. Date-first PK because jobs are always queried by the date they cover. UUID SK allows multiple jobs per date (retries).

---

## GSI Summary

| GSI | PK | SK | Projected items | Purpose |
|---|---|---|---|---|
| `discordId-index` | `discordId` | n/a | User only | Resolve Discord caller on every command |
| `userId-date-index` | `userId` | `date` | Participation + WorkLocation | Meal history + WFH monthly history |

Total: **2 GSIs**. GSI 2 is shared between two entity types by projecting the same attributes (`userId`, `date`) and filtering by `entityType` in code.

---

## Complete Key Namespace

| Entity | PK | SK | entityType |
|---|---|---|---|
| User | `USER#<userId>` | `USER#<userId>` | `USER` |
| Team | `TEAM#<teamId>` | `TEAM#<teamId>` | `TEAM` |
| Participation | `PART#<date>` | `<userId>#<mealType>` | `PART` |
| WorkLocation | `LOC#<date>` | `<userId>` | `LOC` |
| SpecialDay | `SDAY#<yearMonth>` | `<date>` | `SDAY` |
| Settings | `SETTINGS#global` | `SETTINGS#global` | `SETTINGS` |
| SummaryJob | `JOB#<date>` | `<jobId>` | `JOB` |








Branch name: docs/dynamodb-access-patterns

Issue name: Design DynamoDB single-table schema and access patterns for MHP

PR title: docs: DynamoDB single-table access pattern design

PR description:


## What does this PR do

Documents the DynamoDB single-table design for MHP covering all access
patterns across Task 1 (Iterations 1-3) and Task 2 (Iterations 1-2).

## What was changed

- `docs/access-patterns-design.md` — new file

## Key decisions

- Single table (`MHP`) for all 7 entity types
- 2 GSIs: `discordId-index` (user lookup on every command) and
  `userId-date-index` (shared between Participation and WorkLocation,
  separated by `entityType` in application code)
- `TYPE#value` key prefixes to prevent collisions and enable prefix queries
- `userId` format `u#<discordId>` to decouple internal identity from Discord

## What this PR does not include

- Implementation code
- Migration scripts
- Infrastructure definitions