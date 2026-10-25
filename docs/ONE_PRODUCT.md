# One product, one address

VandLabs Automobile Engine is presented as one product at one address. Each section is still its own app
underneath, so each one can be built, tested, deployed and rolled back on its own.

| Path | Section | App | Who it is for |
|---|---|---|---|
| `/` | Website (showroom, `/dealer` product page) | `apps/web` | Buyers and prospective dealers |
| `/intelligence` | Automobile Intelligence (the dealer product) | `apps/intelligence` | Dealership staff |
| `/command` | Command Center (operations back office) | `apps/command-center` | Dealership staff |
| `/platform` | Platform Control Center | `apps/platform` | VandLabs administrators |
| desktop app | Windows/macOS client for daily work | `apps/desktop` | Dealership staff |

## How it holds together

- **One address.** In production the Cloudflare gateway (`infra/cloudflare/src/gateway.ts`) routes by path
  prefix to each app's Worker through service bindings. Only the gateway is public; the app Workers have no
  route of their own. Locally, `pnpm demo` starts the same routing on http://127.0.0.1:8080
  (`scripts/local-gateway.mjs`, tested against the gateway's own rule).
- **One sign-in.** Cognito is the single identity provider, with Google federated (see
  [SINGLE_SIGN_IN.md](SINGLE_SIGN_IN.md)). A verified Google email maps to one staff account in every section.
- **One bar.** Intelligence, Command Center and Platform show the same VandLabs product bar
  (`@vandlabs/design-system/product-bar`) for moving between sections. Platform appears only for platform
  administrators. The public website keeps its customer-facing header; its `/dealer` page leads to
  `/intelligence/login`.
- **One database.** Every section reads and writes the same tenant tables under row-level security.
- **Desktop.** The desktop app connects to the same address. Its "Intelligence" and "Command Center" buttons open
  those sections in the system browser. Only those two fixed paths on the trusted workspace origin can be
  opened.

## What is deliberately not merged

The four web apps are not folded into one codebase. That would mean a near-rewrite across three styling
systems and two session models, with a high risk to tested behaviour. Unifying the address, sign-in,
navigation and data gives users one product without that risk. A later code merge, if wanted, can move one
section at a time behind the same paths without changing any URL.

## Notes for operators

- The gateway deploys last because it binds to every app Worker (`pnpm cf:deploy` handles the order).
- Intelligence's session cookie (`__Host-vl_session`, HttpOnly) is scoped to the whole address. The other
  sections ignore it and use their own `__Host-vandlabs-*` cookies.
- Old links to a separate Intelligence host or port 3003 should be replaced with `/intelligence/...`.
