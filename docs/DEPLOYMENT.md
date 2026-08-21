# Deployment

**Live:** https://trigsight.vercel.app

## Operational surface

| Concern | Implementation |
|---|---|
| Hosting | Vercel, free tier. Static pages prerendered; two dynamic routes. |
| Health | Every static route is a health signal. `GET /api/mcp` returns discovery JSON. |
| Config | `AI_GATEWAY_API_KEY`, `AI_GATEWAY_MODEL`. Absent → chat returns retrieved context instead of failing. |
| Rate limiting | Request bounds enforced before any model call: ≤12 messages, ≤1200 chars each, ≤700 output tokens. |
| Crawler control | `robots.txt` disallows `/api/chat`, which costs an inference call per request. |
| Security headers | `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY`. |
| MCP origin check | Foreign browser origins → 403 (DNS rebinding guard). Absent Origin allowed for CLI agents. |
| Degradation | Vector store failure → lexical-only retrieval. Model gateway failure → 502 with a reason. Missing credentials → retrieval-only mode. |

## Deploy

```bash
npm run build          # content → citation gate → next build
npx vercel deploy --prod --yes
```

The citation gate runs first, so an unverifiable claim cannot reach production.

## Rollback

```bash
npx vercel rollback          # previous deployment
npx vercel alias set <older-deployment-url> trigsight.vercel.app
```

## Production-only failure to remember

The first deploy returned HTTP 500 on both dynamic routes while every static page was
fine. `readFileSync("content/…")` — a serverless bundle does not include the content
directory. Works locally, `ENOENT` deployed.

Now prevented by 14 tests asserting no route or shared library imports `node:fs`.
The general lesson: a green build and a green test suite do not prove a system runs.
