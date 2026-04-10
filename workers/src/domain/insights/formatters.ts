export function formatPace(minutesPerKm: number): string {
    if (!Number.isFinite(minutesPerKm) || minutesPerKm <= 0) {
        return 'n/a';
    }

    const minutes = Math.floor(minutesPerKm);
    const seconds = Math.round((minutesPerKm - minutes) * 60);
    if (seconds === 60) {
        return `${minutes + 1}:00/km`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}/km`;
}

export function formatValue(key: string, value: unknown): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
        if (key.toLowerCase().includes('pace')) {
            return formatPace(value);
        }
        return String(value);
    }

    return String(value);
}

export function formatPayload(payload: Record<string, unknown>): string {
    return Object.entries(payload)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => {
            const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
            return `- ${formattedKey}: ${formatValue(key, value)}`;
        })
        .join('\n');
}
