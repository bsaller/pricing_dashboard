'use strict';
/**
 * Whole Foods Market beer scraper
 * Strategy: Navigate to beer page (get session + store ID), then paginate
 *   via in-page fetch calls to /api/products/category/beer
 * No bot detection issues — clean JSON API accessible within browser session.
 */
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const BEER_PAGE = 'https://www.wholefoodsmarket.com/products/beer-wine-spirits/beer';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── HELPERS ──────────────────────────────────────────────────────────────────
function guessBrand(wfBrand, name) {
  // WF gives us an explicit brand field — use it if non-generic
  const b = wfBrand ? wfBrand.trim() : '';
  if (b && b !== 'BEER (GENERAL)' && b.length > 1) {
    // Title-case it
    return b.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  // Fallback: infer from name
  const l = name.toLowerCase();
  if (l.includes('sierra nevada'))  return 'Sierra Nevada';
  if (l.includes('new belgium'))    return 'New Belgium';
  if (l.includes('dogfish'))        return 'Dogfish Head';
  if (l.includes('samuel smith'))   return 'Samuel Smith';
  if (l.includes('heineken'))       return 'Heineken';
  if (l.includes('modelo'))         return 'Modelo';
  if (l.includes('miller'))         return 'Miller';
  if (l.includes('pacifico'))       return 'Pacifico';
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

// Parse WF product name e.g. "Hazy Little Thing IPA 12pk Cans, 12 FZ"
// Trailing pattern is always ", [number] [FZ|ML|OZ|L]"
function parseWFName(name) {
  // Trailing volume: ", 12 FZ" / ", 550 ML" / ", 1 L"
  const trailFZ = name.match(/,\s*(\d+(?:\.\d+)?)\s*FZ\s*$/i);
  const trailML = name.match(/,\s*(\d+(?:\.\d+)?)\s*ML\s*$/i);
  const trailL  = name.match(/,\s*(\d+(?:\.\d+)?)\s*L\s*$/i);
  let sizeOz = 12;
  if (trailFZ)      sizeOz = parseFloat(trailFZ[1]);
  else if (trailML) sizeOz = parseFloat(trailML[1]) / 29.5735;
  else if (trailL)  sizeOz = parseFloat(trailL[1]) * 33.814;

  // Pack count: "12pk" or "12 Pack" or "4 Pack"
  const pkMatch = name.match(/(\d+)\s*(?:pk|pack)\b/i);
  const packSize = pkMatch ? parseInt(pkMatch[1], 10) : 1;

  return { sizeOz: Math.round(sizeOz * 10) / 10, packSize };
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

  let storeId = '10571'; // default; overridden by actual API URL below
  const rawItems = [];

  page.on('response', async r => {
    const url = r.url();
    if (url.includes('/api/products/category/beer')) {
      try {
        const m = url.match(/store=(\d+)/);
        if (m) storeId = m[1];
        const json = await r.json();
        if (json.results) rawItems.push(...json.results);
      } catch(e) {}
    }
  });

  console.log('[WF] Loading beer page...');
  await page.goto(BEER_PAGE, { waitUntil: 'load', timeout: 45000 });
  await sleep(4000);

  // Get total from meta (captured in first API intercept)
  // Then fetch remaining pages via in-page fetch
  const total = await page.evaluate(async (sid) => {
    const r = await fetch('/api/products/category/beer?leafCategory=beer&store=' + sid + '&limit=10&offset=0');
    const j = await r.json();
    return j.meta && j.meta.total ? j.meta.total.value : 0;
  }, storeId);

  console.log('[WF] Total products:', total, '  Store:', storeId);

  // Fetch all pages (limit=60, already have page 0 via intercept)
  const limit = 60;
  for (let offset = 60; offset < total; offset += limit) {
    const batch = await page.evaluate(async ({sid, off, lim}) => {
      const r = await fetch('/api/products/category/beer?leafCategory=beer&store=' + sid + '&limit=' + lim + '&offset=' + off);
      const j = await r.json();
      return j.results || [];
    }, {sid: storeId, off: offset, lim: limit});
    rawItems.push(...batch);
    await sleep(300);
  }

  console.log('[WF] Raw items fetched:', rawItems.length);
  await browser.close();

  // Deduplicate by slug and filter to beer-only
  const seen = new Set();
  const products = [];
  for (const item of rawItems) {
    if (!item.name || !item.regularPrice || item.regularPrice <= 0) continue;
    if (seen.has(item.slug)) continue;
    seen.add(item.slug);

    // Skip non-beer items
    const nameLower = item.name.toLowerCase();
    if (/wine|whiskey|vodka|tequila|rum |gin |bourbon|brandy|cognac|apple cider|pear cider|sake/.test(nameLower)) continue;

    const brand = guessBrand(item.brand, item.name);
    // Prepend brand to product name if not already present
    const nameHasBrand = item.name.toLowerCase().includes(brand.toLowerCase().split(' ')[0]);
    const productName = nameHasBrand ? item.name : brand + ' ' + item.name;
    const { sizeOz, packSize } = parseWFName(item.name);
    products.push({
      retailer: 'Whole Foods',
      brand,
      productName,
      style: guessStyle(productName),
      sizeOz,
      packSize,
      price: item.regularPrice,
      abv: 5.0,
    });
  }

  console.log('[WF] Products after filter:', products.length);
  if (products.length > 0) console.log('[WF] Sample:', JSON.stringify(products[0]));
  return products;
}

module.exports = { scrape };
