# Public-site SEO and link acquisition

## Code changes

Public routes now have distinct titles, descriptions, canonical URLs and Open Graph metadata. A real 1200×630 PNG social image route is available. Vehicle pages retain schema and include URLs, brand, model and photographs. Homepage AutoDealer schema remains based on configured dealership facts; no ratings or reviews are invented. robots.txt uses the configured site origin, and sitemap.xml includes home, inventory, compare, contact, download and published vehicle URLs. Public indexing is enabled by default independently of read-only demo mode; use `SEO_INDEXABLE=false` only for an intentionally non-indexed staging site. Staff surfaces stay private and carry noindex.

Every public route is covered by the HTTP SEO regression: one H1, no heading-level skips, description, canonical, social image and resolvable internal page destinations. Decorative thumbnail images intentionally have empty alt text; main vehicle photos have descriptive fallbacks. External destinations must also be manually checked before cutover, particularly dealer phone/WhatsApp, actual release assets and any changed campaign links. Existing slugs remain stable; the gateway normalizes trailing slashes without rewriting vehicle identities. Unsplash reference images use source-side responsive widths and compression; R2 accepts compressed WebP/AVIF assets. Production inventory should use actual licensed vehicle photographs and accurate alt descriptions.

Set the real `TENANT_CONFIG_JSON` branding, canonical origin, contact details and city information. Do not submit an example.com sitemap or advertise sample inventory as real stock. Title/description wording should be reviewed against the live dealership's location and services once those facts are configured.

## Google Search Console

This session did not verify a Google property. GitHub access is not Search Console access.

1. Open Google Search Console in the authorized Google account; add the real domain property.
2. Install the exact Google-issued TXT verification record in that domain's Cloudflare DNS zone. Preserve existing mail/domain records.
3. Click Verify and confirm the property is verified. The code also supports URL-prefix verification through the `GOOGLE_SITE_VERIFICATION` meta token if that verification method is chosen.
4. Submit the real `/sitemap.xml`, inspect the homepage and one available vehicle URL, confirm canonical/indexing status, and review HTTPS/mobile/Core Web Vitals reports.
5. If changing the domain rather than only the host, plan redirects and Search Console migration separately. A hosting change alone does not imply a new domain.

## 90-day backlink and content plan

| Period | Work | Evidence / measure |
|---|---|---|
| Weeks 1–2 | Verify dealership business details; update Google Business Profile and legitimate local business directories; align website/contact links | Correct business name, address, phone and working URL; baseline referring domains and local impressions |
| Weeks 3–4 | Publish accurate city-specific buying, finance-process and exchange guides based on dealer services; build internal links from relevant vehicle/contact pages | Published useful pages, crawlable links, no invented approvals or finance promises |
| Month 2 | Request relevant links from existing partners, authorized dealer/manufacturer directories and genuine local automotive associations | Partner page URL, source relevance, referral visits and enquiries |
| Month 2–3 | Prepare a real dealership case study and a useful local stock/buyer research resource from permissioned aggregated data | Documented facts; no customer personal data; editorial coverage or earned links |
| Ongoing | Monitor broken links, sold vehicle handling, search queries, referring-domain quality and conversions | Weekly issue log; monthly enquiry and appointment attribution |

Maintain an outreach sheet with organization, legitimate contact, relevant source page, proposed useful resource, status, live link and referral result. Have the founder approve any external outreach and factual case study before sending. No outreach was sent and no backlinks were purchased or created by this code change. Avoid mass directory submissions, fabricated reviews and bulk purchased links. Track qualified enquiries and test-drive bookings alongside rankings; do not promise a ranking outcome.

Internal links already connect inventory, vehicle detail, compare, enquiry, finance/exchange intents and desktop downloads. Add location/service content only when the business has accurate details and enough useful content to support separate pages.
