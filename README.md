# Extra Life arcade display + control panel

Two pages and two tiny API functions, hosted on Vercel:

| URL | Who opens it | What it is |
|---|---|---|
| `/` | The Steam Deck (arcade) | Full-screen display: goals, donor wall, uptime, countdown, guest stream, message, donation pop-ups |
| `/control` | Your PC | Dashboard: scenes, auto-rotate, guest streamers (cycle or pin), message board, marathon timer, Extra Life setup, preview |
| `/api/state` | both | Shared state (GET public, POST needs your admin token) |
| `/api/extralife` | display | Cached proxy to the public Extra Life (DonorDrive) API |

## Deploy (about 5 minutes)

1. Put this folder in a GitHub repo (or run `vercel` from it) and import it as a Vercel project. No build settings needed.
2. In the Vercel project: **Storage -> Create -> Upstash Redis** (Marketplace) and connect it to the project. This adds the `KV_REST_API_URL` / `KV_REST_API_TOKEN` env vars (the code also accepts `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).
3. **Settings -> Environment Variables**: add `ADMIN_TOKEN` = a long random string only you know.
4. Redeploy so the env vars take effect.
5. On your PC open `https://YOUR-PROJECT.vercel.app/control`, enter the token, then under **Extra Life setup** enter your participant ID (the number in `extra-life.org/participants/NUMBER`) and Save.
6. **Marathon timer**: set start/end, or press **Start now** when you go live.

## Using the control panel

Edits are **staged**: the preview on the right shows your draft, and nothing reaches the arcade until you press **Apply to arcade** (or Ctrl+Enter). **Discard changes** reverts the form. Turn on **Auto-apply (live mode)** if you'd rather each change go out immediately, e.g. when flipping scenes with keys 1-6 mid-stream. **Start now** and **Send test alert** always act immediately.

## Steam Deck

Open `https://YOUR-PROJECT.vercel.app/` in a browser and make it full screen (F11 in Desktop Mode). The cursor is hidden on that page. The display syncs to the server's clock, so timers stay correct even if the Deck's clock drifts.

## Notes

- The display polls `/api/state` every 4 seconds (`/?poll=3` to change). Over a 24-hour marathon that is roughly 20k Redis reads, so check your Upstash plan's command limit.
- Donation data refreshes every ~15 seconds (edge-cached), so a pop-up can lag a real donation by up to about 30 seconds.
- Guest streams use the Twitch player, always muted on the arcade. Add up to 10 channels; cycling restarts from the first one each time the scene appears.
- Without Redis configured the API falls back to temporary in-memory storage, fine for testing but it resets on cold starts. The control panel shows a red "TEMPORARY storage" badge when that's the case.
- Local test: `npm run dev` then open `http://localhost:3000/` and `/control` (token: `dev`). Extra Life data needs internet access.
- Style: navy `#253746`, yellow `#FFCB05`, teal `#0E7CA2`, Open Sans + Montserrat, taken from the Extra Life participant pages. Gilroy (their heading font) is commercial, so Montserrat stands in. The accent color is changeable in the control panel.
