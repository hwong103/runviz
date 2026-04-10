import type { FormAnalysis } from '@/types/formAnalysis';

export function historyBaselines(sessions: FormAnalysis[]) {
    if (sessions.length < 3) return null;

    const count = Math.min(10, sessions.length);
    const lastN = sessions.slice(0, count);

    return {
        cadence: lastN.reduce((sum, session) => sum + session.metrics.cadence, 0) / count,
        vertOsc: lastN.reduce((sum, session) => sum + session.metrics.verticalOscillation, 0) / count,
        trunkLean: lastN.reduce((sum, session) => sum + session.metrics.trunkLean, 0) / count,
    };
}
