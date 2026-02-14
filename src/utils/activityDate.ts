import { format, parseISO } from 'date-fns';

export function parseActivityLocalDate(dateStr: string): Date {
    // Strava local timestamps can include a trailing "Z" even when intended as local wall time.
    const normalized = dateStr.endsWith('Z') ? dateStr.slice(0, -1) : dateStr;
    return parseISO(normalized);
}

export function activityLocalDateKey(dateStr: string): string {
    return format(parseActivityLocalDate(dateStr), 'yyyy-MM-dd');
}
