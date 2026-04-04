import { useCallback, useEffect, useState } from 'react';
import { auth as authApi } from '@/services/api';

const STORAGE_KEY = 'runviz_max_hr';
const OWNER_STORAGE_KEY = 'runviz_max_hr_owner';
const DEFAULT_MAX_HR = 185;
const MIN_MAX_HR = 140;
const MAX_MAX_HR = 220;

interface MaxHRState {
  maxHR: number;
  isDefault: boolean;
  ownerId: string | null;
}

const listeners = new Set<(state: MaxHRState) => void>();
let activeUserId: string | null = null;
let syncPromise: Promise<void> | null = null;
let syncUserId: string | null = null;

function parseStoredMaxHR(value: string | null): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < MIN_MAX_HR || parsed > MAX_MAX_HR) {
    return null;
  }
  return parsed;
}

function readOwnerId(): string | null {
  try {
    return localStorage.getItem(OWNER_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredMaxHR(value: number | null, ownerId: string | null) {
  try {
    if (value === null) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(OWNER_STORAGE_KEY);
      return;
    }

    localStorage.setItem(STORAGE_KEY, String(value));
    if (ownerId) {
      localStorage.setItem(OWNER_STORAGE_KEY, ownerId);
    } else {
      localStorage.removeItem(OWNER_STORAGE_KEY);
    }
  } catch {
    // Ignore storage write failures.
  }
}

function readInitialState(): MaxHRState {
  try {
    const stored = parseStoredMaxHR(localStorage.getItem(STORAGE_KEY));
    return {
      maxHR: stored ?? DEFAULT_MAX_HR,
      isDefault: stored === null,
      ownerId: stored === null ? null : readOwnerId(),
    };
  } catch {
    return {
      maxHR: DEFAULT_MAX_HR,
      isDefault: true,
      ownerId: null,
    };
  }
}

let sharedState = readInitialState();

function updateSharedState(next: MaxHRState) {
  sharedState = next;
  listeners.forEach((listener) => listener(sharedState));
}

export async function syncMaxHRForUser(userId: string | null) {
  activeUserId = userId;

  if (!userId) {
    updateSharedState(readInitialState());
    return;
  }

  if (syncPromise && syncUserId === userId) {
    return syncPromise;
  }

  syncUserId = userId;
  syncPromise = (async () => {
    const localValue = parseStoredMaxHR(
      typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY)
    );
    const localOwner = readOwnerId();

    try {
      const remote = await authApi.getMaxHRPreference();
      if (remote.maxHR !== null) {
        writeStoredMaxHR(remote.maxHR, userId);
        updateSharedState({ maxHR: remote.maxHR, isDefault: false, ownerId: userId });
        return;
      }

      const canMigrateLocal = localValue !== null && (localOwner === null || localOwner === userId);
      if (canMigrateLocal) {
        await authApi.saveMaxHRPreference(localValue);
        writeStoredMaxHR(localValue, userId);
        updateSharedState({ maxHR: localValue, isDefault: false, ownerId: userId });
        return;
      }

      writeStoredMaxHR(null, null);
      updateSharedState({ maxHR: DEFAULT_MAX_HR, isDefault: true, ownerId: null });
    } catch {
      updateSharedState(readInitialState());
    } finally {
      if (syncUserId === userId) {
        syncPromise = null;
      }
    }
  })();

  return syncPromise;
}

export function useMaxHR() {
  const [state, setState] = useState<MaxHRState>(() => sharedState);

  useEffect(() => {
    const listener = (nextState: MaxHRState) => setState(nextState);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setMaxHR = useCallback(async (value: number) => {
    if (!Number.isFinite(value) || value < MIN_MAX_HR || value > MAX_MAX_HR) return;

    const previousState = sharedState;
    const ownerId = activeUserId ?? previousState.ownerId;
    writeStoredMaxHR(value, ownerId);
    updateSharedState({ maxHR: value, isDefault: false, ownerId });

    if (!activeUserId) return;

    try {
      await authApi.saveMaxHRPreference(value);
      writeStoredMaxHR(value, activeUserId);
      updateSharedState({ maxHR: value, isDefault: false, ownerId: activeUserId });
    } catch (error) {
      writeStoredMaxHR(previousState.isDefault ? null : previousState.maxHR, previousState.ownerId);
      updateSharedState(previousState);
      throw error;
    }
  }, []);

  const clearMaxHR = useCallback(async () => {
    const previousState = sharedState;
    writeStoredMaxHR(null, null);
    updateSharedState({ maxHR: DEFAULT_MAX_HR, isDefault: true, ownerId: null });

    if (!activeUserId) return;

    try {
      await authApi.clearMaxHRPreference();
    } catch (error) {
      writeStoredMaxHR(previousState.isDefault ? null : previousState.maxHR, previousState.ownerId);
      updateSharedState(previousState);
      throw error;
    }
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== OWNER_STORAGE_KEY) return;
      updateSharedState(readInitialState());
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return {
    maxHR: state.maxHR,
    isDefault: state.isDefault,
    setMaxHR,
    clearMaxHR,
  };
}
