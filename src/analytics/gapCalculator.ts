/**
 * Grade Adjusted Pace (GAP) Calculator
 * 
 * GAP adjusts pace for elevation changes, estimating equivalent flat-ground effort.
 * Uses the Minetti formula which models metabolic cost of running at various grades.
 */

/**
 * Minetti's metabolic cost coefficients for running on grades
 * Cost = a + b*x + c*x^2 + d*x^3 + e*x^4 + f*x^5
 * where x = gradient as decimal (e.g., 0.10 for 10%)
 */
const MINETTI_COEFFICIENTS = {
    a: 155.4,    // flat ground cost
    b: -30.4,
    c: -16.7,
    d: 1017.1,
    e: 2.0,
    f: 0.0,
};

/**
 * Calculate metabolic cost at a given grade using Minetti formula
 * @param grade - Grade as decimal (e.g., 0.10 for 10% uphill, -0.10 for downhill)
 * @returns Metabolic cost in arbitrary units
 */
function metabolicCost(grade: number): number {
    const { a, b, c, d, e, f } = MINETTI_COEFFICIENTS;
    const g = Math.max(-0.45, Math.min(0.45, grade)); // Clamp extreme grades
    return a + b * g + c * g ** 2 + d * g ** 3 + e * g ** 4 + f * g ** 5;
}

/**
 * Calculate GAP adjustment factor for a given grade
 * @param grade - Grade as decimal
 * @returns Adjustment factor (>1 means uphill effort, <1 means downhill)
 */
export function gapAdjustmentFactor(grade: number): number {
    const flatCost = metabolicCost(0);
    const gradeCost = metabolicCost(grade);
    return gradeCost / flatCost;
}

/**
 * Calculate Grade Adjusted Pace for a single point
 * @param pace - Actual pace in seconds per meter
 * @param grade - Grade as decimal
 * @returns Adjusted pace in seconds per meter
 */
export function calculateGAP(pace: number, grade: number): number {
    const factor = gapAdjustmentFactor(grade);
    // Faster actual pace with uphill effort means faster equivalent flat pace
    return pace / factor;
}

/**
 * Calculate GAP for an entire activity using stream data
 * @param velocities - Array of velocities in m/s
 * @param grades - Array of grades as decimals (matching velocities array)
 * @returns Object with overall GAP pace and per-point GAP data
 */
export function calculateActivityGAP(
    velocities: number[],
    grades: number[]
): {
    overallGapPace: number; // min/km
    averageActualPace: number; // min/km
    gapPaces: number[]; // min/km for each point
    totalAdjustedTime: number; // seconds
} {
    if (velocities.length !== grades.length || velocities.length === 0) {
        return {
            overallGapPace: 0,
            averageActualPace: 0,
            gapPaces: [],
            totalAdjustedTime: 0,
        };
    }

    let totalTime = 0;
    let totalAdjustedTime = 0;
    let totalDistance = 0;
    const gapPaces: number[] = [];

    // Assume each data point represents 1 second of data
    for (let i = 0; i < velocities.length; i++) {
        const velocity = velocities[i];
        if (velocity <= 0) {
            gapPaces.push(0);
            continue;
        }

        const pace = 1 / velocity; // seconds per meter
        const grade = grades[i] || 0;
        const gapPace = calculateGAP(pace, grade);

        // Convert to min/km for output
        gapPaces.push((gapPace * 1000) / 60);

        const distance = velocity; // meters covered in 1 second
        totalDistance += distance;
        totalTime += 1;

        // Adjusted time based on GAP
        const adjustedTime = pace / gapPace;
        totalAdjustedTime += adjustedTime;
    }

    const averageActualPace = totalDistance > 0
        ? (totalTime / totalDistance) * 1000 / 60
        : 0;

    const overallGapPace = totalDistance > 0
        ? (totalAdjustedTime / totalDistance) * 1000 / 60
        : 0;

    return {
        overallGapPace,
        averageActualPace,
        gapPaces,
        totalAdjustedTime,
    };
}

/**
 * Format pace as MM:SS per km or per mile
 * @param paceMinPerKm - Pace in minutes per kilometer
 * @param useMiles - Whether to convert to min/mile
 * @returns Formatted pace string
 */
export function formatPace(paceMinPerKm: number, useMiles = false): string {
    const pace = useMiles ? paceMinPerKm * 1.60934 : paceMinPerKm;
    const minutes = Math.floor(pace);
    const seconds = Math.round((pace - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
