export function computeMonotony(dailyTrimps: number[]): number {
    if (dailyTrimps.length === 0) return 0;

    const mean = dailyTrimps.reduce((sum, value) => sum + value, 0) / dailyTrimps.length;
    const variance = dailyTrimps.reduce((sum, value) => sum + (value - mean) ** 2, 0) / dailyTrimps.length;
    const sd = Math.sqrt(variance);

    return sd === 0 ? 0 : mean / sd;
}

export function computeStrain(weeklyTrimp: number, monotony: number): number {
    return weeklyTrimp * monotony;
}

export function monotonyColorClass(monotony: number): string {
    if (monotony <= 0) return 'text-gray-400';
    if (monotony > 2.0) return 'text-red-400';
    if (monotony > 1.5) return 'text-orange-400';
    return 'text-emerald-400';
}

export function strainColorClass(strain: number): string {
    if (strain <= 0) return 'text-gray-400';
    if (strain > 6000) return 'text-red-400';
    if (strain > 3000) return 'text-orange-400';
    return 'text-emerald-400';
}
