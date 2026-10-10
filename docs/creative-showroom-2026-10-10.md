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
