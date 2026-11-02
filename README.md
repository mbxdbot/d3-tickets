# D^3 Ticketing

A single Next.js app that runs entirely on Cloudflare Workers with Cloudflare D1 as the database. Admin portal for event entry passes: manage pass types, import participants from CSV, email everyone a QR code via Amazon SES, scan codes at the door, and watch check-in analytics live.

## What's inside

- **Passes** - create any number of pass types (name, description, badge color) from the admin UI.
- **Participants** - CSV upload (`name,email,pass` columns). Every `pass` value must match a configured pass type; mismatched rows are rejected and reported per row. Re-uploading updates existing participants by email.
- **QR invites** - one button emails every pending participant a QR code. The QR payload embeds the token, pass type and name, so a scanned code is self-describing. Sending goes through Amazon SES (SigV4-signed, no AWS SDK) when configured, otherwise runs in mock mode that just logs.
- **Scanner** - in-portal camera scanner (zxing). Checks people in, flags re-scans of already-used codes and any pass mismatch between the QR payload and the guest list. Manual code entry fallback included.
- **Dashboard** - totals, per-pass check-in progress bars, and a live recent check-ins feed.

## Run locally

Requirements: Node 20+.

```bash
npm install
npx wrangler d1 migrations apply d3-ticketing --local   # create local D1 + apply schema
npm run preview                                          # build for Workers and serve on :8787
```

Open http://localhost:8787. `npm run dev` (Next dev server) also works; D1 bindings are emulated locally either way.

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
4. Set secrets: `npx wrangler secret put SES_ACCESS_KEY_ID` (and `SES_SECRET_ACCESS_KEY`)
5. In `wrangler.jsonc` set `vars.EMAIL_MODE` to `ses` and `APP_BASE_URL` to your worker URL; add `SES_REGION`, `SES_FROM_EMAIL`, `SES_FROM_NAME` as vars too
6. `npm run deploy`

With `EMAIL_MODE=mock` (default) no email leaves the worker - sends are logged and participants are marked `mocked`. This is the mode to use until SES is verified.

## Configuration

| Var / secret        | Purpose |
| ------------------- | ------- |
| `EMAIL_MODE`        | `mock` (default) or `ses` |
| `SES_REGION`        | AWS region of your SES identity |
| `SES_ACCESS_KEY_ID` | IAM key with `ses:SendRawEmail` (secret) |
| `SES_SECRET_ACCESS_KEY` | matching secret (secret) |
| `SES_FROM_EMAIL`    | Verified SES sender address |
| `SES_FROM_NAME`     | Display name (default "D3 Ticketing") |
| `APP_BASE_URL`      | Public URL of the worker, used for the QR image link in emails |

## Notes / deferred

- No admin login yet - put the worker behind Cloudflare Access or add auth before a real event.
- Email sends run synchronously in the request (50 per click by default). For thousands of participants, move sends to a Queue.
- SES sandbox accounts can only send to verified addresses; request production access in the SES console.
