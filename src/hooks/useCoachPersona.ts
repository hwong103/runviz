import { useCallback, useEffect, useState } from 'react';

export type CoachPersona = 'gentle' | 'neutral' | 'blunt' | 'drill';

export interface PersonaMeta {
    id: CoachPersona;
    name: string;
    title: string;
    description: string;
}

export const PERSONAS: PersonaMeta[] = [
    {
        id: 'gentle',
        name: 'Maya',
        title: 'Supportive',
        description: 'Warm and encouraging. Frames concerns gently and always acknowledges your effort.',
    },
    {
        id: 'neutral',
        name: 'Jordan',
        title: 'Balanced',
        description: 'Pragmatic and data-literate. Clear, specific coaching without editorialising.',
    },
    {
        id: 'blunt',
        name: 'Rex',
        title: 'Direct',
        description: 'No padding, no softening. States the situation and tells you what to do.',
    },
    {
        id: 'drill',
        name: 'Sgt. Kowalski',
        title: 'Demanding',
        description: 'Hard truths and zero tolerance for excuses. Holds you to a higher standard.',
    },
];

const STORAGE_KEY = 'runviz_coach_persona';
const PERSONA_EVENT = 'runviz:coach-persona-change';
const DEFAULT_PERSONA: CoachPersona = 'neutral';

function isCoachPersona(value: string | null): value is CoachPersona {
    return value === 'gentle' || value === 'neutral' || value === 'blunt' || value === 'drill';
}

function readStoredPersona(): CoachPersona {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (isCoachPersona(stored)) {
            return stored;
        }
    } catch {
        // Ignore storage read failures.
    }

    return DEFAULT_PERSONA;
}

export function useCoachPersona() {
    const [persona, setPersonaState] = useState<CoachPersona>(readStoredPersona);

    useEffect(() => {
        const syncPersona = (nextValue?: string | null) => {
            if (nextValue && isCoachPersona(nextValue)) {
                setPersonaState(nextValue);
                return;
            }

            setPersonaState(readStoredPersona());
        };

        const handleStorage = (event: StorageEvent) => {
            if (event.key === STORAGE_KEY) {
                syncPersona(event.newValue);
            }
        };

        const handlePersonaChange = () => {
            syncPersona();
        };

        window.addEventListener('storage', handleStorage);
        window.addEventListener(PERSONA_EVENT, handlePersonaChange);

        return () => {
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener(PERSONA_EVENT, handlePersonaChange);
        };
    }, []);

    const setPersona = useCallback((next: CoachPersona) => {
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Ignore storage write failures.
        }

        setPersonaState(next);
        window.dispatchEvent(new Event(PERSONA_EVENT));
    }, []);

    return { persona, setPersona, personas: PERSONAS };
}
