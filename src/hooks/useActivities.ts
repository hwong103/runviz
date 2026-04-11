import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { useAuth } from "@/hooks/useAuth"
import { activities as activitiesApi } from "@/services/api/activitiesApi"
import { memory as memoryApi } from "@/services/api/memoryApi"
import * as cache from "@/services/cache"
import type { Activity } from "@/types/activity"
import { isRun } from "@/types/activity"
import { parseActivityLocalDate } from "@/utils/activityDate"

interface SyncState {
  activities: Activity[]
  loading: boolean
  syncing: boolean
  error: string | null
  lastSync: Date | null
}

interface ActivitiesContextValue extends SyncState {
  sync: (options?: { forceFull?: boolean; silent?: boolean }) => Promise<void>
  getActivity: (id: number) => Promise<Activity | null>
  refresh: () => Promise<void>
}

const ActivitiesContext = createContext<ActivitiesContextValue | null>(null)

function activitySortTimestamp(activity: Activity): number {
  if (activity.start_date) {
    return new Date(activity.start_date).getTime()
  }
  return parseActivityLocalDate(activity.start_date_local).getTime()
}

function useActivitiesState(enabled: boolean): ActivitiesContextValue {
  const [state, setState] = useState<SyncState>({
    activities: [],
    loading: true,
    syncing: false,
    error: null,
    lastSync: null,
  })

  const hasInitialized = useRef(false)
  const syncInFlight = useRef(false)

  const loadCached = useCallback(async () => {
    try {
      const cached = await cache.getCachedActivities()
      const lastSync = await cache.getLastSyncDate()
      setState((prev) => ({
        ...prev,
        activities: cached,
        loading: false,
        lastSync,
      }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load cached data",
      }))
    }
  }, [])

  const sync = useCallback(async (options: { forceFull?: boolean; silent?: boolean } = {}) => {
    if (!enabled) return

    const silent = options.silent === true
    if (syncInFlight.current) {
      setState((prev) => (prev.syncing ? prev : { ...prev, syncing: true }))
      return
    }

    syncInFlight.current = true
    // Keep the very first background sync visibly active so initial sign-in reflects real progress.
    if (!silent) {
      setState((prev) => ({ ...prev, syncing: true, error: null }))
    } else {
      setState((prev) => ({
        ...prev,
        syncing: prev.lastSync === null,
        error: null,
      }))
    }

    try {
      const isFullSync = options.forceFull === true
      const currentActivities = await cache.getCachedActivities()
      let page = 1
      let hasMore = true
      const perPage = 200
      const newlyFetched: Activity[] = []

      while (hasMore && page <= 20) {
        const response = await activitiesApi.list(page, perPage)

        if (!response || !response.activities || !Array.isArray(response.activities)) {
          throw new Error("Sync failed. Unexpected API response.")
        }

        if (response.activities.length === 0) {
          hasMore = false
          break
        }

        const pageActivities = response.activities

        if (pageActivities.length > 0) {
          newlyFetched.push(...pageActivities)
        }

        if (!isFullSync) {
          const allKnown = pageActivities.every((activity: Activity) =>
            currentActivities.some((existing) => existing.id === activity.id)
          )

          if (allKnown && page > 1) {
            hasMore = false
          } else {
            page++
          }
        } else {
          page++
        }

        if (hasMore) await new Promise((resolve) => setTimeout(resolve, 200))
      }

      if (newlyFetched.length > 0) {
        const uniqueMap = new Map<number, Activity>()
        currentActivities.forEach((activity) => uniqueMap.set(activity.id, activity))
        newlyFetched.forEach((activity) => uniqueMap.set(activity.id, activity))

        await cache.cacheActivities(Array.from(uniqueMap.values()))
        await cache.setLastSyncDate(new Date())
      }

      const finalActivities = await cache.getCachedActivities()

      if (finalActivities.length > 0) {
        void (async () => {
          try {
            const status = await memoryApi.status()
            const runs = finalActivities.filter(isRun)
            const activitiesToIndex = status.lastIndexedDate
              ? runs.filter(
                  (activity) =>
                    activity.start_date_local.split("T")[0] > status.lastIndexedDate!
                )
              : runs

            if (activitiesToIndex.length === 0) {
              return
            }

            const totals = runs.reduce(
              (acc, activity) => {
                acc.distance += activity.distance
                acc.time += activity.moving_time
                return acc
              },
              { distance: 0, time: 0 }
            )
            const medianPaceSecPerM =
              totals.distance > 0 && totals.time > 0 ? totals.time / totals.distance : 0

            if (medianPaceSecPerM <= 0) {
              return
            }

            await memoryApi.index(activitiesToIndex, medianPaceSecPerM)
          } catch (error) {
            console.warn("Activity memory indexing failed (non-critical):", error)
          }
        })()
      }

      setState({
        activities: finalActivities.sort(
          (a, b) => activitySortTimestamp(b) - activitySortTimestamp(a)
        ),
        loading: false,
        syncing: false,
        error: null,
        lastSync: new Date(),
      })
    } catch (err) {
      console.error("Sync failed:", err)
      setState((prev) => ({
        ...prev,
        syncing: false,
        error: err instanceof Error ? err.message : "Sync failed",
      }))
    } finally {
      syncInFlight.current = false
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      hasInitialized.current = false
      setState({
        activities: [],
        loading: false,
        syncing: false,
        error: null,
        lastSync: null,
      })
      return
    }

    if (hasInitialized.current) return
    hasInitialized.current = true

    const init = async () => {
      await loadCached()
      await sync({ silent: true })
    }

    void init()
  }, [enabled, loadCached, sync])

  const getActivity = useCallback(async (id: number): Promise<Activity | null> => {
    const cached = await cache.getCachedActivity(id)
    if (cached) return cached

    try {
      return await activitiesApi.get(id)
    } catch {
      return null
    }
  }, [])

  return useMemo(
    () => ({
      ...state,
      sync,
      getActivity,
      refresh: loadCached,
    }),
    [state, sync, getActivity, loadCached]
  )
}

export function ActivitiesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, needsStravaConnect } = useAuth()
  const value = useActivitiesState(isAuthenticated && !needsStravaConnect)

  return createElement(ActivitiesContext.Provider, { value }, children)
}

export function useActivities() {
  const context = useContext(ActivitiesContext)
  if (!context) {
    throw new Error("useActivities must be used within an ActivitiesProvider")
  }
  return context
}
