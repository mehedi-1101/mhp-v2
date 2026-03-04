# Issue 3 — Core Domain Package: Business Logic in TypeScript

- **Date:** 2026-03-02
- **Issue:** #3
- **Status:** In Review
- **Depends on:** [Issue 1 — Project Scaffold](./i1-project-scaffold.md), [Issue 2 — DynamoDB Schema](./i2-dynamodb-schema.md)

---

## Context

Issue 1 created the project skeleton. Issue 2 defined what data exists and how it is stored. This issue defines what the system **does** with that data — the business rules.

`packages/core` is the most important package in the codebase. It contains the logic that determines whether a user can eat lunch, how many people are counted for dinner, and whether a change is allowed after cutoff. Everything the bot does is ultimately driven by what lives here.

The full system architecture is documented in the [Task 2 Technical Design](./technical-design.md). This document focuses specifically on the design decisions for the core business logic layer.

---

## Summary

Port the core business logic from the existing JavaScript codebase into `packages/core` as pure TypeScript functions. These functions have zero dependencies on AWS, Discord, or any I/O operations. Every function takes data as arguments and returns a result.

This separation makes the entire business logic layer independently unit-testable. Tests run in milliseconds with no mocking of AWS or Discord. The bot Lambda and worker Lambda both call these same functions — no duplication of business rules.

The logic itself is not rewritten — it is ported and typed. The rules that governed the previous system govern this one.

---

## Problem Statement

In the previous system, business logic was mixed with Express middleware, file system calls, and HTTP request/response handling. For example, `mealService.js` contained both the opt-in/opt-out logic and the direct file I/O calls. This made it impossible to test the logic without the file system.

In `packages/core`, logic and I/O are fully separated. The bot Lambda fetches data from DynamoDB, passes it to core functions as plain TypeScript objects, and receives results back. The core functions never know where the data came from.

This separation enables:
- Unit testing without AWS credentials or mocked services
- Reusing the same logic in multiple Lambda functions (bot, worker)
- Reviewing business rules independently from infrastructure code
- Changing data sources without touching business logic

---

## Why This Issue Comes Before the Bot

The bot Lambda (Issue 4) and all command handlers (Issues 5–9) call functions from `packages/core`. If core is not implemented and tested first, command handlers are built on unverified logic. Any bug in the headcount formula or cutoff check affects every command.

Implementing core first also means: when a command handler is reviewed, the reviewer can focus on the Discord interaction layer (argument parsing, response formatting, role checks) without needing to verify the business rules at the same time. Separation of concerns in review, not just in code.

---

## Design Principles

### Pure Functions (No I/O)

Every function in `packages/core` is pure:
- Takes all required data as arguments
- Returns a result
- No database calls, no HTTP requests, no file system access
- Same inputs always produce same outputs

**Why this matters:**
The bot Lambda becomes a thin orchestration layer: fetch data from DynamoDB, call core functions, format response for Discord. The business logic is independently verifiable.

### Type Safety Across Packages

All TypeScript interfaces and enums are defined in `packages/core/src/types.ts`. Both `packages/bot` and the future worker Lambda import from this single source of truth. A change to a data structure is caught at compile time across all packages.

**Why this matters:**
In the previous JavaScript system, the bot and the web backend could drift out of sync. TypeScript prevents this entire class of bugs.

### Testability Without Mocking

Because core functions have no I/O, tests pass plain JavaScript objects as arguments. No need to mock DynamoDB clients, no need to stub AWS SDK calls. Tests run in milliseconds and are trivially parallelizable.

**Why this matters:**
Fast tests mean developers run them frequently. Simple tests mean new contributors can understand them. This is only possible because I/O is separated from logic.

---

## Module Responsibilities

```
packages/core/src/
├── types.ts          Shared TypeScript interfaces and enums
├── constants.ts      System constants (cutoff hour, meal defaults)
├── availability.ts   Meal availability logic
├── participation.ts  Headcount computation and status resolution
├── cutoff.ts         Cutoff time enforcement
├── validation.ts     Input validation helpers
└── __tests__/        Unit tests for all modules
```

### types.ts — Single Source of Truth

**Purpose:**
Defines all TypeScript interfaces and enums used across packages. Includes entity types (User, ParticipationRecord, WorkLocation, SpecialDay, Settings), domain enums (Role, MealType, MealStatus, Location), and computed types (MealAvailability, HeadcountReport).

**Why centralized:**
Both `packages/bot` and the worker Lambda import from here. A change to the User interface is immediately visible to all consumers at compile time. No runtime surprises.

**Categories of types:**
- **Entities** — map directly to DynamoDB tables (User, ParticipationRecord, WorkLocation, SpecialDay, Settings)
- **Enums** — constrain values (Role, MealType, MealStatus, Location, SpecialDayType)
- **Computed types** — outputs of business logic (MealAvailability, HeadcountReport)

---

### constants.ts — System Constants

**Purpose:**
Defines constants used across business logic: cutoff hour, meal default statuses.

**Key Design Decision: Cutoff Hour as Constant**

The cutoff time is hardcoded as `CUTOFF_HOUR = 21` (9 PM). It is not read from the Settings table.

**Why:**
Reading Settings from DynamoDB on every meal or location mutation just to check a value that changes at most once a year adds unnecessary latency and cost. A constant with a redeploy is the right trade-off for an internal tool at this scale.

This decision is documented in [Issue 2 — Settings table design](./i2-dynamodb-schema.md).

**Meal defaults:**
Each meal type has a default status (IN or OUT) that applies when no explicit participation record exists. These defaults drive the entire opt-in/opt-out model.

---

### availability.ts — Meal Availability Logic

**Purpose:**
Determines which meals are available on a given date and their default statuses. This is the first step in any headcount calculation or employee status view.

**Business Rules (applied in priority order):**
1. Weekends (off-days) → no meals available
2. Office closures and government holidays → no meals available
3. Normal working days → LUNCH and SNACKS available (default IN)
4. Iftar period active → IFTAR available (default IN)
5. Celebration days → base meals plus any event-specific meals

**Why this is a separate module:**
Meal availability logic is complex and context-dependent (special days, Iftar periods, off-days). Isolating it in one module means changes to availability rules don't require touching headcount computation or cutoff enforcement.

**Key Design Decision: Pure Function**

The caller (bot Lambda) fetches the SpecialDay record and Settings from DynamoDB, then passes them as arguments. The function itself does no I/O. This makes availability logic fully testable without any AWS setup.

---

### participation.ts — Headcount Computation

**Purpose:**
Contains the core headcount calculation logic and status resolution for individual users.

**Two primary functions:**
1. **Status resolution** — determines a user's meal status (explicit record vs default)
2. **Headcount computation** — calculates meal counts for a date

**Key Design Decision: WFH Users Fully Excluded**

A user with WFH location contributes zero to all meal counts. Their participation records are irrelevant to the headcount. Even if a WFH user has an explicit IN record for LUNCH, they do not count.

**Why:**
A WFH user does not eat at the office. This rule simplifies the model and reflects operational reality. Location resolves first; if WFH, the user is removed from all meal calculations.

This rule is unchanged from the previous system and is intentional.

**Headcount Formula (preserved from previous system):**

For meals with default status IN (LUNCH, SNACKS, IFTAR):
- Start with all office users
- Subtract those with explicit OUT records

For meals with default status OUT (OPTIONAL_DINNER):
- Start with zero
- Add only those with explicit IN records

**Location Resolution Priority:**
1. Explicit WorkLocation record for the date
2. Active company WFH period (from Settings)
3. Default: OFFICE

This priority logic is applied before any meal counting begins.

**Team Breakdown:**
The headcount report includes per-team office/WFH counts. This supports the team lead summary view where a team lead sees their team's participation.

---

### cutoff.ts — Cutoff Time Enforcement

**Purpose:**
Determines whether the cutoff time has passed for a given target date. Used by command handlers to reject employee updates after cutoff.

**Business Rule:**
- Future dates → cutoff never passed (always open)
- Past dates → cutoff always passed (always closed)
- Today → cutoff passed if current hour >= 21 (9 PM in Asia/Dhaka timezone)

**Key Design Decision: Role-Agnostic Function**

The cutoff function does not know about roles. It simply returns true or false based on time comparison. The caller (command handler) decides whether to enforce it:

- EMPLOYEE → enforce cutoff
- TEAM_LEAD → bypass cutoff
- ADMIN → bypass cutoff

This keeps the cutoff function simple and the role logic in one place (the command handler).

**Why pure time comparison:**
No database read needed. The cutoff hour is a constant. This function is called on every meal and location mutation — keeping it fast matters.

---

### validation.ts — Input Validation

**Purpose:**
Provides validation helpers used by command handlers to validate user input before any DynamoDB operations.

**Functions:**
- **Date validation** — ensures date string is valid YYYY-MM-DD format and represents a real calendar date
- **Planning window validation** — ensures date is within the allowed forward planning window (from Settings)
- **Working day check** — determines if a date is a working day (not weekend, not office closure, not government holiday)

**Why separate module:**
Validation logic is reused across multiple command handlers. Centralizing it prevents duplication and ensures consistent error messages.

**Key Design Decision: Fail Fast**

Validation happens before any database operations. Invalid input is rejected immediately with a clear error message. This keeps command handlers clean and prevents unnecessary DynamoDB calls.

---

## Testing Strategy

The core package is designed to be testable through its pure function architecture. All functions take data as arguments and return results with no I/O dependencies.

**Why the architecture supports testing:**
Pure functions with no I/O mean that when tests are added in the future, they will be simple to write and fast to run. No mocking of AWS services or Discord APIs will be required.

**What makes core testable:**
- Pure functions with no I/O
- All dependencies passed as arguments
- Deterministic outputs for given inputs
- No external service dependencies

**Testing approach for this iteration:**
Unit tests are not the focus for this iteration. The priority is implementing the cloud-based architecture correctly and learning the AWS serverless patterns. The pure function design means tests can be added later without refactoring the code.

**Manual verification:**
Business logic will be verified through the Discord bot commands during development. Each command exercises the core functions with real data, providing immediate feedback on correctness.

---

## Definition of Done

- [ ] All modules in `packages/core/src/` implemented with correct TypeScript types
- [ ] No imports from `@aws-sdk/*`, `discord.js`, or any I/O library
- [ ] `npm run typecheck` passes in strict mode
- [ ] `npm run build` compiles successfully in `packages/core`
- [ ] HeadcountReport output matches the format documented in [technical design](./technical-design.md)
- [ ] WFH users are fully excluded from all meal counts in headcount computation
- [ ] Status resolution correctly returns meal default when no explicit record exists
- [ ] Cutoff function uses constant, not Settings table read
- [ ] All types exported from `types.ts` are used by at least one function
- [ ] Functions can be imported and called from `packages/bot` without errors

---

## What This Issue Does Not Include

- No DynamoDB reads or writes (that is the bot Lambda's responsibility)
- No Discord interaction handling (Issue 4)
- No command registration (Issue 4)
- No Lambda handlers (Issues 4–9)
- No async summary worker (Issue 9)

The core package is intentionally a library. It does nothing on its own. It is only useful when imported by the bot or worker Lambda.

---

## Alignment with Overall Architecture

This issue implements the business logic layer described in the [Task 2 Technical Design](./technical-design.md). The separation of concerns is:

- **packages/core** (this issue) — business rules, pure functions, no I/O
- **packages/bot** (Issues 4–8) — Discord interactions, DynamoDB calls, calls core functions
- **packages/worker** (Issue 9) — async summary generation, calls core functions
- **packages/infra** (Issue 2, 4) — AWS resource definitions, no business logic

This separation means business logic changes never require infrastructure changes and vice versa.
