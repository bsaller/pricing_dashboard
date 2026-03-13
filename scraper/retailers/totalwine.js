'use strict';
/**
 * Total Wine & More beer scraper
 * URL: https://www.totalwine.com/beer/c/c0010 (IL store 1103)
 * Strategy: stealth Playwright + homepage-first nav (human-like) + scroll-capture.
 * Note: TW shows ~5 featured products on category landing + a product grid further down.
 */
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const HOME_URL = 'https://www.totalwine.com/';
const BEER_URL = 'https://www.totalwine.com/beer/c/c0010?state=il&store=1103&psize=120';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── HELPERS ──────────────────────────────────────────────────────────────────
function guessBrand(name) {
  const l = name.toLowerCase();
  if (l.includes('bud light') || l.includes('budweiser')) return 'AB InBev';
  if (l.includes('stella artois'))  return 'AB InBev';
  if (l.includes('goose island'))   return 'Goose Island';
  if (l.includes('miller'))         return 'Miller';
  if (l.includes('coors'))          return 'Molson Coors';
  if (l.includes('blue moon'))      return 'Blue Moon';
  if (l.includes('heineken'))       return 'Heineken';
  if (l.includes('modelo'))         return 'Modelo';
  if (l.includes('corona'))         return 'AB InBev';
  if (l.includes('dos equis'))      return 'Heineken';
  if (l.includes('revolution'))     return 'Revolution';
  if (l.includes('half acre'))      return 'Half Acre';
  if (l.includes('three floyds'))   return 'Three Floyds';
  if (l.includes('dogfish'))        return 'Dogfish Head';
  if (l.includes('lagunitas'))      return 'Lagunitas';
  if (l.includes('sierra nevada'))  return 'Sierra Nevada';
  if (l.includes('new belgium'))    return 'New Belgium';
  if (l.includes('sam adams') || l.includes('samuel adams')) return 'Boston Beer';
  return name.split(' ').slice(0, 2).join(' ');
}

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

function parseSizeFromText(text) {
  // Pack size: "24 pk", "12 pack", "6 ct", "4 pk"
  const pkMatch = text.match(/(\d+)\s*(?:pk|pack|ct)\b/i);
  // Volume per unit: "12 oz", "16.9 fl oz", "750 ml", "1 L"
  const ozMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:fl\s*)?oz\b/i);
  const mlMatch = text.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  const lMatch  = text.match(/(\d+(?:\.\d+)?)\s*[Ll]\b/);
  const packSize = pkMatch ? parseInt(pkMatch[1], 10) : 1;
  let sizeOz = 12;
  if (ozMatch)      sizeOz = parseFloat(ozMatch[1]);
  else if (mlMatch) sizeOz = parseFloat(mlMatch[1]) / 29.5735;
  else if (lMatch)  sizeOz = parseFloat(lMatch[1])  * 33.814;
  return { packSize, sizeOz: Math.round(sizeOz * 10) / 10 };
}

// Extract all product cards visible in DOM
async function extractCards(page) {
  return page.evaluate(() => {
    const CARD = '[class*="productCard"],[class*="product-card"],[data-testid*="product"]';
    const cards = document.querySelectorAll(CARD);
    return Array.from(cards).map(card => {
      const nameEl = card.querySelector('a[aria-label]');
      const imgEl  = card.querySelector('img[alt]');
      const txtEl  = card.querySelector('[class*="productName"],[class*="product-name"],[class*="name"]');
      const name = (nameEl && nameEl.getAttribute('aria-label'))
                || (imgEl  && imgEl.getAttribute('alt'))
                || (txtEl  && txtEl.textContent.trim())
                || '';
      const priceEls = card.querySelectorAll('[data-at*="price"],[class*="price"],[class*="Price"]');
      let price = 0;
      for (const el of priceEls) {
        const v = parseFloat(el.textContent.replace(/[^0-9.]/g, ''));
        if (v > 0) { price = v; break; }
      }
      return { name: name.trim(), price, cardText: card.textContent || '' };
    });
  });
}

async function attemptScrape(page) {
  // Human-like: visit homepage first, then navigate to beer
  await page.goto(HOME_URL, { waitUntil: 'load', timeout: 30000 });
  await sleep(2000 + Math.random() * 1000);

  await page.goto(BEER_URL, { waitUntil: 'load', timeout: 60000 });
  await sleep(4000);

  // Wait for any product card to appear
  await page.waitForSelector(
    '[class*="productCard"],[class*="product-card"]',
    { timeout: 12000 }
  ).catch(() => {});

  const seen = new Map();

  // Scroll-capture loop
  const scrollH = await page.evaluate(() => document.body.scrollHeight);
  const step = 500;
  let stallRounds = 0;
  let lastCount = 0;

  for (let pos = 0; pos <= Math.max(scrollH, 8000); pos += step) {
    await page.evaluate(y => window.scrollTo(0, y), pos);
    await sleep(400);

    const batch = await extractCards(page);
    for (const item of batch) {
      if (item.name && item.price > 0 && !seen.has(item.name)) {
        seen.set(item.name, item);
      }
    }

    if (seen.size === lastCount) {
      if (++stallRounds >= 10) break;
    } else {
      stallRounds = 0;
      lastCount = seen.size;
    }
  }

  return seen;
}

// ── MAIN SCRAPE ───────────────────────────────────────────────────────────────
async function scrape() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1920, height: 1080 },
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const page = await context.newPage();
  let seen = new Map();

  try {
    seen = await attemptScrape(page);
    console.log('[TW] Attempt 1:', seen.size, 'products');

    // Retry once if blocked (< 2 products)
    if (seen.size < 2) {
      console.log('[TW] Retrying after 10s...');
      await sleep(10000);
      seen = await attemptScrape(page);
      console.log('[TW] Attempt 2:', seen.size, 'products');
    }
  } finally {
    await browser.close();
  }

  const products = [];
  for (const r of seen.values()) {
    const { packSize, sizeOz } = parseSizeFromText(r.cardText);
    products.push({
      retailer: 'Total Wine',
      brand: guessBrand(r.name),
      productName: r.name,
      style: guessStyle(r.name),
      sizeOz,
      packSize,
      price: r.price,
      abv: 5.0,
    });
  }

  if (products.length > 0) console.log('[TW] Sample:', JSON.stringify(products[0]));
  return products;
}

module.exports = { scrape };
