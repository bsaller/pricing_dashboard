'use strict';
/**
 * Tony's Fresh Market beer scraper
 * Strategy: Instacart GraphQL API (Items operation) — Tony's shows "No markup"
 *   so prices reflect in-store shelf prices.
 * Navigate to Tony's beer search on Instacart, scroll to trigger all lazy-loaded
 * Items batches, collect and deduplicate.
 */
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const BEER_URL = 'https://www.instacart.com/store/tonys-fresh-market/s?k=beer';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── HELPERS ──────────────────────────────────────────────────────────────────
function guessStyle(name) {
  const l = name.toLowerCase();
  if (/\bipa\b|india pale/.test(l))              return 'IPA';
  if (/\bstout\b/.test(l))                        return 'Stout';
  if (/\bporter\b/.test(l))                       return 'Porter';
  if (/\bsour\b|\bgose\b|\blambic\b/.test(l))     return 'Sour';
  if (/\bwheat\b|\bweizen\b|\bwitbier\b/.test(l)) return 'Wheat';
  if (/\bpale ale\b/.test(l))                     return 'Pale Ale';
  return 'Lager';
}

function titleCase(str) {
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// Parse pack size and oz from Instacart pricingUnitString e.g. "6 x 12 fl oz", "24 x 12 oz", "1 x 25.4 fl oz"
function parsePricingUnit(unitStr, sizeStr) {
  if (unitStr) {
    const m = unitStr.match(/^(\d+)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:fl\s*)?oz/i);
    if (m) return { packSize: parseInt(m[1], 10), sizeOz: parseFloat(m[2]) };
    const single = unitStr.match(/^(\d+(?:\.\d+)?)\s*(?:fl\s*)?oz/i);
    if (single) return { packSize: 1, sizeOz: parseFloat(single[1]) };
  }
  // Fall back to name/size field
  if (sizeStr) {
    const oz = sizeStr.match(/(\d+(?:\.\d+)?)\s*(?:fl\s*)?oz/i);
    if (oz) return { packSize: 1, sizeOz: parseFloat(oz[1]) };
    const ml = sizeStr.match(/(\d+(?:\.\d+)?)\s*ml/i);
    if (ml) return { packSize: 1, sizeOz: parseFloat(ml[1]) / 29.5735 };
  }
  return { packSize: 1, sizeOz: 12 };
}

// Extract ABV from product name e.g. "Miller Lite ... 4.2% ABV ..."
function parseAbv(name) {
  const m = name.match(/(\d+(?:\.\d+)?)\s*%\s*abv/i);
  return m ? parseFloat(m[1]) : 5.0;
}

// ── MAIN SCRAPE ───────────────────────────────────────────────────────────────
async function scrape() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Collect all Items batches
  const seen = new Map(); // productId -> item

  page.on('response', async r => {
    const url = r.url();
    if (!url.includes('/graphql')) return;
    if (r.status() !== 200) return;
    try {
      const op = new URL(url).searchParams.get('operationName') || '';
      if (op !== 'Items') return;
      const json = await r.json();
      const items = (json.data && json.data.items) || [];
      for (const item of items) {
        if (item.productId && !seen.has(item.productId)) {
          seen.set(item.productId, item);
        }
      }
    } catch(e) {}
  });

  console.log("[Tony's] Loading beer search...");
  await page.goto(BEER_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(4000);

  // Scroll to trigger all lazy-loaded product batches.
  // Always scroll to the bottom; only stop early if page is truly exhausted.
  const step = 300;
  let pos = 0;
  let lastCount = 0;
  let stallRounds = 0;

  while (true) {
    pos += step;
    await page.evaluate(y => window.scrollTo(0, y), pos);
    await sleep(350);

    // Refresh scrollHeight as content loads
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);

    if (seen.size > lastCount) {
      stallRounds = 0;
      lastCount = seen.size;
    } else {
      stallRounds++;
    }

    // Stop only when we've reached the bottom AND stalled for 2 seconds
    if (pos >= currentHeight && stallRounds >= 6) break;
    // Safety cap
    if (pos > 60000) break;
  }

  // Final wait for any in-flight requests
  await sleep(3000);
  await browser.close();

  console.log(`[Tony's] Raw items captured: ${seen.size}`);

  const products = [];
  for (const item of seen.values()) {
    const priceStr = item.price?.viewSection?.itemCard?.priceString;
    const unitStr  = item.price?.viewSection?.itemCard?.pricingUnitString;
    if (!priceStr || !item.name) continue;

    const price = parseFloat(priceStr.replace(/[^0-9.]/g, ''));
    if (!price || price <= 0) continue;

    // Skip non-beer items
    const nameLower = item.name.toLowerCase();
    if (/wine|whiskey|vodka|tequila|\brum\b|\bgin\b|bourbon|brandy|cognac|cider|sake|kombucha|seltzer/
        .test(nameLower)) continue;

    const brand = titleCase(item.brandName || item.name.split(' ').slice(0, 2).join(' '));
    let { packSize, sizeOz } = parsePricingUnit(unitStr, item.size);
    // Sanity check: if sizeOz looks like a total-oz value (>64oz per "unit"),
    // and dividing by packSize yields a plausible single-container size, correct it.
    if (sizeOz > 64 && packSize > 1) {
      const perUnit = sizeOz / packSize;
      if (perUnit <= 64) sizeOz = perUnit;
    }

    products.push({
      retailer: "Tony's Fresh Market",
      brand,
      productName: item.name,
      style: guessStyle(item.name),
      sizeOz,
      packSize,
      price,
      abv: parseAbv(item.name),
    });
  }

  console.log(`[Tony's] Products after filter: ${products.length}`);
  if (products.length > 0) console.log(`[Tony's] Sample:`, JSON.stringify(products[0]));
  return products;
}

module.exports = { scrape };
