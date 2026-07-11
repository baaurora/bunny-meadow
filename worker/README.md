# Bunny Meadow - Strava connector

This is a tiny Cloudflare Worker that lets Alexa tap "Connect Strava" in the app,
authorize once, and have her runs flow in automatically. It is the only place the
Strava secret lives, so the secret never ships in the app.

You deploy this once. After that, connecting is a single tap for her, no code.

## What you need
- A free Cloudflare account (you already have one).
- A free Strava API application (2 minutes to create).
- The `wrangler` CLI: `npm install -g wrangler` then `wrangler login`.

## Step 1 - Create a Strava API application
1. Go to https://www.strava.com/settings/api and create an app (any name, e.g. "Bunny Meadow").
2. For **Authorization Callback Domain**, enter your Worker's domain WITHOUT https,
   for example: `bunny-strava.YOUR-SUBDOMAIN.workers.dev`
   (You will know the exact domain after Step 3. You can create the app now with a
   placeholder and edit this field once the Worker is deployed.)
3. Copy the **Client ID** and **Client Secret**. Keep the secret private.

## Step 2 - Create the token store (KV)
Already done. A KV namespace `STRAVA_TOKENS` was created in
Bianca.r.pagano@gmail.com's Cloudflare account and its id is already filled into
`wrangler.toml`. Only redo this if you deploy under a different account:
```
wrangler kv namespace create STRAVA_TOKENS
```
and swap the printed `id` into `wrangler.toml`.

## Step 3 - Add the secrets and deploy
```
wrangler secret put STRAVA_CLIENT_ID       # paste the Client ID
wrangler secret put STRAVA_CLIENT_SECRET   # paste the Client Secret
wrangler deploy
```
Wrangler prints the Worker URL, for example `https://bunny-strava.you.workers.dev`.

If you used a placeholder callback domain in Step 1, go back to the Strava app
settings now and set **Authorization Callback Domain** to that Worker domain.

## Step 4 - Point the app at the Worker
In the repo's `config.js`, set:
```
STRAVA_WORKER_URL: "https://bunny-strava.you.workers.dev",
```
Commit and push. Done. In the app, Plan > Workouts > "Connect Strava" now works,
and the top-right Settings shows a Strava section.

## Notes
- Cost is 0 on Cloudflare's and Strava's free tiers.
- Scope requested is `activity:read_all` (read her activities only). Nothing is written to Strava.
- Garmin works too, because Garmin auto-syncs into Strava.
- Tokens are stored in KV keyed by a random link id that only lives on her device.
  "Disconnect" in the app deletes the tokens and deauthorizes the app on Strava.
