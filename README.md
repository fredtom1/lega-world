# Lega World — website

A real, deployable build of the **Lega World** design (the grassroots football
ecosystem: competitions, league tables, teams, players, transfers and 15 seasons of
stats). It is a faithful, self‑contained implementation of the Claude Design concept —
**no build step, no framework, no CDN runtime** — plus a password‑protected admin editor
so non‑technical people can update player stats and match results.

- **Public site:** `index.html` — read‑only, fast, fully responsive.
- **Admin editor:** `admin.html` (also reachable at `/admin`) — sign in to edit content.
- **Data:** loaded from a free **Supabase** database when configured; otherwise the site
  runs from the built‑in defaults in `js/data.seed.js`.

---

## 1. Preview locally

Any static server works. From this folder:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

(or `npx serve`, VS Code "Live Server", etc.) Opening `index.html` directly via
`file://` will not work — it must be served over http.

---

## 2. Deploy (make it public)

The whole folder is static, so deployment is just "upload the folder".

**Netlify**
- Drag‑and‑drop this folder onto <https://app.netlify.com/drop>, **or** connect a Git repo.
- `netlify.toml` is already included (maps `/admin` → `admin.html`).

**Vercel**
- `vercel` (CLI) in this folder, or import the repo at <https://vercel.com/new>.
- `vercel.json` is already included (clean URLs + `/admin`).

The public site works immediately using the built‑in default data. To enable live editing,
set up Supabase (next section).

---

## 3. Enable live editing (Supabase — free)

This powers the `/admin` editor and lets changes go live for everyone with no redeploy.

1. Create a free project at <https://supabase.com>.
2. **SQL Editor → New query →** paste & run `supabase-setup.sql` (creates the
   `site_content` table and its read/write security rules).
3. **Authentication → Users → Add user:** create your admin **email + password**
   (this is your `/admin` login). *Tip:* under **Authentication → Providers → Email**,
   turning **off** "Confirm email" lets you sign in right away.
4. **Project Settings → API:** copy the **Project URL** and the **anon public** key into
   `config.js`:
   ```js
   window.LEGA_CONFIG = {
     SUPABASE_URL: "https://YOURPROJECT.supabase.co",
     SUPABASE_ANON_KEY: "eyJ...your anon key..."
   };
   ```
   The anon key is safe to publish — writes are protected by Row Level Security.
5. Re‑deploy (or save locally), open `/admin`, sign in, and click **"Seed from defaults"**
   once to load the starting content into the database.

---

## 4. Editing content (`/admin`)

Sign in and use the tabs. **Save changes** on a tab publishes that section live.

| Tab | What it edits |
|-----|---------------|
| **Teams & Squads** | Add/remove teams and their player lists. Player profiles & stats are derived automatically from the seasons you record. |
| **Seasons & Results** | The heart of updates: pick a competition → season, then edit standings, **match results**, **top scorers**, **top assists**, fixtures, the final, etc. "Add season" creates a new one. |
| **Transfers** | The transfer history list. |
| **News** | Home/News cards (category, headline, colour, image). |
| **Best Player** | Player‑of‑the‑Year roll of honour. |
| **Ticker** | The scrolling "Latest" headlines. |
| **Competitions / Home Teams / Learning / Yellow Cards** | Smaller collections. |
| **Advanced (JSON)** | Direct JSON for any section (divisions, groups, positions, red cards, free‑kicks, assist overrides, all‑time tables). |

Player goals/assists, league tables, head‑to‑heads, records and growth charts are all
**computed** from this data — update a season's scorers/results and every related view
updates automatically.

---

## 5. About the images

The brand/club artwork lives in `assets/`. Three club badges (Dynamo, MFM, Royal) are the
original PNGs. The remaining competition logos and four club badges exceeded the design
tool's 256 KB transfer limit and were truncated, so they are **not** shipped; instead the
site shows clean, on‑brand fallbacks automatically:

- **Club badges** → a coloured monogram (e.g. "GS", "FE").
- **Competition logos** → a distinct emblem in the competition's colour (cup / star /
  shield / ball / book).

To use the exact originals, download those files from the Claude Design project and drop
them into `assets/brand-logos/` and `assets/clubs/` (same filenames). They'll be picked up
automatically — no code changes needed.

---

## 6. How it's built (for developers)

- `js/dc-runtime.js` — a ~300‑line dependency‑free runtime that renders the original
  Claude Design template language (`{{ }}`, `sc-if`, `sc-for`, `dc-import`, events, SVG).
- `js/app.js` — the original design template + logic (generated from `Lega World.dc.html`;
  edit the design, not this file). Data fields are overridden by Supabase/seed content via
  a small `_applyContent()` hook.
- `js/components.js` — the four sub‑components (TeamBadge, BrandLogo, SeasonPanel,
  PlayerPicker), ported verbatim (TeamBadge adds an image fallback).
- `js/data.seed.js` — the default content (also the source for "Seed from defaults").
- `js/supabase.js`, `config.js`, `supabase-setup.sql` — the data layer.
- `admin.html`, `js/admin.js` — the editor.
- `css/site.css` — base styles (from the design) + a light responsive layer.

No bundler, no `npm install` to run — just static files.

---

## 7. Operating the league (Match Centre · registrations · transfers · photos)

These features need a one‑time extra setup: run **`supabase-phase1.sql`** in the Supabase
SQL Editor (creates two tables — `registrations`, `transfer_requests` — and a public
`media` storage bucket for photos).

Once that's done, in `/admin`:

- **Match Centre** — pick a competition + season, enter a result (home/away + score), and
  the **league table recalculates automatically** (3 pts win / 1 draw / 0 loss, sorted by
  points → goal difference → goals). Click **Save changes** to publish.
- **News** — add a story, **upload a live‑action photo**, write the report/interview, Save.
  On the site the card shows the photo and opens as a full article when clicked.
- **Registrations** — team registrations submitted from the public *Register your team*
  form (now including a **player list**) appear here. **Approve → add squad** publishes the
  team and its players to the live site.
- **Pending transfers** — transfer requests from the public *Transfers* page appear here.
  **Approve & publish** adds the move to the transfer history and moves the player between
  squads.

Public submissions work with no login; only the signed‑in admin can see and approve them
(enforced by row‑level security).

---

## 8. Coaches & team owners (Phase 2)

Coaches/owners get their own logins to **manage their squad** and **run transfers**, where a
buying coach requests a player and the **selling club's coach must accept** before the move
happens (the league office can override). A coach can only ever touch their own team —
enforced by the database.

**One‑time setup**
1. Edit `supabase-phase2.sql`: replace `YOUR_ADMIN_EMAIL@example.com` with the email you log
   into `/admin` with. Run it in the Supabase **SQL Editor**.
2. Supabase → **Authentication → Providers → Email**: make sure **Enable sign ups** is ON
   (default). Turning **off** "Confirm email" lets coaches sign in immediately.
3. Open `/admin` → **Coaches** tab → **Publish all to live** (under *Teams & Squads* →
   "Publish all to live") to copy your current squads into the live `team_players` table.

**How it runs**
- Coaches go to **`/coach`**, create an account, and **request a team**.
- You approve them under `/admin` → **Coaches** (assign team → Approve).
- A coach's **My Team** tab edits their own squad live; **Transfers** lets them bid for
  another club's player. The selling club's coach sees the offer under *Incoming offers* and
  **Accepts** (player moves + logged) or **Rejects**. You can override any request from
  `/admin` → **Pending Transfers**.
- The public site reads squads live from `team_players`; the discreet **Coach / owner login**
  link is in the site footer (not the public nav).

Security note: the transfer "apply" runs inside a Postgres `SECURITY DEFINER` function so the
cross‑club move is performed safely — neither coach can write the other club's squad directly.

---

## 9. Role portal and player contracts (Phase 3)

Run **`supabase-phase3.sql`** after Phase 2. It adds the role/category portal and the player
contract step for transfers.

Routes:
- `/login` - role dropdown for Visitor, Coach / Team Owner, Player, Scout, and Referee.
- `/coach` - coach/team owner portal for squad management and transfer offers.
- `/player` - player contract portal.

Transfer flow:
1. The buying coach opens `/coach`, chooses a player from another team, adds fee, seasons, and the player's email.
2. The selling coach sees the incoming offer and clicks **Agree terms** or Reject.
3. If agreed, the contract appears in `/player` for the email used in the offer.
4. The player accepts the number of seasons or rejects the offer.
5. Only after player acceptance does the player move team and the transfer history update.

The public Transfers form now sends people into the coach portal, because real transfer moves need
the buying coach, selling coach, and player approval chain.
