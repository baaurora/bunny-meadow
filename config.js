/* Bunny Meadow configuration.
   FUNCTION_URL is filled in after the Supabase edge function is deployed.
   When it is empty, the app runs fully local (localStorage only) and the
   lock screen checks DEV_PASSWORD -- handy for previewing before deploy. */
window.CONFIG = {
  FUNCTION_URL: "", // e.g. https://<project-ref>.supabase.co/functions/v1/sync
  REQUIRE_PASSWORD: false, // set true to bring back the lock screen
  DEV_PASSWORD: "2alexarae", // used only when REQUIRE_PASSWORD is true (and no backend)
};
