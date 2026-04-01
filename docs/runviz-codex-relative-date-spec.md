# RunViz UI Changes — Codex Instruction Doc

Three changes in this task:
1. **Relative date filter toggle** — add 30d / 90d / 365d filter modes alongside the existing Year/Month controls
2. **Move Sync button to sidebar footer** — remove from header, add sync icon button near the avatar section
3. **Running man animation for sync state** — replace avatar with looping video while syncing

Work entirely within the existing file set. Do not restructure the project or install new packages.

---

## Change 1 — Relative date filter modes

### Context

`ViewPeriod` is defined in `src/lib/dashboard.ts`:

```ts
export interface ViewPeriod {
  mode: "all" | "year" | "month"
  year: number
  month: number | null
}
```

The filter controls live in `App.tsx` inside the `headerActions` prop passed to `<AppShell>`. Currently there is a `ToggleGroup` with `All / Year / Month` and a `PeriodComboButton` for year/month picking.

Activities are filtered in the `filteredActivities` `useMemo` in `App.tsx` which switches on `viewPeriod.mode`.

### Task

**Step 1 — Extend `ViewPeriod` in `src/lib/dashboard.ts`**

Add three new modes to the `mode` union:

```ts
export interface ViewPeriod {
  mode: "all" | "year" | "month" | "30d" | "90d" | "365d"
  year: number
  month: number | null
}
```

**Step 2 — Update `filteredActivities` filter logic in `App.tsx`**

In the `useMemo` that produces `filteredActivities`, add cases for the new modes:

```ts
if (viewPeriod.mode === '30d') {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  return date >= cutoff;
}
if (viewPeriod.mode === '90d') {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  return date >= cutoff;
}
if (viewPeriod.mode === '365d') {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 365);
  return date >= cutoff;
}
```

Note: `date` is already computed as `parseActivityLocalDate(a.start_date_local)` inside the memo.

**Step 3 — Update `describeViewPeriod` in `App.tsx`**

Add labels for the new modes:

```ts
if (viewPeriod.mode === '30d') return 'Last 30 days';
if (viewPeriod.mode === '90d') return 'Last 90 days';
if (viewPeriod.mode === '365d') return 'Last 365 days';
```

**Step 4 — Update the filter UI in `App.tsx`**

Replace the existing filter controls section (the `ToggleGroup` + `PeriodComboButton` block) with a two-row arrangement:

- **Row A** — a mode selector that lets the user switch between "Relative" and "Calendar" filter styles. Implement this as a small segmented control / toggle with two options: `Relative` and `Calendar`.
- **Row B (Relative mode)** — show a `ToggleGroup` with three items: `30d`, `90d`, `365d`. Default to `90d` when switching into relative mode.
- **Row B (Calendar mode)** — show the existing `All / Year / Month` `ToggleGroup` and the `PeriodComboButton` unchanged.

Add local state in `App.tsx` to track the filter style:

```ts
const [filterStyle, setFilterStyle] = useState<'relative' | 'calendar'>('relative');
```

When switching from calendar → relative, set `viewPeriod` to `{ mode: '90d', year: viewPeriod.year, month: viewPeriod.month }`.
When switching from relative → calendar, set `viewPeriod` to `{ mode: 'year', year: new Date().getFullYear(), month: new Date().getMonth() }`.

The mode-selector toggle should visually match the existing `ToggleGroup` style used in the app (`variant="outline"`), keeping it compact. Label it clearly: `Relative` | `Calendar`.

---

## Change 2 — Move Sync button to sidebar footer

### Context

The Sync button currently lives in `App.tsx` inside `headerActions`:

```tsx
<Button
  type="button"
  variant="outline"
  onClick={() => sync({ forceFull: true })}
  disabled={syncing}
  className="h-8 justify-center gap-2 px-3 sm:min-w-[96px]"
>
  {syncing ? (
    <RefreshCw className="size-4 animate-spin" />
  ) : (
    <ReloadIcon className="h-4 w-4" />
  )}
  {syncing ? 'Syncing' : 'Sync'}
</Button>
```

The sidebar footer is in `src/components/layout/app-shell.tsx`. It currently renders:
- An avatar card (athlete image + name + status text)
- A row of icon buttons: `ThemeToggle`, `Settings`, `Logout`

`AppShell` receives `onLogout` as a prop. Sync state and the sync function currently live only in `App.tsx`.

### Task

**Step 1 — Add sync props to `AppShellProps` in `app-shell.tsx`**

```ts
interface AppShellProps {
  // ... existing props
  syncing?: boolean
  onSync?: () => void
}
```

**Step 2 — Add a sync icon button to the sidebar footer button row in `app-shell.tsx`**

In the `grid grid-cols-[minmax(0,1fr)_auto_auto]` row (which holds ThemeToggle, Settings, Logout), expand it to accommodate a fourth icon button. Change the grid to `grid-cols-[minmax(0,1fr)_auto_auto_auto]`.

Add the sync button before the Settings button:

```tsx
{onSync ? (
  <Button
    variant="outline"
    size="icon"
    onClick={onSync}
    disabled={syncing}
    className="size-11 rounded-xl"
    aria-label="Sync activities"
  >
    <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
  </Button>
) : null}
```

Import `RefreshCw` from `lucide-react` at the top of `app-shell.tsx`.

**Step 3 — Pass sync props from `App.tsx` to `<AppShell>`**

In the `<AppShell ...>` usage in `App.tsx`, add:

```tsx
syncing={syncing}
onSync={() => sync({ forceFull: true })}
```

**Step 4 — Remove the Sync button from `headerActions` in `App.tsx`**

Delete the `<Button>` for sync from the `headerActions` block. The surrounding `grid gap-2 sm:grid-cols-[auto_auto_auto]` div should become `grid gap-2 sm:grid-cols-[auto_auto]` (two columns instead of three, since sync is gone).

Also remove the `ReloadIcon` import from `@radix-ui/react-icons` if it is no longer used elsewhere. Keep `RefreshCw` from `lucide-react` if it is used anywhere else in `App.tsx`; remove it too if this was its only usage.

---

## Change 3 — Running man animation for sync state

### Context

Two video asset pairs have been prepared and should be placed in `public/`:

- `public/running-man.webm` + `public/running-man.mp4` — light mode (black lineart on white)
- `public/running-man-dark.webm` + `public/running-man-dark.mp4` — dark mode (white lineart on black)

The avatar in the sidebar footer is rendered in `app-shell.tsx` using the shadcn `<Avatar>` component:

```tsx
<Avatar size="lg">
  {athleteImage ? (
    <AvatarImage src={athleteImage} alt={athleteName ?? "Athlete"} />
  ) : null}
  <AvatarFallback>
    {athleteName?.slice(0, 1).toUpperCase() ?? "R"}
  </AvatarFallback>
</Avatar>
```

Theme is resolved via `useTheme` from `src/hooks/useTheme.ts`. It exports `{ preference, resolved, setTheme }` where `resolved` is `'light' | 'dark'`.

### Task

**Step 1 — Add video assets to `public/`**

Copy the four files produced by the conversion step into `public/`:
- `public/running-man.webm`
- `public/running-man.mp4`
- `public/running-man-dark.webm`
- `public/running-man-dark.mp4`

**Step 2 — Update `app-shell.tsx` to swap avatar for the running man during sync**

Import `useTheme` at the top of `app-shell.tsx`:

```ts
import { useTheme } from "@/hooks/useTheme"
```

Inside the `AppShell` component body (before the return), call:

```ts
const { resolved: resolvedTheme } = useTheme()
```

Replace the `<Avatar>` block in the sidebar footer with conditional rendering:

```tsx
<div className="relative size-10 shrink-0 overflow-hidden rounded-full">
  {syncing ? (
    <video
      key={resolvedTheme}
      autoPlay
      loop
      muted
      playsInline
      className="absolute inset-0 h-full w-full object-cover"
    >
      <source
        src={resolvedTheme === 'dark' ? '/running-man-dark.webm' : '/running-man.webm'}
        type="video/webm"
      />
      <source
        src={resolvedTheme === 'dark' ? '/running-man-dark.mp4' : '/running-man.mp4'}
        type="video/mp4"
      />
    </video>
  ) : (
    <Avatar size="lg" className="size-10">
      {athleteImage ? (
        <AvatarImage src={athleteImage} alt={athleteName ?? "Athlete"} />
      ) : null}
      <AvatarFallback>
        {athleteName?.slice(0, 1).toUpperCase() ?? "R"}
      </AvatarFallback>
    </Avatar>
  )}
</div>
```

The `key={resolvedTheme}` on the `<video>` ensures the element remounts and picks up the correct source when the theme changes mid-sync.

**Step 3 — Crossfade transition (optional polish)**

If you want a smooth swap rather than a hard cut, wrap both branches in a parent with `transition-opacity duration-300` and toggle `opacity-0`/`opacity-100`. Only do this if it does not complicate the implementation significantly.

---

## File change summary

| File | Changes |
|------|---------|
| `src/lib/dashboard.ts` | Extend `ViewPeriod.mode` union with `'30d' \| '90d' \| '365d'` |
| `src/App.tsx` | Add `filterStyle` state; update filter UI; update `filteredActivities` memo; update `describeViewPeriod`; pass `syncing`/`onSync` to `AppShell`; remove Sync button from `headerActions`; clean up unused imports |
| `src/components/layout/app-shell.tsx` | Add `syncing` + `onSync` props; add sync icon button to footer row; conditionally render running man video vs avatar; import `useTheme` + `RefreshCw` |
| `public/running-man.webm` | New asset |
| `public/running-man.mp4` | New asset |
| `public/running-man-dark.webm` | New asset |
| `public/running-man-dark.mp4` | New asset |

## Verification checklist

- [ ] Switching to "Relative" mode and selecting 30d / 90d / 365d filters activities correctly
- [ ] Switching back to "Calendar" mode restores Year / Month / All behaviour
- [ ] Sync icon button appears in the sidebar footer and triggers sync on click
- [ ] Sync button is gone from the page header
- [ ] Avatar is replaced by the running man video while `syncing === true`
- [ ] Video source switches correctly between light and dark themes
- [ ] Avatar returns when sync completes
- [ ] No TypeScript errors (`tsc --noEmit`)
