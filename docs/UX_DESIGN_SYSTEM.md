# UX and design system

## State of the existing system

Intelligence already had: tokens in `app/globals.css`, a `Button` with `loading`/`loadingLabel`/`disabled`+reason that ignores clicks while busy, `Skeleton`/`PanelSkeleton`, `EmptyState`, a toast system, `FormSummary`, dialogs with unsaved-change guards, `prefers-reduced-motion` handling, and a mobile bottom navigation. This change builds on that rather than replacing it.

## Added

- Elevation tokens `--e1`…`--e4` and glass tokens (`--glass-bg`, `--glass-edge`, `--glass-blur`).
- Glass is used only on small floating chrome: menus, toasts, the phone tab bar, the search sheet and 480 px confirmation dialogs. Dense tables, long forms, charts and large dialogs stay solid. Blur is never nested and never full-screen.
- Fallbacks: solid surface where `backdrop-filter` is unsupported; solid under `prefers-reduced-transparency`; static skeleton under `prefers-reduced-motion`.
- Press feedback on buttons (transform only, 80 ms).
- `app/app/loading.tsx`: a page skeleton shaped like the real header, metric cards and panel, inside the persistent shell.
- Dealership creation button: "Create dealership" → "Creating dealership…"; password field hidden when a valid confirmation is held.
- Fixed KPI icon overlap on phones.

## Deliberately not done

- No new third-party component library. 21st.dev and Skiper UI were **not** inspected or integrated (no access from this environment, and licences must be reviewed first); nothing was copied.
- No light theme; the app is dark-only. Not a full redesign of every screen.
- A root-level `loading.tsx` was tried and reverted: it made the server commit a 200 status before `notFound()`/`redirect()`, turning real 404s into soft 404s.

## Visual QA

Screenshots in `docs/screenshots/` (login, overview, inventory, leads, reports at 1440 and 390; admin console and Add dealership dialog). Checked: no overflow, no clipping, dialog solid and readable once its 180 ms entrance finishes. No automated accessibility audit (axe/Lighthouse) was run.
