export { seoulDateKey } from "@move-together/shared";

export type CalendarCell = { date: string; day: number } | null;

// Weeks of a YYYY-MM month, Sunday first; leading/trailing blanks are null.
export function monthWeeks(month: string): CalendarCell[][] {
  const [year, monthNumber] = month.split("-").map(Number);
  const leading = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells: CalendarCell[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= days; day += 1) {
    cells.push({ date: `${month}-${String(day).padStart(2, "0")}`, day });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const moved = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${moved.getUTCFullYear()}-${String(moved.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthTitle(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}년 ${monthNumber}월`;
}

export function dayTitle(date: string): string {
  const [, monthNumber, day] = date.split("-").map(Number);
  return `${monthNumber}월 ${day}일`;
}
