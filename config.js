/* =====================================================================
   config.js — Supabase connection settings.

   The website works WITHOUT this (it falls back to the built-in default
   data in js/data.seed.js). These enable live editing via the /admin
   page and serve content from your database. See README.md.

   The anon key is SAFE to ship publicly — write access is protected by
   Row Level Security (only a signed-in admin can change data).
   ===================================================================== */
window.LEGA_CONFIG = {
  SUPABASE_URL: "https://wzsgtihpiimqsgtkcynb.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6c2d0aWhwaWltcXNndGtjeW5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwOTIxNDEsImV4cCI6MjA5NzY2ODE0MX0.O-i-9VQxwuWsRALI_27MiSVgBwPz9bESfR84tok9H5o"
};
