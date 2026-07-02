# Supabase Edge Functions

These are **Deno** edge functions that run on **Supabase**, not on Vercel. The
Vercel build (`tsc && vite build`) does **not** touch this folder.

| Function | Purpose |
|----------|---------|
| `cacfp-meal-check/` | CACFP meal-count validation |
| `send-push/`        | Push notifications |

## Deploy

Via the **Supabase CLI** (never Vercel):

```bash
supabase functions deploy cacfp-meal-check
supabase functions deploy send-push
# or all: supabase functions deploy
```

Version-controlled here so the source is in the repo; deployment is a separate,
manual Supabase CLI step.
