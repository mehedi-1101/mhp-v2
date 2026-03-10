// =============================================================================
// Enums
// String union types used as enums. These constrain the values stored in
// DynamoDB and enforced by the bot command handlers.
// =============================================================================

export type Role = "EMPLOYEE" | "TEAM_LEAD" | "ADMIN" | "LOGISTICS";

export type UserStatus = "ACTIVE" | "INACTIVE";

export type MealType =
  | "LUNCH"
  | "SNACKS"
  | "IFTAR"
  | "EVENT_DINNER"
  | "OPTIONAL_DINNER";

export type MealStatus = "IN" | "OUT";

export type Location = "OFFICE" | "WFH";

export type SpecialDayType = "OFFICE_CLOSED" | "GOVT_HOLIDAY" | "CELEBRATION";

export type JobStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

// =============================================================================
// Entity Interfaces
// These map directly to DynamoDB table records. Attribute names match the
// DynamoDB attribute names exactly so there is no mapping layer needed.
// =============================================================================

/**
 * Users table
 * PK: userId (format: u#<discordId>)
 * GSI: discordId-index (PK: discordId)
 */
export interface User {
  userId: string;       // u#<discordId> — internal identity namespace
  discordId: string;    // Discord snowflake ID — used for GSI lookup
  name: string;         // Display name shown in summaries
  role: Role;
  teamId: string | null; // null for ADMIN and LOGISTICS roles
  status: UserStatus;
  createdAt: string;    // ISO 8601 timestamp — when the user was first added
  updatedAt: string;    // ISO 8601 timestamp
}

/**
 * Participation table
 * PK: date (YYYY-MM-DD)   SK: userId#mealType (e.g. u#123456789#LUNCH)
 * GSI: userId-date-index (PK: userId, SK: date)
 *
 * Absence of a record means the meal's default status applies.
 * Only exceptions to defaults are stored.
 */
export interface ParticipationRecord {
  date: string;               // YYYY-MM-DD
  "userId#mealType": string;  // composite SK: u#<discordId>#<mealType>
  userId: string;             // stored separately for GSI
  mealType: MealType;
  status: MealStatus;
  updatedBy: string;          // userId of the actor (may differ from record owner for admin overrides)
  updatedAt: string;          // ISO 8601 timestamp
}

/**
 * WorkLocations table
 * PK: date (YYYY-MM-DD)   SK: userId
 *
 * Absence of a record means OFFICE (default).
 * WFH users are excluded from ALL meal headcounts regardless of participation records.
 */
export interface WorkLocation {
  date: string;       // YYYY-MM-DD
  userId: string;
  location: Location;
  updatedBy: string;  // userId of the actor
  updatedAt: string;  // ISO 8601 timestamp
}

/**
 * SpecialDays table
 * PK: yearMonth (YYYY-MM)   SK: date (YYYY-MM-DD)
 *
 * yearMonth as PK enables both single-date lookup (GetItem) AND
 * list-by-month (Query PK=yearMonth) without a GSI.
 */
export interface SpecialDay {
  yearMonth: string;          // YYYY-MM — partition key
  date: string;               // YYYY-MM-DD — sort key
  type: SpecialDayType;
  note: string | null;        // optional description
  meals: MealType[];          // extra meals for CELEBRATION days (e.g. EVENT_DINNER)
  createdBy: string;          // userId of creator
  updatedAt: string;          // ISO 8601 timestamp
}

/**
 * Settings table
 * PK: settingId — always "global" (single record)
 *
 * All reads are GetItem PK="global". All writes replace the full record.
 * Cutoff time is NOT stored here — it is hardcoded as CUTOFF_HOUR in constants.ts.
 */
export interface IftarPeriod {
  label: string;      // e.g. "Ramadan 2026"
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
}

export interface CompanyWfhPeriod {
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
  reason: string;
}

export interface Settings {
  settingId: "global";               // always "global" — enforced by type
  offDays: number[];                 // day-of-week: 0=Sun, 6=Sat. Default: [0, 6]
  iftarPeriods: IftarPeriod[];       // empty until admin configures
  companyWfhPeriods: CompanyWfhPeriod[]; // empty until admin configures
  maxForwardPlanningDays: number;    // default: 14
  monthlyWfhAllowance: number;       // soft limit for WFH days per month. Default: 5
}

/**
 * SummaryJobs table
 * PK: date (YYYY-MM-DD)   SK: jobId (UUID)
 *
 * Coordinates async summary generation between the bot Lambda (creates job)
 * and the worker Lambda (processes job). Discord requires a response within
 * 3 seconds — the async pattern guarantees this.
 */
export interface SummaryJob {
  date: string;                 // YYYY-MM-DD — the date the summary covers
  jobId: string;                // UUID
  status: JobStatus;
  result: SummaryResult | null; // populated when status = READY
  errorMessage: string | null;  // populated when status = FAILED
  triggeredBy: string;          // userId of admin who triggered
  createdAt: string;            // ISO 8601
  updatedAt: string;            // ISO 8601
}

/**
 * Computed result stored in SummaryJob when status = READY.
 * Populated by the worker Lambda after calling computeHeadcount() from packages/core.
 * Full HeadcountReport type is defined in Issue 3 (participation.ts).
 */
export interface SummaryResult {
  date: string;
  formattedMessage: string; // the Discord-formatted summary message
}
