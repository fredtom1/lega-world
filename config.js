/* =====================================================================
   config.js — Supabase connection settings.

   The website works WITHOUT this (it falls back to the built-in default
   data in js/data.seed.js). Fill these in to enable live editing via the
   /admin page and to serve content from your database. See README.md.

   The anon key is SAFE to ship publicly — write access is protected by
   Row Level Security (only a signed-in admin can change data).
   ===================================================================== */
window.LEGA_CONFIG = {
  SUPABASE_URL: "",       // e.g. "https://abcdefgh.supabase.co"
  SUPABASE_ANON_KEY: ""   // your project's anon/public key
};
