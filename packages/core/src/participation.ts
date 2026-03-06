import type {
  MealStatus,
  MealType,
  ParticipationRecord,
  WorkLocation,
  User,
  Settings,
} from "./types.js";
import type { MealAvailability } from "./availability.js";

export interface MealHeadcount {
  mealType: MealType;
  defaultStatus: MealStatus;
  count: number;
}

export interface TeamStat {
  teamId: string;
  officeCount: number;
  wfhCount: number;
}

export interface HeadcountReport {
  date: string;
  totalUsers: number;
  officeCount: number;
  wfhCount: number;
  meals: MealHeadcount[];
  byTeam: TeamStat[];
}

/**
 * Resolves a user's effective meal status for a given meal.
 * If no explicit record exists, the meal's default status applies.
 */
export function resolveStatus(
  record: ParticipationRecord | undefined,
  defaultStatus: MealStatus
): MealStatus {
  return record !== undefined ? record.status : defaultStatus;
}

/**
 * Resolves a user's effective work location for a given date.
 *
 * Priority:
 * 1. Explicit WorkLocation record for the date
 * 2. Active company WFH period (from Settings)
 * 3. Default: OFFICE
 */
function resolveLocation(
  userId: string,
  date: string,
  locationRecords: WorkLocation[],
  settings: Settings
): "OFFICE" | "WFH" {
  const explicit = locationRecords.find(
    (r) => r.userId === userId && r.date === date
  );
  if (explicit !== undefined) {
    return explicit.location;
  }

  const inCompanyWfh = settings.companyWfhPeriods.some(
    (period) => date >= period.startDate && date <= period.endDate
  );
  if (inCompanyWfh) {
    return "WFH";
  }

  return "OFFICE";
}

/**
 * Computes the headcount report for a given date.
 *
 * Formula:
 * - WFH users are fully excluded from all meal counts
 * - For meals with defaultStatus IN:  count = officeUsers - those with explicit OUT
 * - For meals with defaultStatus OUT: count = officeUsers with explicit IN only
 */
export function computeHeadcount(
  date: string,
  availableMeals: MealAvailability[],
  allUsers: User[],
  participationRecords: ParticipationRecord[],
  locationRecords: WorkLocation[],
  settings: Settings
): HeadcountReport {
  const activeUsers = allUsers.filter((u) => u.status === "ACTIVE");

  const officeUserIds = new Set<string>();
  const wfhUserIds = new Set<string>();

  for (const user of activeUsers) {
    const location = resolveLocation(user.userId, date, locationRecords, settings);
    if (location === "WFH") {
      wfhUserIds.add(user.userId);
    } else {
      officeUserIds.add(user.userId);
    }
  }

  const meals: MealHeadcount[] = availableMeals.map(({ mealType, defaultStatus }) => {
    const dateRecords = participationRecords.filter(
      (r) => r.date === date && r.mealType === mealType
    );

    let count: number;
    if (defaultStatus === "IN") {
      const optedOut = dateRecords.filter(
        (r) => r.status === "OUT" && officeUserIds.has(r.userId)
      ).length;
      count = officeUserIds.size - optedOut;
    } else {
      count = dateRecords.filter(
        (r) => r.status === "IN" && officeUserIds.has(r.userId)
      ).length;
    }

    return { mealType, defaultStatus, count };
  });

  const teamMap = new Map<string, TeamStat>();
  for (const user of activeUsers) {
    if (user.teamId === null) continue;
    if (!teamMap.has(user.teamId)) {
      teamMap.set(user.teamId, { teamId: user.teamId, officeCount: 0, wfhCount: 0 });
    }
    const stat = teamMap.get(user.teamId)!;
    if (officeUserIds.has(user.userId)) {
      stat.officeCount++;
    } else {
      stat.wfhCount++;
    }
  }

  return {
    date,
    totalUsers: activeUsers.length,
    officeCount: officeUserIds.size,
    wfhCount: wfhUserIds.size,
    meals,
    byTeam: Array.from(teamMap.values()),
  };
}
