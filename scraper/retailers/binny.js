'use strict';
/**
 * Binny's Beverage Depot beer scraper
 * URL: https://www.binnys.com/beer/
 * Strategy: paginate the beer category, extract product tiles from the DOM.
 */
const { chromium } = require('playwright');

const BASE_URL  = 'https://www.binnys.com/beer/';
const PAGE_SIZE = 96; // ?limit= param Binny's supports

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
  if (/\bipa\b|india pale/.test(l))               return 'IPA';
  if (/\bstout\b/.test(l))                         return 'Stout';
  if (/\bporter\b/.test(l))                        return 'Porter';
  if (/\bsour\b|\bgose\b|\blambic\b/.test(l))      return 'Sour';
  if (/\bwheat\b|\bweizen\b|\bwitbier\b/.test(l))  return 'Wheat';
  if (/\bpale ale\b/.test(l))                      return 'Pale Ale';
  return 'Lager';
}

// Parse "12pk 12oz Cans" → { packSize: 12, sizeOz: 12 }
function parseSizeFromName(name) {
  const pkMatch  = name.match(/(\d+)\s*(?:pk|pack|ct|can|bottle)/i);
  const ozMatch  = name.match(/(\d+(?:\.\d+)?)\s*oz/i);
  const mlMatch  = name.match(/(\d+(?:\.\d+)?)\s*ml/i);
  const lMatch   = name.match(/(\d+(?:\.\d+)?)\s*L\b/i);

  const packSize = pkMatch ? parseInt(pkMatch[1], 10) : 1;
  let sizeOz = 12;
  if (ozMatch)      sizeOz = parseFloat(ozMatch[1]);
  else if (mlMatch) sizeOz = parseFloat(mlMatch[1]) / 29.5735;
  else if (lMatch)  sizeOz = parseFloat(lMatch[1])  * 33.814;

  return { packSize, sizeOz: Math.round(sizeOz * 10) / 10 };
}

// ── SCRAPE ONE PAGE ───────────────────────────────────────────────────────────
async function scrapePage(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await sleep(3000);

  return page.evaluate(() => {
    const results = [];
    // Binny's uses BEM __-style classes; exclude hero/content-card tiles
    const tiles = document.querySelectorAll(
      '.product-item:not(.product-item--content-card)'
    );
    tiles.forEach(tile => {
      const nameEl  = tile.querySelector('.product-item__title');
      const priceEl = tile.querySelector('.product-item__price');
      const pkgEl   = tile.querySelector('.product-item__package');
      if (!nameEl || !priceEl) return;

      const name  = nameEl.textContent.trim();
      const pkg   = pkgEl ? pkgEl.textContent.trim() : '';
      const price = parseFloat(priceEl.textContent.replace(/[^0-9.]/g, ''));
      if (!name || !price || price <= 0) return;
      results.push({ name, pkg, price });
    });
    return results;
  });
}

// ── MAIN SCRAPE ───────────────────────────────────────────────────────────────
async function scrape() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
  });
  const page = await context.newPage();
  const products = [];

  try {
    // ── Page 1: get total count, scrape first batch ────────────────────────
    const url1 = `${BASE_URL}?limit=${PAGE_SIZE}&p=1`;
    console.log('[Binny] Scraping page 1:', url1);
    const raw1 = await scrapePage(page, url1);
    console.log('[Binny] Page 1 raw tiles:', raw1.length);

    if (raw1.length === 0) {
      const { html, classes } = await page.evaluate(() => {
        // Collect all unique class tokens that mention product/item/price/card
        const tokens = new Set();
        document.querySelectorAll('*').forEach(el => {
          el.className && String(el.className).split(/s+/).forEach(c => {
            if (/product|item|price|card|tile|grid/i.test(c)) tokens.add(c);
          });
        });
        return {
          html:    document.body.innerHTML.slice(0, 6000),
          classes: [...tokens].join(', '),
        };
      });
      console.log('[Binny] Relevant class names found:', classes || '(none)');
      console.log('[Binny] DOM snapshot (first 6000 chars):', html);
      throw new Error('No product tiles found on page 1 — selector may need updating');
    }

    // Check for a second page
    const hasPage2 = await page.evaluate(() =>
      !!document.querySelector('a[href*="p=2"], .pages-item-next, [class*="next"]')
    );
    let raw2 = [];
    if (hasPage2) {
      const url2 = `${BASE_URL}?limit=${PAGE_SIZE}&p=2`;
      console.log('[Binny] Scraping page 2:', url2);
      raw2 = await scrapePage(page, url2);
      console.log('[Binny] Page 2 raw tiles:', raw2.length);
    }

    for (const r of [...raw1, ...raw2]) {
      // pkg (e.g. "12pk 12oz Cans") is more reliable for size than the title
      const { packSize, sizeOz } = parseSizeFromName(r.pkg || r.name);
      products.push({
        retailer:    "Binny's",
        brand:       guessBrand(r.name),
        productName: r.name,
        style:       guessStyle(r.name),
        sizeOz,
        packSize,
        price:       r.price,
        abv:         5.0, // Binny's doesn't surface ABV in listings
      });
    }

    console.log('[Binny] Total products parsed:', products.length);
  } finally {
    await browser.close();
  }

  return products;
}

module.exports = { scrape };
