# Creative showroom — 10 October 2026

This increment responds to the request for a colourful, more creative public website and the uploaded screenshot's accessibility warnings.

## Experience

Midnight navy anchors the navigation, photographic hero and footer. Electric lime marks the primary action and collection strip; lavender frames inventory; coral highlights the discovery section; blue, lime and pink distinguish the three connected-product cards. The closing conversation section uses a periwinkle background and clear enquiry action. Public inventory, comparison, contact, vehicle detail and installer routes retain their existing behavior.

The hero has a three-car selector sourced from real published featured records. Native buttons support touch and keyboard; pressed states identify the current choice, and a polite live region announces the selected vehicle. It does not advance automatically. Empty inventory remains supported. Only the fields and first image needed for this interaction are serialized to the client.

## Interaction references and attribution

- [Skiper UI CssLink, free component](https://skiper-ui.com/v1/skiper40): lightweight CSS hover-link patterns. This repository implements its own rolling text/arrow treatment with Next links. The site footer retains visible Skiper UI attribution. No premium source or license key is used.
- [21st.dev](https://21st.dev/) and its [spotlight guidance](https://news.21st.dev/blog/react-spotlight-effect-components): original spotlight cards and a hover-triggered shimmer CTA. Pointer updates use CSS properties, not React state. No runtime component library or animation package was added.

Transform-based transitions and hover effects respect reduced motion. Content stays fully opaque during entry, avoiding partially faded text in screenshots. Existing lazy/responsive Next images are retained.

## Accessibility and verification

Footer text colours are explicitly scoped to the dark surface; labels, links and attribution have readable contrast. The hosted reference notice now uses a status div instead of an incompatible aside role. Preview-only disabled contact actions expose a disabled link role. Focus rings and native button keyboard behavior are retained.

The browser regression checks featured selection by Space/Enter, pressed states and selected vehicle details, footer text contrast of at least 4.5:1, existing phone/mobile overflow and the full connected product flows. Exact CI and protected deployment evidence are recorded in the active checkpoint after verification. Full WCAG certification is not implied by this targeted repair.

This increment changes the public website and its browser checks. AWS/Aurora/Cognito/Redis activation and the wider blueprint acceptance gaps remain unchanged.

## Verified delivery

PR #18 merged at `9de26cca8865a2c007e12719423684e7ea1e30d1`, with full tree `394028123d858ec998b4f65eb092b65b5303c678` identical to tested candidate `2439d1e5990e76d95018ff3c71e94278cd315dbb`. [Quality Gate 38024643071](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38024643071) passed lint, four application typechecks/builds, 27 security, 6 database/provisioning, 5 intelligence, 74 browser/API and 22 staff HTTP cases, and AWS/CDK synthesis. Both new keyboard/contrast cases passed. The logs also contain AbortError messages; passing these checks does not establish production provider or load acceptance.

[Browser screenshots](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38024643071/artifacts/11660207393) were inspected at desktop/mobile sizes. The artifact ZIP digest is `1ea326b3aaac075eaa98376c2ac7337a476a5b973ed1e62ef92635d1e9b975c4`. Full-page screenshots can include unloaded lazy images below the viewport; images load as those cards enter the viewport.

The web deployment is READY from the merged source, with SSO protection retained. The [main preview](https://vandlabs-automobile-web-git-main-gaurav-7489s-projects.vercel.app/) is updated; [pinned deployment](https://vandlabs-automobile-83wygf6i5-gaurav-7489s-projects.vercel.app/) retains this revision. Authenticated HTTP checks returned 200 and confirmed the featured selector, new sections and interaction attribution. The two staff previews remain as recorded in the previous distribution guide.
