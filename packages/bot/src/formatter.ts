import type { HeadcountReport, MealType } from "@mhp/core";

const MEAL_DISPLAY: Record<MealType, string> = {
  LUNCH: "Lunch",
  SNACKS: "Snacks",
  IFTAR: "Iftar",
  EVENT_DINNER: "Event Dinner",
  OPTIONAL_DINNER: "Optional Dinner",
};

function formatDate(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  const dayName = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return `${dayName}, ${date}`;
}

export function formatHeadcountReport(report: HeadcountReport): string {
  const lines: string[] = [
    `📊 Daily Meal Summary — ${formatDate(report.date)}`,
    "",
    `👥 Office: ${report.officeCount} | 🏠 WFH: ${report.wfhCount} | Total: ${report.totalUsers}`,
    "",
    "🍽️ Meal Headcount:",
  ];

  for (const meal of report.meals) {
    const out = report.officeCount - meal.count;
    lines.push(`  ${MEAL_DISPLAY[meal.mealType]} — IN: ${meal.count}, OUT: ${out}`);
  }

  return lines.join("\n");
}
