import type { Activity } from '../types';
import { isRun } from '../types';
import { parseActivityLocalDate } from '../utils/activityDate';

export interface MonthlyRow {
  monthIndex: number;
  km: number;
}

export interface YearSeries {
  year: number;
  months: MonthlyRow[];
}

export function computeYearOnYear(activities: Activity[]): YearSeries[] {
  const runs = activities.filter(isRun);
  const yearMap = new Map<number, number[]>();

  for (const run of runs) {
    const date = parseActivityLocalDate(run.start_date_local);
    const year = date.getFullYear();
    const month = date.getMonth();

    if (!yearMap.has(year)) {
      yearMap.set(year, new Array(12).fill(0));
    }

    yearMap.get(year)![month] += run.distance / 1000;
  }

  return Array.from(yearMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, monthlyKm]) => ({
      year,
      months: monthlyKm.map((km, monthIndex) => ({
        monthIndex,
        km: Math.round(km * 10) / 10,
      })),
    }));
}
