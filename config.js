/* Bunny Meadow configuration.
   FUNCTION_URL is filled in after the Supabase edge function is deployed.
   When it is empty, the app runs fully local (localStorage only) and the
   lock screen checks DEV_PASSWORD -- handy for previewing before deploy. */
window.CONFIG = {
  FUNCTION_URL: "", // e.g. https://<project-ref>.supabase.co/functions/v1/sync
  REQUIRE_PASSWORD: false, // set true to bring back the lock screen
  DEV_PASSWORD: "2alexarae", // used only when REQUIRE_PASSWORD is true (and no backend)
  // Strava: paste the deployed Cloudflare Worker URL here to turn on "Connect Strava".
  // Until it is set, the Connect button explains the one-time setup. See worker/README.md.
  STRAVA_WORKER_URL: "https://bunny-strava.bianca-r-pagano.workers.dev",
};
