# D^3 Ticketing

A single Next.js app that runs entirely on Cloudflare Workers with Cloudflare D1 as the database. Admin portal for event entry passes: manage pass types, import participants from CSV, email everyone a QR code via Amazon SES, scan codes at the door, and watch check-in analytics live.

## What's inside

- **Passes** - create any number of pass types (name, description, badge color) from the admin UI.
- **Participants** - CSV upload (`name,email,pass` columns). Every `pass` value must match a configured pass type; mismatched rows are rejected and reported per row. Re-uploading updates existing participants by email.
- **QR invites** - one button emails every pending participant a QR code. The QR payload embeds the token, pass type and name, so a scanned code is self-describing. Sending goes through Amazon SES (SigV4-signed, no AWS SDK) when configured, otherwise runs in mock mode that does not send mail.
- **Scanner** - in-portal camera scanner (zxing). Checks people in, flags re-scans of already-used codes and any pass mismatch between the QR payload and the guest list. Manual code entry fallback included.
- **Dashboard** - totals, per-pass check-in progress bars, and a live recent check-ins feed.

## Run locally

Requirements: Node 24+ (including camera-library tooling).

```bash
npm ci
# Set ADMIN_PASSWORD to a long, unique password in .dev.vars before starting.
npx wrangler d1 migrations apply d3-ticketing --local   # create local D1 + apply schema
npm run preview                                          # build for Workers and serve on :8787
```

Open http://localhost:8787 and sign in with username `admin` and your configured password. Use `npm run preview` to exercise the authenticated Worker entry point. `npm run dev` is only an unauthenticated, loopback-only development tool; never expose it to a network.

Sample CSV:

```csv
name,email,pass
Asha Rao,asha@example.com,VIP
Rahul Verma,rahul@example.com,General
```

## Deploy

1. `npx wrangler login`
2. `npx wrangler d1 create d3-ticketing` and paste the real `database_id` into `wrangler.jsonc`
3. `npx wrangler d1 migrations apply d3-ticketing --remote`
4. Set the required admin password: `npx wrangler secret put ADMIN_PASSWORD` (at least 16 characters, unique to this app). Missing/short passwords fail closed with HTTP 503. Then set SES secrets: `npx wrangler secret put SES_ACCESS_KEY_ID` (and `SES_SECRET_ACCESS_KEY`)
5. In `wrangler.jsonc` set `vars.EMAIL_MODE` to `ses`; add `SES_REGION`, `SES_FROM_EMAIL`, `SES_FROM_NAME` as vars too
6. `npm run deploy`

With `EMAIL_MODE=mock` (default) no email leaves the worker - no ticket payloads are logged and participants are marked `mocked`. This is the mode to use until SES is verified.

## Configuration

| Var / secret        | Purpose |
| ------------------- | ------- |
| `EMAIL_MODE`        | `mock` (default) or `ses` |
| `SES_REGION`        | AWS region of your SES identity |
| `SES_ACCESS_KEY_ID` | IAM key with `ses:SendRawEmail` (secret) |
| `SES_SECRET_ACCESS_KEY` | matching secret (secret) |
| `SES_FROM_EMAIL`    | Verified SES sender address |
| `SES_FROM_NAME`     | Display name (default "D3 Ticketing") |
| `ADMIN_PASSWORD` | Required secret, at least 16 characters. Protects every Worker path, including previews and QR endpoints. |
| `ADMIN_USERNAME` | Optional admin username (default `admin`) |

## Notes / deferred

- All Worker routes require HTTP Basic admin authentication over HTTPS. `assets.run_worker_first` ensures asset/RSC routes cannot bypass the gate. This applies on custom domains, `workers.dev` and preview URLs. Cross-origin mutations are denied. Cloudflare Access can add individual staff identity and MFA in front of this gate; do not disable the gate or expose the Next dev server.
- Email QR images use the inline `cid:pass-qr` attachment. Recipients do not need an admin session or a public QR endpoint.
- CSV imports are limited to 500 rows per file and use one transactional D1 batch (D1 counts the batch as one invocation query). Split larger lists; failed database batches apply no rows. Keep imports and email runs serialized for accurate imported/updated counts and a stable recipient list.
- Email sends run synchronously in the request (25 per request, automatically paginated by the UI). For thousands of participants, move sends to a Queue. A network failure can leave an uncertain final send; check statuses before resending. Mock invitations are never counted as sent on the dashboard.
- SES sandbox accounts can only send to verified addresses; request production access in the SES console.
