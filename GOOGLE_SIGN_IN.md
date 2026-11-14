# Google sign-in

Google Identity Services returns an ID token to the browser callback. The backend
verifies it and the browser-bound nonce, then opens the existing account matching
the verified email or supplies email/name defaults to the normal signup form.
Signup still requires a username and password, so both login methods remain available.
For non-Gmail accounts without a Workspace domain claim, the existing email-code
flow confirms current mailbox ownership before continuing. No data migration is needed.

## Local configuration

Set in `.env`, then restart the server:

```dotenv
GOOGLE_CLIENT_ID=1050557004317-mjot13uhtn153vehkpuvigjesf6nskn2.apps.googleusercontent.com
```

Project: `larpable-development` (1050557004317). Client: LARPABLE Local Web.
Authorized origins: `http://localhost`, `http://localhost:8080`.
The Console handoff reports External/Testing with `anirudh.sohaney@gmail.com`
as a test user. Use `http://localhost:8080`, rather than a machine IP or another port.

## Production configuration

Use this value in the production server environment, not the local environment:

```dotenv
GOOGLE_CLIENT_ID=283002600505-9k70k1df95eepd91c0hkj3vh9su88dpm.apps.googleusercontent.com
```

Project: `larpable-production` (283002600505). Client: LARPABLE Production Web.
Authorized origins: `https://larpable.me`, `https://www.larpable.me`.
The Console handoff reports External/In production with verified branding.
These Console states were supplied by the browser setup agent, not independently
verified by the coding agent.

The local `.env` is configured with the development ID. Oracle's
`/var/www/larpable.me/.env` is configured with the production ID, with mode `0600`.
The Oracle deploy script copies the live `.env` into each staged release before
switching releases, so the environment-specific setting survives deployment.
The production setting takes effect when the updated code is deployed and the
web service restarts. No hostname-based selection is needed in application code.

Neither client requires redirect URIs or a client secret for this implementation.
Only basic identity is used; no Google API permissions or refresh tokens are needed.
Client IDs are public identifiers. Keep `.env` and all unrelated secrets out of git.

## Verification

`npm test` includes `tests/google.integration.js`. It uses disposable data and a
stub of Google's remote token verification to exercise account matching, password
compatibility, signup with editable names, nonce rejection, mailbox challenges,
and deletion restrictions. It does not prove a real Google browser login.

For a live check, use the login and signup pages with the configured test account.
An existing matching account opens the feed; a new email advances to signup with
editable names. Google settings can take time to propagate. An origin error means
the page's exact scheme/host/port must be checked against the selected client.
