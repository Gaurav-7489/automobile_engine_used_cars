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

## Phase 2: graphite and emerald, dark and light

- Tokens: dark is graphite (`#0b0e0d` canvas, `#131716` surface) with emerald `#34d399`; light is warm-neutral paper (`#f3f5f4`, white surfaces) with deeper emerald `#047857` so text keeps contrast. The theme follows the system until chosen; the choice (System / Light / Dark) is stored only in that browser, applied before first paint by an inline script, and available from the profile menu, the phone menu and the sign-in page. Soft backgrounds use `color-mix` on semantic tokens, so no hard-coded colour remains in components except vehicle placeholder art.
- Glass: floating chrome (menus, toasts, sheets, small dialogs, phone tab bar) and the sticky top bar are translucent with a 14 px blur; cards, tables and forms are solid with a 1-step shadow. A faint emerald ambient gradient sits behind the page on a pseudo-element (not on `body`, which broke contrast measurement). Solid fallback without `backdrop-filter`, and under `prefers-reduced-transparency` or `prefers-contrast: more`.
- Typography: Inter where installed, otherwise the system stack (no web font is downloaded; fewer requests, no layout shift); tabular numerals.
- Interaction system: `Button` loading and disabled-with-reason; `FormSummary` moves focus to new problems; toasts split into a polite status region (auto-dismiss) and an assertive alert region (stays until dismissed, optional Retry; network-failed saves offer Retry); `PanelSkeleton`, `TableSkeleton`, `KpiSkeleton` with a slow 1.8 s sweep, static under reduced motion; `RemotePanel` handles loading, refreshing, error with Retry and last-good data; `EmptyState` on every new list.
- Real defects found by the automated checks and fixed: dialogs did not take focus when opened (Escape did nothing until clicked), `aria-controls` pointed at absent elements, a menu contained non-menu items, and the ambient gradient made contrast unmeasurable.

## Design references

21st.dev and Skiper UI could not be reviewed from this environment (no browsing of those sites, and their component licences must be checked per component before any code is copied). Nothing was copied from either; the glass treatment is original CSS.

## Verification

`tests/local-stack/accessibility.spec.ts` (run against a local production build): axe-core 4.13 with tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa on 3 public pages and 10 signed-in pages, in dark and light, at 1366 px and 390 px, plus the search sheet, profile menu and a form dialog; horizontal-overflow check at both widths; 8 visual-regression baselines (login and privacy page, both themes and widths; Linux Chromium only); theme persistence. 24 of 24 passed. Automated checks catch a subset of problems: keyboard and screen-reader walkthroughs, zoom and forced-colours review remain manual and were not done. The WebKit mobile project in `playwright.unified.config.ts` could not run here (browser not installed).

Screenshots: `docs/screenshots/theme-{dark,light}-*-{desktop,mobile}.png`.
