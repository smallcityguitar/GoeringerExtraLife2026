# Extra Life arcade display + control panel

Two pages and two tiny API functions, hosted on Vercel:

| URL | Who opens it | What it is |
|---|---|---|
| `/` | The Steam Deck (arcade) | Full-screen display: goals, donor wall, uptime, countdown, guest stream, message, donation pop-ups |
| `/control` | Your PC | Dashboard: scenes, auto-rotate, guest streamers (cycle or pin), message board, marathon timer, Extra Life setup, preview |
| `/ticker` | OBS / a small window | Slim scrolling info bar: raised total, goal progress, latest donation, next milestone, team total, uptime, your custom messages |
| `/api/state` | all pages | Shared state (GET public, POST needs your admin token) |
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

## Ticker bar (`/ticker`)

A thin bar (about 4-5% of screen height) that sits at the bottom. Best use: in OBS add a **Browser Source** pointing at `https://YOUR-PROJECT.vercel.app/ticker`, size 1920x1080 (or your canvas size). The page background is transparent, so only the bar shows. For a plain desktop window, make a short, wide browser window and add `?solid=1` to the address.

Options (add to the URL, combine with `&`): `?scale=1.3` bigger, `?speed=1.5` faster, `?items=progress,donor,milestone,team,custom` choose and reorder what scrolls, `?clear=1` no bar background, `?nourl=1` hide the donate link, `?poll=10` seconds between refreshes. Custom messages are edited in the control panel (**Ticker bar** card) and go live with **Apply**.

## Keeping your settings between updates

Your control-panel settings live in the **Redis database**, not in your code, so uploading new code to GitHub never touches them, **as long as Redis is connected** (Vercel project → Storage → Upstash Redis → connect → redeploy). The pill at the top of the control panel says `saved to Redis` when it is working, and shows a warning if it isn't.

Two extra safety nets:
- **Browser backup:** every Apply is also saved in your browser. If the server ever comes up empty, the control panel puts your settings back automatically when you open it.
- **Settings file:** *Settings backup → Download settings file* gives you `_defaults.json`. Save it as `api/_defaults.json` in your repo and those become the starting settings for any fresh deployment. (Anything saved from the control panel still wins.)

You can also *Load from file…* to fill the form from a downloaded file (it stays a draft until you press Apply).

## Donation link

*Extra Life setup → Donation link* sets the link shown in the arcade footer and on the ticker (for example `bossnation.com/donate`). Leave it blank to show your Extra Life page address instead.

## Steam Deck

Open `https://YOUR-PROJECT.vercel.app/` in a browser and make it full screen (F11 in Desktop Mode). The cursor is hidden on that page. The display syncs to the server's clock, so timers stay correct even if the Deck's clock drifts.

## Notes

- The display polls `/api/state` every 4 seconds (`/?poll=3` to change). Over a 24-hour marathon that is roughly 20k Redis reads, so check your Upstash plan's command limit.
- Donation data refreshes every ~15 seconds (edge-cached), so a pop-up can lag a real donation by up to about 30 seconds.
- Guest streams use the Twitch player, always muted on the arcade. Add up to 10 channels; cycling restarts from the first one each time the scene appears.
- Without Redis configured the API falls back to temporary in-memory storage, fine for testing but it resets on cold starts. The control panel shows a red "TEMPORARY storage" badge when that's the case.
- Local test: `npm run dev` then open `http://localhost:3000/` and `/control` (token: `dev`). Extra Life data needs internet access.
- Style: navy `#253746`, yellow `#FFCB05`, teal `#0E7CA2`, Open Sans + Montserrat, taken from the Extra Life participant pages. Gilroy (their heading font) is commercial, so Montserrat stands in. The accent color is changeable in the control panel.
