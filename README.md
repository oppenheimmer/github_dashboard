# GitHub Activity Dashboard

Static web dashboard that combines activity data from two fixed GitHub accounts into a single profile header and contribution calendar view.

## Current State (as of 2026-03-06)

- Runtime stack: plain `index.html` + `styles.css` + `app.js` (no build system).
- Fixed users in code: `gradientwolf` (primary) and `oppenheimmer` (secondary).
- Calendar years rendered: current year and previous year only.
- Data source strategy: GitHub GraphQL first, REST fallback for commit estimation, then empty-data fallback.
- The app is embeddable as a simple script/style include with no extra runtime config.

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
    - stat containers: `#follow-info`, `#following-info`, `#repo-info`
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

## Runtime Flow

1. `DOMContentLoaded` creates `new GitHubDashboard()`.
2. Constructor sets defaults (year, users, token, cache, root).
3. `init()`:
   - computes available years (`[currentYear, currentYear - 1]`)
   - calls `loadProfiles(defaultUsers)`
   - registers global click listener for tooltip dismissal.
4. `loadProfiles()`:
   - fetches profile details via GraphQL per user
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

- Endpoint: `https://api.github.com/graphql`
- Queried fields include:
  - `login`, `name`, `avatarUrl`, `bio`
  - follower/following totals
  - public non-fork repo count
  - starred repo count

### Contribution Data (GraphQL first)

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

- A default personal access token is embedded in `app.js` as split string parts and joined at runtime.
- GraphQL fetches require token presence; REST requests include auth header if token exists.

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

- Default users: hardcoded to `gradientwolf`, `oppenheimmer`.
- Default root: `document` (supports embedding into a host page context).
- Available years: current + previous.
- Cache TTL: 300000 ms (5 minutes).
- No environment variable loader; token and behavior are code-driven.

## Known Gaps / Mismatches in Current Implementation

- `app.js` references several DOM IDs that are not present in current `index.html`:
  - `#profile-name`
  - `#load-profile`
  - `#commits-count`
  - `#current-year`
  - `#contribution-grid` (fallback path only)
- Some loading/error helpers silently no-op because related elements do not exist.
- Username display in header currently renders raw handles (without `@` prefix).
- Header layout uses right-side commit pills; it does not currently implement a single medium GitHub logo block in the left-side stacked stats area.
- Contribution tooltip text currently hardcodes PR merged count as `0 PRs merged`.

## Local Development

No build step is required.

Option 1:

- Open `index.html` directly in a browser.

Option 2 (recommended):

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Deployment / Embedding Notes

- Designed as a static embeddable module:
  - include `styles.css`
  - include `app.js`
  - ensure required DOM structure from `index.html` exists in host page.
- No bundler, package manager, or compile step is required.

## Troubleshooting

- Empty contribution years:
  - verify token validity and rate limits
  - check whether users have contribution data for that year
  - inspect browser console for GraphQL/REST failures.
- Unexpected zero commit totals:
  - GraphQL may fail and REST fallback may not find commits in first 5 repos.
- Tooltip not shown:
  - tooltip appears only when clicked day has non-zero contribution count.

## Revision Metadata

| Attribute | Value |
| --- | --- |
| Date of Revision | 2026-03-06 |
| Revision Number | 0.2 |
