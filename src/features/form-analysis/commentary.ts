import type { FormAnalysis } from '@/types/formAnalysis';

export function generateCommentary(
    metrics: FormAnalysis['metrics'],
    baseline: { cadence: number; vertOsc: number; trunkLean: number } | null
): FormAnalysis['commentary'] {
    const tips: string[] = [];
    let comparison = 'Looking solid! Your form shows good consistency.';

    if (metrics.overstrideFlag) {
        tips.push('Focus on landing with your feet under your hips rather than reaching forward.');
    }

    if (metrics.cadence < 165) {
        tips.push('Try increasing your step frequency (cadence) slightly to reduce ground impact.');
    }

    if (metrics.verticalOscillation > 10) {
        tips.push('You have significant vertical bounce. Focus on driving forward rather than upward.');
    }

    if (metrics.trunkLean > 8) {
        tips.push('You\'re leaning forward a bit much. Try to "run tall" with a slight lean from the ankles.');
    }

    if (baseline) {
        const cadenceDiff = metrics.cadence - baseline.cadence;
        if (Math.abs(cadenceDiff) > 5) {
            comparison = `Your cadence is ${cadenceDiff > 0 ? 'higher' : 'lower'} than your recent average by ${Math.abs(cadenceDiff).toFixed(0)} spm.`;
        }
    }

    if (tips.length === 0) {
        tips.push('Excellent efficiency — maintain this posture for your long runs.');
    }
    if (tips.length === 1) {
        tips.push('Check your shoulder tension; keep them relaxed and down.');
    }

    return {
        tips: tips.slice(0, 2),
        baselineComparison: comparison,
        confidence: 0.85,
    };
}

export function generateActivitySummary(analysis: FormAnalysis) {
    const lines = [
        '--- RunViz Form Analysis ---',
        `Cadence: ${analysis.metrics.cadence} SPM`,
        `Vert Osc: ${analysis.metrics.verticalOscillation.toFixed(1)} cm`,
        `Trunk Lean: ${analysis.metrics.trunkLean.toFixed(1)}°`,
        `Overstride: ${analysis.metrics.overstrideFlag ? 'Detected' : 'Neutral'}`,
    ];

    if (analysis.metrics.strideLength) {
        lines.push(`Stride Length: ${analysis.metrics.strideLength.toFixed(2)} m`);
    }

    lines.push('');
    lines.push('Coaching Tips:');
    analysis.commentary.tips.forEach((tip) => lines.push(`- ${tip}`));

    return lines.join('\n');
}
