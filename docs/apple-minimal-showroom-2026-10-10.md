# Minimal showroom — 10 October 2026

This increment follows the user’s latest direction: [Apple-inspired minimalism](https://www.apple.com/). It supersedes the bright colour treatment documented in [the earlier creative increment](creative-showroom-2026-10-10.md).

## Experience

White and soft grey surfaces, system typography, generous space and a restrained blue accent frame the dealership’s existing identity. Slim translucent navigation leads into a centred headline, short subtitle and wide vehicle photograph. Decorative stickers, colour bands, rolling text and shimmer effects are removed. Inventory cards use quiet grey surfaces; the connected workspace section uses charcoal product panels. Contact and downloads follow the same restrained system.

The featured-car selector still uses published inventory records, native keyboard/touch buttons, pressed states and a polite live region. Selection stays manual. Compare, inventory, vehicle details, contact and download routes retain their existing contracts. Responsive Next images, visible focus rings, reduced-motion support and footer contrast checks remain in place. The site uses original code and dealership branding; no Apple assets or new component dependencies were added. Existing interaction-reference attribution remains visible.

## Verification and deployment

This visual increment does not activate shared AWS/Aurora/Cognito/Redis services or close the broader production acceptance gaps.

PR #19 merged at `4b8df8b59ab0f4f13f5ad5756a0d8fadb7908930`. Full tree `79556511f69f95b028cccfeb27ef24a06576b212` matches tested candidate `5d418c4eeba2a42ad338def57b35992b2d44d49e`.

[Quality Gate 38031729368](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38031729368) passed lint, four application typechecks/builds, 27 security, 6 database/provisioning, 5 intelligence, 74 Chromium/mobile WebKit browser/API cases, 22 staff HTTP cases, and AWS/CDK synthesis. Existing keyboard selection and footer contrast checks passed. Local web typecheck and production build also passed. Palette calculations show white on the primary blue at 4.70:1, muted grey on soft grey at 5.57:1, and footer text at 7.26:1 or better. These targeted checks do not imply full accessibility certification.

[Browser evidence](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38031729368/artifacts/11662206342) was inspected for desktop and mobile showroom layouts and desktop downloads. ZIP SHA256: `efbfda8d8f573f9cbe088e4ce2afea0fe1536dad6a7f25160c765cc512cae274`. Lazy images below the viewport can remain unloaded in full-page captures. Reference stock uses labelled editorial demonstration photography, not certified photos of individual vehicles.

The web deployment `dpl_5oz6pbkSsPpm4RMarbxsFEAZKVfS` is READY from the merged software source. The [main preview](https://vandlabs-automobile-web-git-main-gaurav-7489s-projects.vercel.app/) is updated, with [this pinned deployment](https://vandlabs-automobile-7y1ygj9wk-gaurav-7489s-projects.vercel.app/) retaining the revision. Authenticated HTTP returned 200 and confirmed the minimal headline/subtitle and car-selector markup. Project inspection confirms SSO enabled for all deployments, preview target and `live: false`. Staff previews remain unchanged. The identical-tree main Quality Gate also runs automatically as [38032012024](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38032012024); acceptance above comes from the completed candidate gate. Later evidence commits change documentation only.

## Main-domain publication — 10 October 2026

At the user’s request, the public web app is deployed to https://vandlabs-automobile-web.vercel.app/. Production deployment `dpl_DusiWqWB7T1mwT1afwSbGq7icZRJ` is READY from then-current main `ec0221fff5c8ae7c921ee670d845b209bd9ce623`, including the tested Apple-inspired software and its delivery docs. The main software Quality Gate 38032012024 also passed all steps. The domain resolves to this exact deployment. Authenticated HTTP checks returned 200 for `/`, `/inventory`, `/contact`, `/download` and `/api/health`; the homepage contains the new minimal subtitle and reference notice. A scoped runtime error/fatal log count scan returned no groups after these requests; this is a smoke check, not load acceptance.

Production now explicitly uses `DATA_MODE=demo` and `NEXT_PUBLIC_PREVIEW_READ_ONLY=true`. Existing preview settings are preserved; SSO remains enabled for all deployments. This publishes the reference website on the main domain, without activating live backend writes or staff authentication. A deployment-only ignored-build override allowed this authorized publication. Staff apps and native code were unchanged. Subsequent documentation commits do not alter the deployed application behavior.
