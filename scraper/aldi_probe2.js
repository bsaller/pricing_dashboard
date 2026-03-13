'use strict';
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  const productHits = [];
  page.on('response', async r => {
    const url = r.url();
    if (!url.includes('api.aldi.us/v2/products?')) return;
    if (r.status() !== 200) return;
    try {
      const json = await r.json();
      const count = json.data ? json.data.length : 0;
      productHits.push({ url: url.slice(0, 180), count, data: json.data });
      fs.writeFileSync(__dirname + `/aldi_products_${productHits.length}.json`, JSON.stringify(json, null, 2));
      console.log('[ALDI] product hit:', count, 'items');
    } catch(e) {}
  });

  console.log('[ALDI] Loading homepage...');
  await page.goto('https://www.aldi.us', { waitUntil: 'load', timeout: 25000 });
  await sleep(2000);

  console.log('[ALDI] Navigating to beer...');
  await page.goto('https://www.aldi.us/products/alcohol/beer/', { waitUntil: 'load', timeout: 25000 });
  await sleep(4000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(2000);

  const info = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    bodySnip: document.body.innerText.slice(0, 500),
  }));

  console.log('\n[ALDI] Page:', JSON.stringify(info, null, 2));
  const totalItems = productHits.reduce((s, h) => s + h.count, 0);
  console.log('[ALDI] Product API hits:', productHits.length, 'batches,', totalItems, 'items total');

  if (productHits.length > 0 && productHits[0].data && productHits[0].data[0]) {
    console.log('\nSample product keys:', Object.keys(productHits[0].data[0]));
    console.log('Sample:', JSON.stringify(productHits[0].data[0], null, 2).slice(0, 800));
  }

  await browser.close();
})().catch(e => console.error('[ALDI] FATAL:', e.message));
