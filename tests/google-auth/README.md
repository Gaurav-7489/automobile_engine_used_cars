# Google-only sign-in browser checks

Against a running production build (`next start`, port 3003) on a local PostgreSQL with migrations through 0024:

```
AUTH_ORIGIN=http://127.0.0.1:3003 npx playwright test --config playwright.auth.config.ts --trace off
```

`google-only.spec.ts` needs only placeholder `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (it reads the redirect to Google and never follows it).

`signed-in.spec.ts` needs `COOKIES_FILE`: sessions signed with the server's `SESSION_SECRET` for an administrator and an owner that were
activated with `intelligence_google_signin` (the database step of the callback), after `pnpm intelligence:bootstrap-admin` and
`intelligence_admin_provision_google`. The Google round trip is not part of these tests; verify it in staging with real accounts.
