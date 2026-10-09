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

### Published release evidence

[Automatic release run 37903797675](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37903797675) passed both native builds and the publish job from merged source `6fbcc2fb985bb1d77f48848dc8b3faa767bd75a2`. [Development release desktop-6fbcc2fb985b](https://github.com/Gaurav-7489/automobile_engine_used_cars/releases/tag/desktop-6fbcc2fb985b) published on 9 October 2026 at 08:24 UTC. The actual GitHub metadata passed the product's release parser, including complete uploaded assets and exact source/tag/URL binding. The refreshed protected `/download` page returned 200 and displayed both download links and this release tag after its metadata cache refreshed.

| Installer | Bytes | SHA-256 |
| --- | --- | --- |
| [Windows x64](https://github.com/Gaurav-7489/automobile_engine_used_cars/releases/download/desktop-6fbcc2fb985b/Automobile-Engine-Windows-x64.exe) | 3,004,097 | `b6444874091a46340288b81f47a3335acec6b0c7b53956a22e5107adae8dc13d` |
| [Universal macOS](https://github.com/Gaurav-7489/automobile_engine_used_cars/releases/download/desktop-6fbcc2fb985b/Automobile-Engine-macOS-universal.dmg) | 8,718,344 | `6b4345a4b1fa9ab82a8173f03fefdfff7c0815a526218df8106fdbcfc4db0f03` |

These digests are the published GitHub asset digests and the release includes `SHA256SUMS.txt`. They identify the distributed files; they do not prove code signing or installed-device acceptance.

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

PR #17 merged at `6fbcc2fb985bb1d77f48848dc8b3faa767bd75a2`, with the same full tree `531d2cc54eb39b6f3f93b9217a1f911458c16dd9` as tested candidate `7d93415c4b6719a7cd5048b653383afc6c0c6768`. [Main Quality Gate 37903295767](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37903295767) passed lint, four typechecks/builds, 27 security, 6 database/provisioning, 5 intelligence, 72 Chromium/mobile WebKit browser/API and 22 staff HTTP cases, plus AWS build and staging CDK synthesis. [Candidate native 37902240161](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37902240161) passed Windows and universal macOS packaging with three Rust regressions per OS.

Embedded PostgreSQL tests use PGlite rather than a live Aurora cluster. [Main browser evidence](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37903295767/artifacts/11603970523) includes showroom, downloads, Command Center and Platform at desktop/mobile sizes. Its artifact ZIP digest is `ead3af2430b23e4f12a246cc5bf0c5fce8ad533aa15f75b4b2716022dca52cfe`. QA inspection confirmed responsive layouts; full-page captures below the viewport can show unloaded lazy images.

## Refreshed protected previews

All three deployments are READY from the merged software commit above, with existing SSO protection retained. Authenticated HTTP checks returned 200 for the download page and both staff login pages. Staff login honestly shows setup pending; `/command/api/desktop-config` returns the expected 503 without exposing a client ID. Baseline security headers are present. These checks do not establish live staff login or shared database acceptance.

| Application | Preview |
| --- | --- |
| Website and downloads | https://vandlabs-automobile-qsr7jblvz-gaurav-7489s-projects.vercel.app/download |
| Command Center | https://vandlabs-automobile-command-2ve8t09b1-gaurav-7489s-projects.vercel.app/command |
| Platform | https://vandlabs-automobile-platform-cbeag1wfl-gaurav-7489s-projects.vercel.app/platform |

## Activation still required

Shared Aurora/network/tenant migrations and staff grants; Cognito web/native clients and MFA; public Redis limiter settings; real authorized inventory/media; production domains/HTTPS/WAF/monitoring/restore; provider messaging/licensed feeds/AI configuration; signing/notarization; installed-device acceptance. The full advanced blueprint scope remains in `source-of-truth-completion-register.md`.
