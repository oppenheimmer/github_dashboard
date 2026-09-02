# GitHub Activity Dashboard

Static web dashboard that combines activity data from two fixed GitHub accounts into a single profile header and contribution calendar view.

## Current State (as of 2026-09-02)

- Runtime stack: plain `index.html` + `styles.css` + `app.js`, plus
  `server.js` — a dependency-free Node script that serves the static files
  and a `/api/github` proxy for authenticated data.
- Fixed users in code: `havebleu` and `oppenheimmer`.
- Calendar years rendered: current year and previous year only.
- Data source strategy: GitHub GraphQL via the `/api/github` proxy first, REST
  fallback (unauthenticated) for commit estimation, then empty-data fallback.
- No GitHub credential lives in client-side code. `app.js` embedded a classic
  PAT (split into string parts to dodge secret scanners) up to revision 0.4;
  that token was exposed while the repo was public and is permanently revoked.
  See "Authentication" below.
- The app is embeddable as a script/style include; embedders either run
  `server.js` (or an equivalent that reads `GITHUB_TOKEN` from `.env.local`
  and answers `/api/github`) alongside it, or pass a custom `apiBase` (see
  "Configuration and Defaults").
- Per-user stat lines share a single CSS grid with right-aligned tabular numbers for robust column alignment.

## What the App Does Today

- Loads two user profiles on page load.
- Renders an overlapped avatar stack in the header.
- Shows per-user stat lines (followers, following, public repos, starred repos).
- Builds year sections for contribution calendars using month-separated blocks.
- Merges contribution counts across both users for the visible calendar cells.
- Shows per-user commit totals in right-side "commit pills".
- Supports click-to-open activity tooltips on non-zero contribution days.
- Uses a 5-minute in-memory cache for API responses.

## Repository Layout

- `index.html`
  - Page shell with:
    - `.profile-header` split into `.profile-left` and `.profile-right`
    - `#profile-avatar-stack`, `#profile-username`
    - stat containers: `#follow-info`, `#following-info`
    - `#profile-bio`
    - `#user-commit-breakdown`
    - contributions root: `#all-years-container`
- `styles.css`
  - GitHub-like palette and spacing for profile and calendar UI.
  - Month-block contribution grid and tooltip styling.
  - Mobile breakpoint at `max-width: 768px`.
- `app.js`
  - `GitHubDashboard` class handling data fetch, aggregation, rendering, cache, and interactions.
  - Initializes automatically on `DOMContentLoaded`.
- `server.js`
  - Plain Node (`http`/`fs`, no dependencies) local server: serves the static
    files and answers `/api/github`.
  - Reads `GITHUB_TOKEN` by parsing `.env.local` directly at request time —
    never via `process.env` or a hosting dashboard.
  - Validates `type`/`user`/`year` and only ever runs the two fixed queries
    below (not an open GraphQL relay); allowlists the same two fixed users as
    `app.js`.

## Runtime Flow

1. `DOMContentLoaded` creates `new GitHubDashboard()`.
2. Constructor sets defaults (year, users, `apiBase`, cache, root).
3. `init()`:
   - computes available years (`[currentYear, currentYear - 1]`)
   - calls `loadProfiles(defaultUsers)`
   - registers global click listener for tooltip dismissal.
4. `loadProfiles()`:
   - fetches profile details via the `/api/github` proxy per user
   - transforms data to local shape
   - updates header UI
   - triggers contribution generation for all available years.
5. `generateAllYearsContribution()`:
   - fetches contribution maps per user/year
   - merges contributions by date
   - renders only years with non-zero combined contributions
   - updates per-user commit breakdown.

## Data Sources and API Behavior

### Profile Data (GraphQL)

- Endpoint: `/api/github?type=profile&user=<login>`, proxied server-side to `https://api.github.com/graphql`.
- Queried fields include:
  - `login`, `name`, `avatarUrl`, `bio`
  - follower/following totals
  - public non-fork repo count
  - starred repo count

### Contribution Data (proxy first)

- Endpoint: `/api/github?type=contributions&user=<login>&year=<yyyy>`.
- Preferred source: `contributionsCollection(...).contributionCalendar.weeks[].contributionDays[]`.
- Date range is full calendar year: `YYYY-01-01T00:00:00Z` to `YYYY-12-31T23:59:59Z`.

### REST Fallback Path

If GraphQL contribution fetch fails:

1. Fetch repos from `GET /users/{username}/repos?sort=updated&per_page=100`.
2. Process first 5 repos only (rate-limit control).
3. Fetch author commits for each repo in-year:
   - `GET /repos/{username}/{repo}/commits?author={username}&since=...&until=...&per_page=100`
4. Aggregate commits by `YYYY-MM-DD`.

If fallback still finds no data, the app returns empty contribution data (no synthetic fake points).

### Authentication

- No credential lives in client-side code. `app.js` calls `fetchFromProxy()`,
  which hits `apiBase` (default `/api/github`) — a route answered by
  `server.js`, which reads the token straight out of `GITHUB_TOKEN` in
  `.env.local` on disk (not `process.env`, not a hosting-platform dashboard)
  and forwards only the two fixed, parameter-validated queries above.
- REST fallback requests (repos/commits, used only when the proxy call fails)
  are unauthenticated and subject to GitHub's 60 requests/hour anonymous limit.
- **History:** through revision 0.4, `app.js` embedded a classic PAT split
  into string parts (to reduce secret-scanner hits) and sent it directly from
  the browser. That token was exposed while the repo was public; it must be
  treated as permanently leaked and is not reused anywhere. Never reintroduce
  a credential into client-side code, and never re-split a secret to dodge
  scanners.

### Caching

- `Map`-based in-memory cache (`apiCache`) with 5-minute TTL.
- Caches successful REST responses and GraphQL results.
- GraphQL cache key is derived from variables payload.

## Contribution Calendar Logic

- Week starts on Sunday (`getDay()` based calculations).
- Each month is rendered as an independent `.month-block`.
- Month labels are width-aligned using `calculateMonthBlockWidth(year, monthIndex)`.
- Days outside the active month in a block are rendered with low opacity.
- Contribution intensity levels:
  - `0`: no contributions
  - `1`: `1-2`
  - `2`: `3-5`
  - `3`: `6-8`
  - `4`: `9+`

## UI and Styling Notes

- Avatar overlap is implemented with negative left margin on subsequent avatars.
- Contribution dots are circular and enlarge on hover.
- Month blocks are visually separated by a thin vertical divider.
- Tooltip cards show per-user date activity for clicked days with contributions.
- Mobile behavior:
  - header stacks vertically
  - commit pills expand to full width
  - contribution dots and gaps shrink.

## Configuration and Defaults

- Default users: hardcoded to `havebleu`, `oppenheimmer` (also allowlisted in `server.js`).
- Default root: `document` (supports embedding into a host page context).
- Default `apiBase`: `/api/github`; pass `{ apiBase }` to `new GitHubDashboard()` to point at a different proxy.
- Available years: current + previous.
- Cache TTL: 300000 ms (5 minutes).
- `GITHUB_TOKEN`: a single line in `.env.local` (`GITHUB_TOKEN=ghp_...`), read directly from that file by `server.js` on every request. Never set client-side, never committed (`.env.local` is gitignored), and never promoted into an OS/platform environment variable.

## Known Gaps / Mismatches in Current Implementation

- Username display in header currently renders raw handles (without `@` prefix).
- Header layout uses right-side commit pills; it does not currently implement a single medium GitHub logo block in the left-side stacked stats area.
- Contribution tooltip text currently hardcodes PR merged count as `0 PRs merged`.

## Stat Line Alignment

Both per-user stat rows share a single CSS grid on `.stacked-info`, ensuring columns align across rows. Each `.follow-info` / `.stat-text` uses `display: contents` so the inner spans (username, marker, followers, following, repos, starred) become direct grid children.

| Column | Sizing | Content |
| --- | --- | --- |
| Username | `max-content` | monospace handle (e.g. `oppenheimmer`) |
| Marker | `14px` | `◉` dot separator |
| Followers | `auto` | icon + right-aligned number + label |
| Following | `auto` | icon + right-aligned number + label |
| Public repos | `auto` | icon + right-aligned number + label |
| Starred | `auto` | icon + right-aligned number + label |

Numbers use `.stat-number` (`min-width: 3ch; text-align: right; font-variant-numeric: tabular-nums`) so values like `2` and `386` occupy the same width without leading zeros.

## Local Development

No build step and no `npm install` — `server.js` uses only Node's built-in
`http`/`fs` modules (requires Node 18+ for global `fetch`).

Option 1 (recommended, exercises the proxy):

```bash
echo 'GITHUB_TOKEN=ghp_your_token_here' >> .env.local
node server.js        # http://localhost:8000
node server.js 3000    # or pick a different port
```

`.env.local` is gitignored, so the token never gets committed. `server.js`
re-reads the file on every `/api/github` request, so editing the token does
not require restarting the process.

Option 2 (static only, degraded data):

```bash
python -m http.server 8000
```

`/api/github` will 404 under a plain static server (it has no code to run),
so the dashboard falls back to unauthenticated REST (60 req/hr).

## Deployment / Embedding Notes

- Run `server.js` (or an equivalent process) anywhere that has Node and a
  `.env.local` file containing `GITHUB_TOKEN` alongside the code — a VPS,
  container, or any always-on host. This deliberately does not target
  serverless/edge platforms: those don't ship `.env.local` to the running
  function, and the whole point of this setup is that the token lives only in
  that file, never in a platform's environment-variable configuration.
- Designed as a static embeddable module:
  - include `styles.css`
  - include `app.js`
  - ensure required DOM structure from `index.html` exists in host page.
  - either run `server.js` (or equivalent) at `/api/github` on the same
    origin, or pass `{ apiBase: '<url>' }` to `new GitHubDashboard()` to point
    at an existing proxy (see `server.js` in this repo for the reference
    implementation).
- No bundler, package manager, or compile step is required.

## Troubleshooting

- Empty contribution years:
  - verify `GITHUB_TOKEN=...` is present in `.env.local` and `/api/github` returns 200 (503 means `server.js` couldn't find/parse the line; check the console log it prints on startup)
  - check whether users have contribution data for that year
  - inspect browser console for proxy/REST failures (errors are logged, not shown as `alert()` popups).
- Unexpected zero commit totals:
  - the proxy call may fail and REST fallback may not find commits in first 5 repos.
- Tooltip not shown:
  - tooltip appears only when clicked day has non-zero contribution count.

## Revision Metadata

| Attribute | Value |
| --- | --- |
| Date of Revision | 2026-09-02 |
| Revision Number | 0.6 |
