# Premium experience and desktop distribution — 9 October 2026

This increment continues the **Completed work and docs** request. It upgrades the reference product's interface and implements automated development installer distribution. It does not claim full blueprint or live production acceptance.

## Product changes

- Public showroom: photographic hero, editorial typography, vehicle callout, inventory cards, spotlight feature cards, responsive layouts and Windows/macOS download entry points.
- Command Center: redesigned dealer workspace, active route navigation with accessible icons, improved metrics, lead/task/pipeline/table treatments and explicit authentication configuration states.
- Platform: redesigned control workspace, current-page navigation and clear integration/reference states. Existing permissions and tenant boundaries remain enforced.
- Desktop: matching dealer visual system; users enter one workspace URL and choose **Connect workspace**, then **Sign in securely**. Advanced manual settings remain available. Tokens remain in the OS credential store.
- Original CSS-based motion and pointer spotlight interactions draw on the interaction patterns seen in 21st.dev. No copied paid component code or added animation runtime. Motion respects the user's reduced-motion preference. Public pages remain server-rendered; pointer movement updates CSS properties instead of React state.

## Automatic installer delivery

1. A push to main runs Quality Gate. Failed gates publish nothing.
2. After a successful main push gate, `desktop-release.yml` checks out that exact commit. Windows and universal macOS runners run frontend typecheck, Rust regressions and native packaging.
3. Only after both builds succeed, a narrowly scoped publish job creates a development prerelease `desktop-<12-char-source-sha>` with fixed installer names and `SHA256SUMS.txt`.
4. `/download` resolves complete published releases from the fixed repository. It verifies tag/source binding, asset names, uploaded state and exact GitHub URLs. Both operating systems must exist. Release metadata is cached for five minutes; redirects are cached for one minute. Provider failure shows a pending state, never a fabricated download.
5. `/api/downloads/windows` and `/api/downloads/mac` redirect to the current verified installer. The first release appears after the merged main gate and both native builds finish. Previously published prereleases are retained with immutable asset names.

These builds are **unsigned development distributions**. Code signing, notarization and installed-device acceptance remain open. There is no native auto-updater in this increment. Downloading a new release and installing it is the current update path.

## Workspace discovery

`GET /command/api/desktop-config` exposes only public HTTPS workspace/sign-in origins and the public native client ID when `AUTH_MODE=cognito`, `DATA_MODE=aurora`, `APP_ORIGIN`, `COGNITO_DOMAIN` and `COGNITO_DESKTOP_CLIENT_ID` are configured. Otherwise it returns 503. This endpoint is intentionally public; it exposes no secret, staff grant, database setting or operational record.

The native client fetches a bounded response without following redirects, verifies HTTPS and same-origin binding, then uses its existing PKCE/system-browser flow. Accepting a public discovery response does not bypass verified-token authorization. Add the native public client ID to `COGNITO_CLIENT_IDS` on the API; enable the existing loopback callback in Cognito. Discovery and installed login still require acceptance against the activated cloud environment.

## Public protection and performance

- Lead JSON bodies are capped at 16 KiB; event bodies at 8 KiB. Content type, object shape, string fields and browser origin are checked before writes. Malformed bodies return controlled responses.
- Known clients have 12 lead submissions and 240 events per minute. Unknown clients share a bounded bucket with at least 120 requests per minute. IPs are hashed in provider keys. Arbitrary forwarded IPs are ignored unless running on Vercel or an explicitly trusted, sanitizing proxy.
- Shared Aurora/hosted writes require `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in secure server configuration. An atomic Redis script increments and expires counters across instances. Missing configuration, timeout or provider errors fail closed with 503; excessive requests return 429 and Retry-After. The bounded in-process fallback is only for the local reference runtime. Configure namespace per environment and tenant-specific scope. This adapter requires live provider verification; local mocked-provider tests do not prove a deployed Redis service.
- Security headers deny embedding, object plugins and off-origin base URLs; disable unnecessary device permissions and MIME sniffing. This is a baseline header policy, not a strict nonce-based script CSP or full security certification.
- Request-scoped inventory deduplication avoids repeated public stock reads without caching tenant records across requests. Known editorial image hosts use Next image sizing/AVIF/WebP; other approved vehicle image origins retain the existing unoptimized delivery path. Staff/private records use no-store responses.
- No load balancer, Redis service, AWS infrastructure or production observability was provisioned in this increment. Existing Vercel hosting and AWS network/operations acceptance remain as documented in `shared-staging-setup.md`.

## Verification

Local lint, four application typechecks/builds, 27 security regressions, 6 database/provisioning and 5 intelligence regressions passed during development. HTTP and exact-commit browser/native CI results are recorded in the delivery checkpoint after completion. Embedded PostgreSQL tests use PGlite rather than a live Aurora cluster. Browser screenshots are retained in CI evidence for showroom, downloads, Command Center and Platform at desktop/mobile sizes.

## Activation still required

Shared Aurora/network/tenant migrations and staff grants; Cognito web/native clients and MFA; public Redis limiter settings; real authorized inventory/media; production domains/HTTPS/WAF/monitoring/restore; provider messaging/licensed feeds/AI configuration; signing/notarization; installed-device acceptance. The full advanced blueprint scope remains in `source-of-truth-completion-register.md`.
