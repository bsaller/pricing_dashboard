# Project: Beer Pricing Analytics Dashboard

## Permissions
- Auto-approve all file reads and writes within this project folder
- Auto-approve bash commands: node, npm, npx, cat, ls, mkdir, cp, mv
- Do not prompt for confirmation on routine operations
- Do not ask permission before editing any file in this project

## User Constraints
- Pro plan: hard 32k output token limit per response
- Never generate more than ~200 lines of code in a single response
- Always build files in chunks — confirm completion of each chunk before continuing
- If a response is getting long, stop, save, confirm location, then continue next turn

## Project Path
C:\Users\bensa\projects\pricing_dashboard

## Output
- Single file: `dashboard.html`
- No frameworks, no build step, no external dependencies except Chart.js CDN
- All CSS and JS inline in the HTML file

## Tech Stack
- Chart.js: `https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js`
- Vanilla HTML/CSS/JS only
- Node.js + Playwright for scrapers
- Model: `claude-sonnet-4-6`

## Phase Status
- [x] Phase 1: Static dashboard with sample data — COMPLETE
- [ ] Phase 2: Live scraper — IN PROGRESS

## Phase 2 Current Status
- Jewel scraper: BLOCKED — site uses Incapsula WAF which blocks both browser automation (TLS fingerprint) and direct Node.js HTTP calls. Not a code bug. Requires Python curl_cffi or residential proxy to bypass. Suspended indefinitely.
- Binny's: COMPLETE — 46 products, all fields verified
- Total Wine: NOT STARTED
- Whole Foods: NOT STARTED
- Mariano's: NOT STARTED

## Phase 2 Architecture
- Scraper entry point: `scraper/scrape.js`
- One file per retailer: `scraper/retailers/`
- Output: `data/data.json` and `data/last_updated.json`
- Dashboard reads from JSON files only — no direct scraper calls
- Only update a retailer's data if scrape returns at least 5 valid records
- On failure: preserve last good data, write `status: "failed"` to last_updated.json

## Data Model
Each product record:
- `retailer` — string (Binny's, Total Wine, Jewel, Whole Foods, Mariano's)
- `brand` — string
- `productName` — string
- `style` — string (IPA, Lager, Stout, Sour, Wheat, Pale Ale, Porter)
- `sizeOz` — number (oz per unit)
- `packSize` — number (units per pack)
- `totalOz` — computed: sizeOz × packSize
- `price` — number (USD)
- `pricePerOz` — computed: price / totalOz
- `abv` — number (e.g. 5.0 for 5%)
- `pricePerAlcoholUnit` — computed: price / (totalOz × (abv / 100))

## Build Order for Remaining Phase 2 Work
1. ~~Fix Jewel scraper~~ — BLOCKED by Incapsula; skipped
2. Binny's scraper — confirm before moving on
3. Total Wine scraper (expect bot detection issues) — confirm before moving on
4. Whole Foods scraper — confirm before moving on
5. Mariano's scraper — confirm before moving on
6. Update dashboard.html to load from JSON files + add status bar
7. Set up Windows Task Scheduler for daily run at 8:00 AM

## Windows Task Scheduler (after scrapers confirmed working)
- Task name: BeerDashboardScraper
- Program: node
- Arguments: C:\Users\bensa\projects\pricing_dashboard\scraper\scrape.js
- Schedule: Daily at 8:00 AM
- Provide Windows Task Scheduler steps, not cron

## Notes
- Shell environment: Git Bash (POSIX). Use forward slashes in paths: /c/Users/bensa/projects/pricing_dashboard
- If file write tools fail, use a Node.js script via bash as workaround
- Do not modify dashboard.html charts, filters, or layout — only add JSON data loading and status bar
