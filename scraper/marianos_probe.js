'use strict';
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

// From __INITIAL_STATE__: locationId = 53100503 (333 E Benton Pl, Chicago)
const LOCATION_ID = '53100503';
const TAXONOMY_ID = '5100'; // beer department

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Land on site first to get session cookies
  await page.goto('https://www.marianos.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Try various Kroger API patterns from within the page context
  const results = await page.evaluate(async ({ locId, taxId }) => {
    const endpoints = [
      `/api/2.0/products/search?taxonomyId=${taxId}&locationId=${locId}&page=1&limit=10`,
      `/api/2.0/products/category?taxonomyId=${taxId}&locationId=${locId}&limit=10`,
      `/api/2.0/products/search?query=beer&locationId=${locId}&limit=10`,
      `/atlas/v1/product-location/category/${taxId}?storeId=${locId}&limit=10`,
    ];
    const out = [];
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep, { credentials: 'include', headers: { 'Accept': 'application/json, text/plain, */*' } });
        const text = await r.text();
        out.push({ ep, status: r.status, body: text.slice(0, 300) });
      } catch(e) {
        out.push({ ep, error: e.message });
      }
    }
    return out;
  }, { locId: LOCATION_ID, taxId: TAXONOMY_ID });

  results.forEach(r => {
    console.log('\n---', r.ep);
    console.log('Status:', r.status || r.error);
    if (r.body) console.log('Body:', r.body);
  });

  await browser.close();
})();
