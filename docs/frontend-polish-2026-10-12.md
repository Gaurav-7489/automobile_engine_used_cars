# Frontend review and usability improvements — 12 October 2026

This increment preserves the Apple-inspired public showroom and the dealer/platform visual systems. It improves navigation, mobile inventory density, keyboard access and recovery states. Shared backend activation and the unfinished blueprint modules remain separate gates.

## Changes

- Compact public phone/tablet menu with active route and comparison count; dealership and Platform menus show the current section, expose every navigation destination and restore mobile sign-out. Native disclosure semantics work before hydration, close on route selection and dismiss with Escape while returning focus to the trigger. Desktop navigation remains visible at wide resolutions.
- Mobile inventory keeps search and quick collections visible, with full filters available on demand. Shareable URL values, filter chips, sorting, grid/list and shortlist behavior remain connected. Desktop retains visible filters. Mobile inputs use readable 16 px text and the shortlist tray respects safe-area spacing.
- Public skip-to-content focus target across all routes. Comparison tables provide a named keyboard-focusable scrolling region and a mobile scrolling hint/sticky attribute column.
- Enquiry failures distinguish invalid details/vehicle availability, rate limiting, temporary unavailability and an unknown network outcome. Entered data is retained, server internals are never displayed, a synchronous guard blocks overlapping submissions and a bounded request abort returns control without automatic retries. Success receives keyboard focus and uses a general request reference. Hosted read-only guards remain intact.
- Shared-link copy/fallback state clears after search/comparison changes and stale clipboard completions cannot overwrite a newer result. Vehicle cards explain missing photography; closing a gallery restores focus to its opener.
- Browser regressions cover public/dealer/Platform menus at phone/tablet/desktop widths, active route persistence, mobile sign-out form semantics, compact URL-backed filters, skip focus, comparison access, failure recovery, clipboard fallback freshness and every current staff section at a narrow viewport. Existing connected lead/sale, spreadsheet and authorization cases are retained. Public load/reload checks use accessible or visible locators so hidden streamed markup does not cause duplicate-selector failures.

## Acceptance and deployment

Exact-revision CI, desktop/mobile visual evidence, deployment state and source commit will be recorded here after validation. Local browser downloads are unavailable in this workspace, so full Chromium/mobile WebKit acceptance runs through the repository Quality Gate. Enquiry error cases simulate provider HTTP/network failures; they do not establish live provider/backend readiness. Connected demo browser/API cases establish persisted workflow behavior.

## Remaining scope

The frontend is improved within the current implemented product. This is not full blueprint or production certification. Real AWS/Aurora/Cognito/tenant/Redis operation, S3 media uploads, licensed feeds, provider messaging, advanced AI, accounting/reversals, SaaS lifecycle and signed/installed native acceptance remain unfinished. Preserve the public browse-only and protected staff deployment configuration. See [shared staging setup](shared-staging-setup.md) and [completion register](source-of-truth-completion-register.md).
