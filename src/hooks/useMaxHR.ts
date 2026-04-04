import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'runviz_max_hr';
const DEFAULT_MAX_HR = 185;
const MIN_MAX_HR = 140;
const MAX_MAX_HR = 220;

function parseStoredMaxHR(value: string | null): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < MIN_MAX_HR || parsed > MAX_MAX_HR) {
    return null;
  }
  return parsed;
}

export function useMaxHR() {
  const [maxHR, setMaxHRState] = useState<number>(() => {
    try {
      return parseStoredMaxHR(localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_MAX_HR;
    } catch {
      return DEFAULT_MAX_HR;
    }
  });
  const [isDefault, setIsDefault] = useState<boolean>(() => {
    try {
      return parseStoredMaxHR(localStorage.getItem(STORAGE_KEY)) === null;
    } catch {
      return true;
    }
  });

  const setMaxHR = useCallback((value: number) => {
    if (!Number.isFinite(value) || value < MIN_MAX_HR || value > MAX_MAX_HR) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Ignore storage write failures.
    }
    setMaxHRState(value);
    setIsDefault(false);
  }, []);

  const clearMaxHR = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage removal failures.
    }
    setMaxHRState(DEFAULT_MAX_HR);
    setIsDefault(true);
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const nextValue = parseStoredMaxHR(event.newValue);
      setMaxHRState(nextValue ?? DEFAULT_MAX_HR);
      setIsDefault(nextValue === null);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return { maxHR, isDefault, setMaxHR, clearMaxHR };
}
