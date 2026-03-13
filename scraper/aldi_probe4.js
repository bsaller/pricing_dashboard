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

  let beerResponse = null;
  page.on('response', async r => {
    const url = r.url();
    if (url.includes('v3/product-search') && url.includes('categoryKey=21')) {
      const json = await r.json();
      beerResponse = json;
      fs.writeFileSync(__dirname + '/aldi_beer.json', JSON.stringify(json, null, 2));
      console.log('[ALDI] Beer search API captured:', url.slice(0, 120));
    }
  });

  await page.goto('https://www.aldi.us/products/alcohol/beer/', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);

  if (beerResponse) {
    const keys = Object.keys(beerResponse);
    console.log('Response keys:', keys);
    const items = beerResponse.data || beerResponse.products || beerResponse.results || beerResponse.items || [];
    console.log('Item count:', items.length);
    if (items[0]) {
      console.log('Item keys:', Object.keys(items[0]));
      console.log('Sample item:', JSON.stringify(items[0], null, 2).slice(0, 1000));
    }
  } else {
    console.log('No beer response captured');
    // Try calling directly from page context
    const result = await page.evaluate(async () => {
      const r = await fetch('https://api.aldi.us/v3/product-search?currency=USD&serviceType=pickup&categoryKey=21&limit=60&offset=0&sort=relevance&testVariant=A&servicePoint=440-018', { credentials: 'include' });
      return { status: r.status, body: (await r.text()).slice(0, 500) };
    });
    console.log('Direct call:', result);
  }

  await browser.close();
})().catch(e => console.error('[ALDI] FATAL:', e.message));
