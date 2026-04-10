import type { Activity } from '../types/activity';
import { isRun } from '../types/activity';
import { parseActivityLocalDate } from '../utils/activityDate';

export interface MonthlyRow {
  monthIndex: number;
  km: number;
}

export interface YearSeries {
  year: number;
  /** 12 entries — cumulative km through that month (Jan = month 0 total, Feb = Jan+Feb total, etc.) */
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
    .map(([year, monthlyKm]) => {
      // Convert monthly totals to a running cumulative sum
      let running = 0;
      const months = monthlyKm.map((km, monthIndex) => {
        running += km;
        return {
          monthIndex,
          km: Math.round(running * 10) / 10,
        };
      });
      return { year, months };
    });
}
