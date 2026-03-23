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
// All interfaces map directly to DynamoDB single-table items.
// Every interface carries PK, SK, and entityType — the three fields required
// by the single-table design. Attribute names match DynamoDB attribute names
// exactly — no mapping layer needed between application code and DynamoDB.
// =============================================================================

/**
 * User item
 * PK: USER#<userId>   SK: USER#<userId>
 * GSI 1 (discordId-index): PK = discordId
 */
export interface User {
  PK: string;                   // USER#<userId>
  SK: string;                   // USER#<userId>
  entityType: "USER";
  userId: string;               // u#<discordId> — internal identity namespace
  discordId: string;            // Discord snowflake ID — GSI 1 key
  gchatUserId: string | null;   // Google Chat user resource name e.g. "users/abc123"
  name: string;                 // Display name shown in summaries
  role: Role;
  teamId: string | null;        // null for ADMIN and LOGISTICS roles
  status: UserStatus;
  createdAt: string;            // ISO 8601
  updatedAt: string;            // ISO 8601
}

/**
 * Team item
 * PK: TEAM#<teamId>   SK: TEAM#<teamId>
 *
 * Team lead is identified via role: TEAM_LEAD on the User record — not stored here.
 * Storing teamLeadUserId on Team would require keeping it in sync when leads change.
 */
export interface Team {
  PK: string;           // TEAM#<teamId>
  SK: string;           // TEAM#<teamId>
  entityType: "TEAM";
  teamId: string;       // short slug e.g. "mimir", "saga"
  name: string;         // display name e.g. "Mimir"
}

/**
 * Participation item
 * PK: PART#<date>   SK: <userId>#<mealType>
 * GSI 2 (userId-date-index): PK = userId, SK = date
 *
 * Absence of a record means the meal's default status applies.
 * Only explicit opt-in/out changes are stored.
 */
export interface ParticipationRecord {
  PK: string;               // PART#<date>
  SK: string;               // <userId>#<mealType>
  entityType: "PART";
  date: string;             // YYYY-MM-DD — plain attribute for GSI 2 SK
  userId: string;           // u#<discordId> — plain attribute for GSI 2 PK
  mealType: MealType;
  status: MealStatus;
  updatedBy: string;        // userId of the actor
  updatedAt: string;        // ISO 8601
}

/**
 * WorkLocation item
 * PK: LOC#<date>   SK: <userId>
 * GSI 2 (userId-date-index): PK = userId, SK = date
 *
 * Absence of a record means OFFICE (default).
 * WFH users are excluded from ALL meal headcounts regardless of participation records.
 */
export interface WorkLocation {
  PK: string;       // LOC#<date>
  SK: string;       // <userId>
  entityType: "LOC";
  date: string;     // YYYY-MM-DD — plain attribute for GSI 2 SK
  userId: string;   // u#<discordId> — plain attribute for GSI 2 PK
  location: Location;
  updatedBy: string;
  updatedAt: string;
}

/**
 * SpecialDay item
 * PK: SDAY#<yearMonth>   SK: <date>
 *
 * yearMonth as PK enables both single-date lookup (GetItem) AND
 * list-by-month (Query PK=yearMonth) without a GSI.
 */
export interface SpecialDay {
  PK: string;               // SDAY#<yearMonth>
  SK: string;               // <date>
  entityType: "SDAY";
  yearMonth: string;        // YYYY-MM
  date: string;             // YYYY-MM-DD
  type: SpecialDayType;
  note: string | null;
  meals: MealType[];        // extra meals for CELEBRATION days
  createdBy: string;
  updatedAt: string;
}

/**
 * Settings item
 * PK: SETTINGS#global   SK: SETTINGS#global
 *
 * Single record. All reads are GetItem with the fixed key.
 * Cutoff time is NOT stored here — hardcoded as CUTOFF_HOUR in constants.ts.
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
  PK: "SETTINGS#global";
  SK: "SETTINGS#global";
  entityType: "SETTINGS";
  settingId: "global";                    // always "global" — enforced by type
  offDays: number[];                      // 0=Sun, 6=Sat. Default: [0, 6]
  iftarPeriods: IftarPeriod[];
  companyWfhPeriods: CompanyWfhPeriod[];
  maxForwardPlanningDays: number;         // default: 14
  monthlyWfhAllowance: number;            // soft limit. Default: 5
}

/**
 * SummaryJob item
 * PK: JOB#<date>   SK: <jobId> (UUID)
 *
 * Coordinates async summary generation between bot Lambda (creates job)
 * and worker Lambda (processes job).
 */
export interface SummaryJob {
  PK: string;                   // JOB#<date>
  SK: string;                   // UUID
  entityType: "JOB";
  date: string;                 // YYYY-MM-DD — date the summary covers
  jobId: string;                // UUID — same value as SK
  status: JobStatus;
  result: SummaryResult | null; // populated when status = READY
  errorMessage: string | null;  // populated when status = FAILED
  triggeredBy: string;          // userId of admin who triggered
  createdAt: string;
  updatedAt: string;
}

/**
 * Computed result stored in SummaryJob when status = READY.
 */
export interface SummaryResult {
  date: string;
  formattedMessage: string;
}

// =============================================================================
// Command interfaces
// Platform-agnostic input/output for all command handlers.
// Both Discord Bot and GChat Bot parse their platform-specific events into
// CommandContext before calling any handler. Handlers return CommandResult,
// which each Bot Lambda formats into its own response shape.
// =============================================================================

export interface CommandContext {
  user: User;
  platform: "discord" | "gchat";
  commandName: string;
  subcommand: string | null;
  args: Record<string, string | number | boolean | undefined>;
}

export interface CommandResult {
  content: string;
  ephemeral: boolean;
}
