# Connected public experience — 10 October 2026

This increment expands every public discovery page while retaining the Apple-inspired minimal visual system. White/soft grey surfaces, clear typography and blue accents remain the foundation. Original Skiper/21st-inspired CSS interactions add motion without a new animation runtime.

## Connected behavior

- A tenant/dealership-scoped, versioned browser shortlist stores up to three published vehicle IDs. Home cards, the featured hero, inventory, vehicle detail and comparison share that state. A floating tray and navigation count expose the next step. Storage failures keep the current visit usable; invalid IDs are discarded.
- Inventory supports search, body/fuel/make/studio/budget filters, availability and first-owner switches, sorting, saved-only discovery, resettable filter chips and grid/list views. URL parameters restore the view after reload and allow sharing without saving personal information.
- Comparison supports adding/removing cars, clear selection, photo cards, differences-only specifications, asking-price range/gap, listed features and a shareable URL. No synthetic scores, finance estimates or valuation claims are introduced. Empty comparison offers a real published-vehicle picker.
- Contact carries valid vehicle/shortlist parameters into intent cards and the form. The visitor can choose a primary available vehicle, a general question, test drive, finance discussion or exchange discussion. The complete bounded shortlist is sent as vehicle IDs and preserved in the lead record and journey history. The primary car must be available; all interests must be published in the active dealership. Unknown IDs and more than three combined interests are rejected before persistence.
- Vehicle detail adds a responsive gallery with native image expansion, keyboard/Escape/focus behavior, sharing, shortlist controls, contextual test-drive/finance/exchange links, specification navigation and related available vehicles.
- Desktop downloads add a keyboard-accessible product tour with published inventory, an explicitly illustrative lead workflow and a workspace URL format checker. The checker attempts no network connection or sign-in. Real release-derived installer routes, checksums, unsigned-development disclosures and activation requirements remain intact.

## Presentation and motion

Navigation marks the current page. Product cards, form intents, comparison panels, studio cards, installer sections and FAQs follow a shared layout system. Scroll reveals preserve opaque readable content; a single route observer disconnects on navigation. Soft pointer spotlight cards, hover shimmer, tab transitions, image transitions and the shortlist tray respect reduced motion. No autoplay or blocking preloader is added. Visible Skiper/21st reference attribution is retained; no premium component source is used.

Server data fetching uses the existing request-scoped inventory deduplication. Root/client catalogs contain only public fields; comparison receives only its required fields and first image. Independent release/inventory reads run in parallel. Existing backend authorization, public origin/body limits, rate limiting and tenant scope remain in effect.

## Hosting limits

The main domain remains a protected read-only reference deployment until shared AWS/Aurora/Cognito/Redis activation. Discovery, shortlist, comparison, gallery and product-tour interactions work there. Contact forms are visible but disabled with an explicit notice; no fake enquiry or appointment confirmation is shown. The live local/shared adapter still supports the real lead handoff tested below. Native code and staff applications are unchanged by this public website increment.

## Verification

PR [#20](https://github.com/Gaurav-7489/automobile_engine_used_cars/pull/20) is merged at software commit `163f34828816e4d2b0349641c7845b0b22f9ddc5`. Tested candidate `ffee4f66337f899a42f7ad73b51e947abb69f1dc` and the merge share full tree `d6b11e3fd7a6cc827375414ca48fdf199a9531c2`.

[Quality Gate 38035412278](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38035412278) passed lint, all four application typechecks/builds, 27 security, 6 database/provisioning, 5 intelligence, 82 Chromium/mobile WebKit browser/API and 22 staff HTTP cases, plus AWS/CDK synthesis. The eight new browser cases cover URL-filter restoration, three-car persistence/capacity, complete comparison-to-lead handoff, unpublished/over-limit rejection, keyboard tour controls, gallery Escape/focus return and responsive/reduced-motion behavior across five pages. Legacy vehicle-intake assertions now distinguish the primary vehicle heading from related cars. Accessible control locators avoid transient hidden copies in streamed HTML.

The accepted [browser artifact 11664001372](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38035412278/artifacts/11664001372) has SHA256 `76d427a42195519a6bc993433125fd69009c90b5eed31a00722b5929aa1630b4`. Desktop/mobile inventory, comparison, contact, desktop download and vehicle screenshots were inspected across the final layout revisions. The exact accepted artifact was reviewed again for inventory, comparison, contact and desktop downloads. CI browsers were used because the managed local container has no supported browser automation runtime. Local web typecheck and production build passed; complete lint acceptance comes from CI's pinned dependencies.

Native code and staff UI were not modified, and this gate does not certify full live-cloud operation or installed native clients.

Fresh merged-main [Quality Gate 38035733335](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38035733335) also passed every step on the identical software tree.

## Main-domain publication

Production deployment `dpl_FvooM1B8mLiB5TQTbA52ns341xQL` is READY from software merge `163f34828816e4d2b0349641c7845b0b22f9ddc5`. The deployment looked up by [vandlabs-automobile-web.vercel.app](https://vandlabs-automobile-web.vercel.app/) resolves to that exact ID and source. Pinned deployment: https://vandlabs-automobile-5234imgr1-gaurav-7489s-projects.vercel.app/.

Authenticated HTTP checks returned 200 for `/`, `/inventory`, `/compare?ids=veh-1,veh-2`, `/contact?ids=veh-1,veh-2&intent=exchange`, `/download` and `/vehicles/bmw-330li-2024`. The returned pages contain the connected inventory tools, differences-only comparison, contact workspace, desktop tour and gallery. All retain the reference notice. Both contact and vehicle enquiry fieldsets are disabled, as required by the existing read-only hosted configuration. A scoped error/fatal runtime log-count scan returned no groups after these requests; this is a smoke check, not load acceptance.

Existing `DATA_MODE=demo`, `NEXT_PUBLIC_PREVIEW_READ_ONLY=true` and SSO protection remain in place. A deployment-only ignored-build override was used for the user-authorized production publication. No shared service was provisioned, no native binary was changed and no live enquiry was submitted. Subsequent evidence commits change documentation only.
