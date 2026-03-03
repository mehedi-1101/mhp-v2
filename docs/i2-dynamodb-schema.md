# Issue 2 — DynamoDB Schema Design and Infrastructure

- **Date:** 2026-03-03
- **Issue:** #2
- **Status:** In Review
- **Depends on:** [Issue 1 — Project Scaffold](./i1-project-scaffold.md)

---

## Context

Issue 1 established the project skeleton. This issue defines the data layer that everything else reads from and writes to. Getting this right before any application code is written is critical — DynamoDB schema decisions are hard to change after data exists.

The previous system stored all data in flat JSON files (`users.json`, `meals.json`, `workLocations.json`, etc.). This worked locally but cannot support cloud deployment, concurrent writes at scale, or any form of replication. DynamoDB replaces all of these files.

This document focuses specifically on the data model design decisions for Issue 2.

---

## Summary

Six DynamoDB tables are defined and provisioned via SST. A seed script writes the initial Settings record. No application code reads or writes these tables yet — that begins in Issue 3 (core types) and Issue 5 onwards (handlers).

The schema is designed around **access patterns** — the specific queries the application needs to run. This is the correct way to design for DynamoDB. Unlike a relational database, you cannot add arbitrary queries after the fact without adding indexes (which cost money and add write overhead).

---

## Problem Statement

DynamoDB requires upfront decisions that relational databases do not:

1. **What is the Partition Key (PK)?** All data for the same PK lives on the same partition. Choose wrong and queries become expensive scans.
2. **What is the Sort Key (SK)?** Enables range queries within a partition. Choose wrong and you lose query flexibility.
3. **Which Global Secondary Indexes (GSIs) are needed?** Each GSI duplicates data and adds write cost. You need exactly as many as your access patterns require — no more.

These decisions cannot be easily changed after data is written. This design document justifies each choice explicitly so reviewers can catch mistakes before implementation.

---

## Design Approach: Multiple Tables

**Single-table design** puts all entity types in one table, using key prefixes to distinguish them. This is a common DynamoDB best practice recommendation.

**We are not using single-table design.** Here is why:

Single-table design's core benefit is fetching multiple related entity types in one query. In our system, Meals and WorkLocations are **never fetched together in one DynamoDB call** — they are fetched in parallel calls and combined in application code. The benefit does not apply.

The costs of single-table design at our scale:
- Key overloading makes the schema hard to explain and audit
- A mistake in the key design breaks all entity types at once, not just one
- Onboarding a new engineer requires understanding the full key namespace upfront

The reviewer feedback from earlier PRs in this project explicitly asked for clear explanation of what entities exist, how they are stored, and why the keys support the queries. Multiple tables make this explanation straightforward per table.

**At 100 users with ~500 requests/day, there is no performance or cost advantage to single-table design.** The total DynamoDB cost either way is under $2/month.

---

## GSI Budget: 2 Total

Each GSI:
- Adds a write to the GSI on every table write (extra cost, extra latency)
- Requires capacity planning if using provisioned mode
- Increases the complexity of the schema explanation

**We use exactly 2 GSIs across all six tables.** Every access pattern in this iteration is covered by either the table's PK/SK or one of these two GSIs. A third GSI (WorkLocations monthly history) is designed for but explicitly deferred to the WFH overage report iteration.

---

## Data Model Overview

| Entity | Business Purpose | Primary Access Pattern |
|---|---|---|
| **Users** | Employee identity and role mapping | Discord user → internal user (every command) |
| **Participation** | Meal opt-in/out records | All meals for a date (headcount calculation) |
| **WorkLocations** | Office vs WFH tracking | All locations for a date (headcount exclusion) |
| **SpecialDays** | Holidays and celebrations | Check if date is special (availability logic) |
| **Settings** | Global configuration | Single record, read on startup |
| **SummaryJobs** | Async job tracking | Latest job status for a date |

---

## Table Design Decisions

### Users

**Business Purpose:**
Stores internal employee records with Discord identity mapping. Every bot command starts with a Discord user ID that must be resolved to an internal user record before any business logic runs.

**Key Design Decision: Internal Identity Namespace**

The internal user ID is derived from Discord ID but uses a prefix format. This creates an identity namespace that can support multiple authentication sources in the future (web login, HR sync) without restructuring the data model. The prefix also makes it possible to construct a user ID from a Discord ID in code without a database lookup — simplifying key construction in other tables.

**Key Design Decision: Discord ID Lookup Index**

Every single bot command requires resolving a Discord ID to an internal user. Without an index on Discord ID, this would require scanning the entire Users table on every command invocation. The `discordId-index` GSI makes this a single-item lookup and is the most critical index in the system.

**Why this matters:**
- User resolution happens before any business logic
- Without this index, every command would scan 100+ user records
- This GSI pays for itself on the first bot command

**Access patterns supported:**
- Discord user → internal user (every command)
- Get user by internal ID
- Get all users (headcount calculation, cached in Lambda)

---

### Participation

**Business Purpose:**
Stores explicit meal participation records. The absence of a record carries meaning: it means the meal's default status applies (opt-in for most meals, opt-out for optional dinner). This "absence has meaning" approach minimizes database writes — we only store exceptions to defaults.

**Key Design Decision: Date as Primary Dimension**

The table is organized by date because the dominant business operation is "calculate today's headcount" — which requires all participation records for a single date. This date-first organization means headcount queries read from one partition instead of querying 100+ individual user records.

Date-centric queries dominate the system. Date is the partition key.

**Key Design Decision: Composite Sort Key**

Each record identifies both the user and the meal type in a single sort key. This composite structure enables three query patterns with zero additional indexes:
1. All meals for a date (headcount calculation)
2. All meals for one user on a date (employee status view)
3. One specific meal record (before writing updates)

The composite key makes pattern 2 work via prefix matching — a free capability of DynamoDB sort keys.

**Key Design Decision: User-Date Index**

The employee self-service use case is "show me my meal status for today" where we know the user first, then the date. Without this index, we'd fetch all users' records for the date and filter in code. The `userId-date-index` GSI makes this a direct lookup and supports future meal history features.

**Default Opt-In Model:**
When no explicit record exists, the system applies meal-specific defaults. This logic lives in `packages/core` — not in the database layer. The database is neutral; meaning is applied at the business logic level.

**Access patterns supported:**
- All meals on a date (headcount)
- All meals for a user on a date (status view)
- One specific meal record (update operations)
- User's meal history across dates (via GSI)

---

### WorkLocations

**Business Purpose:**
Stores explicit work location records. Absence of a record means OFFICE (default). Employees marked as WFH are excluded from all meal headcounts — this is the primary business rule that makes this table critical.

**Key Design Decision: Date as Primary Dimension**

Same reasoning as Participation: the dominant query is "who is WFH today?" for headcount exclusion. Date-first organization means this is a single partition query.

**Key Design Decision: No GSI in This Iteration**

All queries needed for Iteration 1 use date as the primary filter. A user-date index would support monthly WFH history queries (needed for WFH overage reports), but that feature is deferred. The table schema is designed to accept this GSI later without modification — we simply add the index when the feature is implemented.

**Connection to Business Logic:**
A user with WFH location contributes zero to all meal counts. This is enforced in the headcount computation in `packages/core`, not at the database level. The WorkLocation record itself is neutral — the meaning is applied when computing headcount.

**Location Resolution Priority:**
1. Explicit WorkLocation record for that date
2. Active company WFH period in Settings
3. Default: OFFICE

This priority logic lives in business logic, not in the database.

**Access patterns supported:**
- All locations on a date (headcount exclusion)
- User's location on a date (status view)
- Write/update location

---

### SpecialDays

**Business Purpose:**
Stores special day definitions: office closures, government holidays, and celebration days. These affect meal availability and headcount calculations.

**Key Design Decision: Month-Based Partitioning**

This is the key design insight for this table. Two access patterns are required:
1. "Is this specific date special?" — checked before every headcount or availability calculation
2. "List all special days in a month" — used for admin views and planning

If date were the partition key, pattern 2 would require a full table scan. With year-month as the partition key and date as the sort key, both patterns are efficient single-table queries with zero additional indexes.

**Special Day Effects on Business Logic:**
- Office closures and government holidays → zero meals available, zero headcount
- Celebration days → normal meals plus optional event meals

These effects are applied in business logic when computing meal availability, not stored in the database.

**Access patterns supported:**
- Check if a specific date is special
- List all special days in a month
- Create/update/delete special days

---

### Settings

**Business Purpose:**
Global system configuration. Single record containing off-days, Iftar periods, company WFH periods, and planning window limits.

**Key Design Decision: Single Record, No Complex Keys**

This is the simplest table in the system. One record, one partition key value. All reads fetch the entire record. All writes replace the entire record.

**Note on Cutoff Time:**
The previous system stored cutoff time in settings and read it on every mutation. In Lambda, this would mean a DynamoDB read on every meal or location update just to check a value that changes perhaps once a year.

Cutoff time is hardcoded as a constant in `packages/core`. When it needs to change, it's a one-line code change and a redeploy. This is the correct trade-off for an internal tool at this scale — avoiding hundreds of unnecessary database reads per day.

**Access patterns supported:**
- Read global settings (cached in Lambda memory)
- Update global settings (admin operation)

---

### SummaryJobs

**Business Purpose:**
Tracks async summary generation jobs. Enables status polling between the bot Lambda (which creates the job) and the worker Lambda (which processes it).

**Key Design Decision: Date as Primary Dimension**

Jobs are always looked up by the date they cover, not by job ID. The date is the partition key. The job ID is the sort key to ensure uniqueness when multiple jobs exist for the same date (retries, manual re-triggers).

**Why Async Matters:**
Discord requires a response within 3 seconds. Summary generation requires multiple DynamoDB reads plus computation. The async pattern guarantees we respond to Discord instantly while processing the summary in the background. This table is the coordination mechanism between the two Lambdas.

**Access patterns supported:**
- Latest job for a date (status polling)
- Get specific job by ID
- Create new job
- Update job status

---

## GSI Summary

| GSI | Table | Purpose | Why It's Required |
|---|---|---|---|
| `discordId-index` | Users | Discord user → internal user | Every bot command starts with Discord ID. Without this, every command is a table scan. |
| `userId-date-index` | Participation | User's meals for a date | Employee status view queries by user first. Without this, we fetch all users' records and filter in code. |

**Total: 2 GSIs across all tables.** All other access patterns are served by partition key and sort key alone.

---

## Billing Mode

All tables use **PAY_PER_REQUEST** (on-demand billing).

**Why not provisioned capacity?**
Provisioned capacity requires predicting read/write capacity units per second. Our usage is highly variable: near zero overnight, moderate during work hours, spiky near the 9 PM cutoff. On-demand billing charges per actual request and scales automatically. At our volume (~500 requests/day), on-demand costs under $2/month total. Provisioned capacity would either over-provision (waste money) or under-provision (throttle requests at cutoff time).

---

## Seed Script

A `scripts/seed-settings.ts` script writes the initial Settings record with default values:
- Off-days: Saturday and Sunday
- Iftar periods: empty (admin configures when needed)
- Company WFH periods: empty
- Max forward planning days: 14

The script is idempotent — running it multiple times does not create duplicate records.

---

## Definition of Done

- [ ] All 6 tables defined in `packages/infra` using SST `Table` construct
- [ ] All tables use `PAY_PER_REQUEST` billing
- [ ] GSIs match this document exactly — 2 total, no more, no fewer
- [ ] Table names passed as environment variables to Lambda functions via SST
- [ ] TypeScript interfaces for all entities defined in `packages/core/src/types.ts`
- [ ] Seed script writes Settings record and is idempotent
- [ ] `sst dev` can access tables in local development mode

---

## What This Issue Does Not Include

- No Lambda handlers reading or writing these tables (begins Issue 5)
- No application business logic (Issue 3)
- No GSI on WorkLocations (deferred — added when WFH overage report is implemented)
- No audit log table (deferred to a future iteration)
- No deployment to AWS (only SST synthesis is verified)

The schema is intentionally defined without application code. Reviewers should focus on whether the key structures support the access patterns and whether the GSI budget is justified.
