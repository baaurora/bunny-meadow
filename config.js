/* Bunny Meadow configuration.
   FUNCTION_URL is filled in after the Supabase edge function is deployed.
   When it is empty, the app runs fully local (localStorage only) and the
   lock screen checks DEV_PASSWORD -- handy for previewing before deploy. */
window.CONFIG = {
  FUNCTION_URL: "", // e.g. https://<project-ref>.supabase.co/functions/v1/sync
  DEV_PASSWORD: "2alexarae", // local-only fallback. The real password lives server-side once sync is wired up.
};
