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

## Phase 3: alive, liquid and immersive

- **Glass dashboard**: every panel is translucent with a bright top rim and a pointer-following light; ambient liquid light (three drifting radial blobs, leaning toward the pointer) sits behind the app. Blur is spent only where content scrolls or opens beneath (top bar, phone tab bar, dialogs, drawers, menus, toasts, the loading veil): panels sit over soft light only, where blur looks identical and cost 14 fps against 54 fps in headless software rendering. If a device still cannot keep up, the app drops all blur for the session (`data-glass="lite"`).
- **Physics and inertia** (`components/motion/motion.tsx`, one passive listener per event and one rAF loop that runs only while something moves): the light and background parallax ease toward the pointer; metric tiles tilt toward the cursor and spring back; primary buttons lean toward the cursor; scroll velocity decays like friction and the content layer leans into it by a few pixels, then settles. Scrolling itself is never hijacked.
- **Liquid controls**: tabs and the Theme and Motion switches use a pill that slides to the selection, stretching on the way (position and width ease differently) and settling with overshoot.
- **Press feedback everywhere**: every button, tab, nav item and menu item dips on press, springs back past rest and spreads a ripple from the touch point.
- **Entrances and loading**: pages rise in; panels pop in staggered; charts reveal as they scroll into view (scroll-driven animation where supported); charts are code-split and load after first paint (`charts-lazy.tsx`), photos are lazy, long tables use `content-visibility`. Following any internal link starts a liquid bar at the top; if the next page is slow, a glass veil covers the content area only (rail and top bar stay usable).
- **Off switches**: Motion control (profile menu and phone menu), the operating system's reduce-motion setting, `prefers-reduced-transparency` and `prefers-contrast: more` all remove the effects; touch-only devices skip the pointer effects.
- **Found and fixed on the way**: the theme init script was concatenated from a client-module export and threw on every page load (it now lives in `lib/init-scripts.ts`; the script had been working only while used alone); `content-visibility` on chart cards caused 8 px of horizontal overflow on phones; selected-state text on the liquid pill was 4.2:1 in light mode (now 4.5:1 or better); scroll-driven reveal on tall tables left their lower rows faint.
- **Verified** (local production build, headless Chromium without a GPU): `accessibility.spec.ts` 24 of 24 and `motion.spec.ts` 2 of 2; 52 to 53 fps while scrolling with the pointer moving, no script errors. Real-device frame rates, battery impact and touch feel were not measured.

### Settings skeleton and fluid

- `app/app/settings/[section]/loading.tsx` shows the real page's shape while a section loads: page head, the nine-item section list and a form card plus a list card in the real proportions, so nothing jumps. `FormSkeleton` and `ListSkeleton` (also used for API keys, business keys and the audit trail) replace the old "Loading…" text.
- Every skeleton in the app now flows like liquid: soft light bands move through each bar, stretching and skewing at different speeds, instead of a flat linear sweep. Static under reduced motion.
- Fluid highlight in the settings list: a droplet follows the pointer or keyboard focus (a fast leader and a slower follower merged by an SVG "goo" filter, so it stretches apart and re-merges), and flows back to the current section. Three metaballs drift behind the settings title. The filter touches only the decorative shapes, never text.
- Found by the extended accessibility run: the audit table scrolls on phones but had nothing keyboard-focusable; it is now a labelled, focusable region.
- Verified: accessibility 24 and motion 2 pass with the settings pages added (26 of 26); screenshots `settings-skeleton-{dark,light}.png`, `settings-fluid-{dark,light}.png`.

## Design references

21st.dev and Skiper UI could not be reviewed from this environment (no browsing of those sites, and their component licences must be checked per component before any code is copied). Nothing was copied from either; the glass treatment is original CSS.

## Verification

`tests/local-stack/accessibility.spec.ts` (run against a local production build): axe-core 4.13 with tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa on 3 public pages and 10 signed-in pages, in dark and light, at 1366 px and 390 px, plus the search sheet, profile menu and a form dialog; horizontal-overflow check at both widths; 8 visual-regression baselines (login and privacy page, both themes and widths; Linux Chromium only); theme persistence. 24 of 24 passed. Automated checks catch a subset of problems: keyboard and screen-reader walkthroughs, zoom and forced-colours review remain manual and were not done. The WebKit mobile project in `playwright.unified.config.ts` could not run here (browser not installed).

Screenshots: `docs/screenshots/theme-{dark,light}-*-{desktop,mobile}.png`.

## Theme change and desktop installers

- Theme changes run a 1100 ms circular wash (View Transitions API) that grows from the control that was pressed and covers the whole page. When the browser lacks the API, or motion is reduced, the theme switches immediately.
- A sun/moon `ThemeToggle` sits in the top bar and in the corner of the sign-in page. System / Light / Dark remains in the profile menu and the sign-in footer.
- `/install` detects the OS and lists Windows (`.exe`, `.msi`), macOS (`.dmg`, universal) and Linux (`.AppImage`, `.deb`, `.rpm`) installers from the rolling `desktop-latest` GitHub release, with `SHA256SUMS`. Override the host with `NEXT_PUBLIC_DESKTOP_DOWNLOAD_BASE`.
- Status: the installers have NOT been built in this sandbox and the CI workflows have not run yet. Builds are unsigned (SmartScreen/Gatekeeper warnings are expected until signing certificates are added). The release URL only works for signed-in GitHub users while the repository is private.

## Public showroom inside Intelligence

The former `apps/web` showroom now exists in `apps/intelligence` at `/showroom`, `/showroom/inventory` (server-side search, body, fuel and sort filters) and `/showroom/vehicles/[slug]`, on the same tokens, glass header, theme wash and motion as the workspace. Cross-links: sign-in page footer and profile menu link to the showroom; the showroom header links to dealer sign-in.

- It reads only the built-in sample catalogue (`@vandlabs/demo-data`), labelled as such on every page. It never reads tenant data (tenant tables are RLS-protected and there is no public tenant scope).
- It takes no enquiries: no public lead form was ported, consistent with the private-platform decision.
- Not ported: Discover (AI reels), Compare, Saved, Contact, Download. `apps/web` is untouched and still deployed separately.
- Pages are covered by the axe (desktop and phone, both themes) and visual-regression specs.
