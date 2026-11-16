# Switching on Instagram, Facebook, WhatsApp, Google Ads and YouTube

The connection code is complete: each card on **Advertising → Your accounts** sends the dealership owner to the provider's own consent screen, stores the returned tokens encrypted, and shows the connected account. A card says **"Not switched on yet"** only because the VandLabs app credentials for that provider are not set on the deployment. Admin console → System shows exactly which ones are missing.

These credentials belong to **VandLabs** (one app per provider, shared by every dealership). Only the owner of the Meta and Google accounts can create them. Never paste them into chat or code: set them in **Vercel → vandlabs-automobile-intelligence → Settings → Environment Variables (Production)** and redeploy.

Production address used below: `https://vandlabs-automobile-intelligence.vercel.app`.

## 1. Facebook, Instagram and WhatsApp (one Meta app)

1. Go to developers.facebook.com → **My Apps → Create app** → type **Business**. Connect it to the VandLabs Meta Business portfolio.
2. Add products: **Facebook Login for Business**, **Marketing API**, **WhatsApp**, **Instagram** (Instagram API with Facebook Login), **Webhooks**.
3. **Facebook Login for Business → Settings → Valid OAuth Redirect URIs**, add both:
   - `https://vandlabs-automobile-intelligence.vercel.app/api/advertising/accounts/meta/callback`
   - `https://vandlabs-automobile-intelligence.vercel.app/api/advertising/accounts/whatsapp/callback`
4. **App settings → Basic**: copy **App ID** and **App Secret**. Add a Privacy Policy URL (`…/info/privacy`) and App Domain `vandlabs-automobile-intelligence.vercel.app`.
5. **Webhooks**: callback URL `https://vandlabs-automobile-intelligence.vercel.app/api/webhooks/meta`, verify token = a long random string you choose. Subscribe:
   - WhatsApp Business Account → `messages`
   - Instagram → `messages`
6. Optional (better WhatsApp onboarding): **WhatsApp → Embedded Signup → create a configuration**, copy its Configuration ID.
7. Vercel environment variables:

| Variable | Value |
|---|---|
| `META_APP_ID` | App ID |
| `META_APP_SECRET` | App Secret (mark **Sensitive**) |
| `META_WEBHOOK_VERIFY_TOKEN` | the verify token from step 5 (Sensitive) |
| `META_WHATSAPP_CONFIG_ID` | optional, step 6 |

8. Redeploy, then press **Verify and save** on the Meta webhook (the app must be live for Meta to verify it).

**Who can connect right away:** while the app is in *Development* mode, only people with a role on the app (Administrators, Developers, Testers) can connect. That is enough for VandLabs and a pilot dealership: add them under **App roles**. For any dealership to connect, Meta requires **Business Verification** of VandLabs and **App Review** for the permissions the app asks for: `ads_management`, `ads_read`, `pages_show_list`, `pages_read_engagement`, `business_management`, `instagram_basic`, and for WhatsApp `whatsapp_business_management`, `whatsapp_business_messaging`. Then switch the app to *Live*.

What each dealership needs on its side: a Meta ad account, a Facebook Page for the dealership, an Instagram professional account linked to that Page (for Instagram), and a WhatsApp Business number (for WhatsApp).

## 2. Google Ads and YouTube (the existing Google OAuth client + a developer token)

Google sign-in already uses the OAuth client in Google Cloud project `white-proxy-512104-n3`. The same client connects Google Ads and YouTube.

1. Google Cloud → **APIs & Services → Library**: enable **Google Ads API** and **YouTube Data API v3**.
2. **Credentials → the OAuth client → Authorized redirect URIs**, add:
   `https://vandlabs-automobile-intelligence.vercel.app/api/advertising/accounts/google/callback`
   (keep the existing `/api/auth/sso/google/callback`).
3. **OAuth consent screen → Data access**: add scopes `https://www.googleapis.com/auth/adwords` and `https://www.googleapis.com/auth/youtube.readonly`. These are sensitive scopes: until Google verifies the app, only accounts listed as **Test users** can grant them.
4. Developer token: in a **Google Ads manager account** (create one at ads.google.com/home/tools/manager-accounts if VandLabs has none) → **Admin → API Center** → copy the developer token. A new token has *Test access* (works only with Google Ads test accounts). Apply for **Basic access** in the API Center to use real dealership accounts.
5. Vercel environment variables:

| Variable | Value |
|---|---|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | the developer token (Sensitive) |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | optional: the manager account ID, digits only, when dealership accounts are managed under VandLabs' manager account |

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are already set for sign-in.

What each dealership needs: a Google Ads account on the Google login they connect with, and (for YouTube) a YouTube channel on the same login.

## 3. Check

Admin console → **System**: *Facebook and Instagram*, *WhatsApp* and *Google Ads and YouTube* turn green when their credentials are set. Then, as a dealership owner (or VandLabs in its own workspace): **Advertising → Connect** on each card. A successful connection shows the account name on the card; a failure returns with the provider's reason (for example "That Facebook login has no ad account").

## What happens after connecting

Connecting stores access only. Creating and publishing posts and ads is a separate step (Advertising → Promote); automatic posting is the next piece of work.
