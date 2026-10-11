# Frontend review and usability improvements — 12 October 2026

This increment preserves the Apple-inspired public showroom and the dealer/platform visual systems. It improves navigation, mobile inventory density, keyboard access and recovery states. Shared backend activation and the unfinished blueprint modules remain separate gates.

## Changes

- Compact public phone/tablet menu with active route and comparison count; dealership and Platform menus show the current section, expose every navigation destination and restore mobile sign-out. Native disclosure semantics work before hydration, close on route selection and dismiss with Escape while returning focus to the trigger. Desktop navigation remains visible at wide resolutions.
- Dealer inventory uses labelled cards on phones with expandable price/status/publication and detail controls, retaining the canonical table on larger screens. Safari staff-role selectors explicitly use the dark surface and readable text.
- Mobile inventory keeps search and quick collections visible, with full filters available on demand. Shareable URL values, filter chips, sorting, grid/list and shortlist behavior remain connected. Desktop retains visible filters. Mobile inputs use readable 16 px text and the shortlist tray respects safe-area spacing.
- Public skip-to-content focus target across all routes. Comparison tables provide a named keyboard-focusable scrolling region and a mobile scrolling hint/sticky attribute column.
- Enquiry failures distinguish invalid details/vehicle availability, rate limiting, temporary unavailability and an unknown network outcome. Entered data is retained, server internals are never displayed, a synchronous guard blocks overlapping submissions and a bounded request abort returns control without automatic retries. Success receives keyboard focus and uses a general request reference. Hosted read-only guards remain intact.
- Shared-link copy/fallback state clears after search/comparison changes and stale clipboard completions cannot overwrite a newer result. Vehicle cards explain missing photography; closing a gallery restores focus to its opener.
- Browser regressions cover public/dealer/Platform menus at phone/tablet/desktop widths, active route persistence, mobile sign-out form semantics, compact URL-backed filters, skip focus, comparison access, failure recovery, clipboard fallback freshness and every current staff section at a narrow viewport. Existing connected lead/sale, spreadsheet and authorization cases are retained. Public load/reload checks use accessible or visible locators so hidden streamed markup does not cause duplicate-selector failures.

## Acceptance and deployment

[PR #22](https://github.com/Gaurav-7489/automobile_engine_used_cars/pull/22) is merged at UI software commit `ed8a07ea6c996df46ef716505fe99d3358446f0f`. Its full tree `ddbebaa1a12d7949354e5759b38fc739c979f78f` equals accepted candidate `73a132407bfab6ff811304e0f54af0dd4d7cb045`.

[Candidate Quality Gate 38170101343](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38170101343) passed every step:

| Check | Result |
| --- | --- |
| Chromium and mobile WebKit browser/API | 98 passed |
| Staff HTTP access | 23 passed |
| Staff security | 27 passed |
| Database/parser | 10 passed |
| Intelligence/evidence | 5 passed |
| Lint, typecheck and four application builds | Passed |
| AWS infrastructure build and staging CDK synthesis | Passed |

[Native candidate 38170101335](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38170101335) passed Windows/macOS packaging and three Rust tests on each OS. Native UI is unchanged; this does not establish signed or installed live-backend acceptance.

[Browser artifact 11713407276](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38170101343/artifacts/11713407276) was downloaded with verified SHA256 `5800641304d2e3fb9984a9048d5bc119b28b3a0c79e83431c50eb7404b60b4e9`. Chromium/mobile WebKit mobile dealer cards and Platform forms, phone/tablet navigation, compact public inventory and wide desktop inventory screenshots were inspected. The earlier screenshots led to the inventory-card and Safari selector fixes. Earlier candidate failures in form-alert scoping and draft-refresh timing were corrected before the accepted run. Local browser downloads are unavailable in this workspace; browser acceptance ran through GitHub Actions.

The first merged-main run [38170550283](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38170550283) passed 97 browser cases and failed an older generic `h1` selector that matched visible and hidden streamed markup. Its accessibility snapshot shows one actual inventory heading. Follow-up test-only commit `2bb43d0ef068406c311672c167ddf1cef0575ea8` uses accessible level-one heading assertions and visible vehicle cards in responsive checks; it changes no application source. [Follow-up main Quality Gate 38170936231](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38170936231) passed every step on that exact commit: 98 browser/API, 23 staff HTTP and all lint/typecheck/security/database/intelligence/build/CDK checks. Do not count the failed first main run as green. Its replacement browser evidence is [artifact 11713309866](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38170936231/artifacts/11713309866); GitHub records SHA256 `77fdf9e81f9a79551217129950c524c2a46f60e39c4082c0fca4a1ed18aaafcd`.

Enquiry error cases simulate provider HTTP/network failures; they do not establish live provider/backend readiness. Connected demo browser/API cases establish persisted workflow behavior, including stock intake/edit/publication, lead creation and verified sale withdrawal.

## Published deployments

All three refreshed deployments are READY from UI software merge `ed8a07ea6c996df46ef716505fe99d3358446f0f`. Their stable aliases resolve to the exact deployment and source commit:

| App | Deployment | Stable URL |
| --- | --- | --- |
| Website production | `dpl_Hj6BEeVY15eS7KfkVvduzR2Woy4k` | https://vandlabs-automobile-web.vercel.app/ |
| Command Center protected preview | `dpl_8papSdYr6AAPWjPnQnFBzKaCjLVJ` | https://vandlabs-automobile-command-git-main-gaurav-7489s-projects.vercel.app/command |
| Platform protected preview | `dpl_DGGRPcWmqougb7GgYfWs3V2ftNW8` | https://vandlabs-automobile-platform-git-main-gaurav-7489s-projects.vercel.app/platform |

Authenticated HTTP checks returned 200 for public home, inventory with query values, comparison, contact, desktop download, health and both staff login pages. The five public page responses include the new menu and skip target. The enquiry fieldset remains disabled, and both staff pages explicitly report that sign-in/shared database setup is pending. These are page smoke checks, not live backend acceptance or anonymous-access certification. All projects retain SSO for all deployments and their existing read-only/authentication configuration. Deployment-only ignored-build overrides allowed the authorized refresh; permanent project build settings were not changed. Later test and delivery-document edits change no deployed application behavior.

## Remaining scope

The frontend is improved within the current implemented product. This is not full blueprint or production certification. Real AWS/Aurora/Cognito/tenant/Redis operation, S3 media uploads, licensed feeds, provider messaging, advanced AI, accounting/reversals, SaaS lifecycle and signed/installed native acceptance remain unfinished. Preserve the public browse-only and protected staff deployment configuration. See [shared staging setup](shared-staging-setup.md) and [completion register](source-of-truth-completion-register.md).
