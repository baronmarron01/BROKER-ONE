# Production AI credential rotation

The production secret entered on 2026-11-07 is named BROKERONE. Vercel sensitive variable names cannot be edited. The server now prefers BROKERONE and falls back to OPENAI_API_KEY only when BROKERONE is absent or blank. Update BROKERONE for future production rotations and redeploy. Changing OPENAI_API_KEY while BROKERONE exists will not change the active credential. Neither secret is exposed to the browser. A provider HTTP 401 now produces an actionable French error.
