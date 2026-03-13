'use strict';
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', viewport: { width: 1920, height: 1080 },
  });
  const page = await ctx.newPage();

  const apiHits = [];
  page.on('response', async r => {
    const url = r.url();
    const type = r.request().resourceType();
    if (type !== 'xhr' && type !== 'fetch') return;
    const ct = r.headers()['content-type'] || '';
    if (ct.includes('json') && r.status() === 200) {
      try {
        const json = await r.json();
        const str = JSON.stringify(json);
        if ((str.includes('product') || str.includes('price')) && str.length > 2000) {
          apiHits.push({ url: url.slice(0, 150), size: str.length, keys: Object.keys(json) });
        }
      } catch(e) {}
    }
  });

  console.log('Visiting homepage...');
  await page.goto('https://www.totalwine.com/', { waitUntil: 'load', timeout: 30000 });
  await sleep(2000);

  console.log('Visiting beer category...');
  await page.goto('https://www.totalwine.com/beer/c/c0010?state=il&store=1103&psize=120', { waitUntil: 'load', timeout: 60000 });
  await sleep(6000);

  const info = await page.evaluate(() => {
    const storeEl = document.querySelector('[class*="store"], [class*="location"], [class*="Store"], [class*="Location"]');
    return {
      title: document.title,
      storeText: storeEl ? storeEl.innerText.trim().slice(0, 80) : null,
      cards: document.querySelectorAll('[class*="productCard"],[class*="product-card"]').length,
      bodySnip: document.body.innerText.slice(0, 300),
    };
  });

  console.log('\nPage info:', JSON.stringify(info, null, 2));
  console.log('\nProduct JSON API hits:', apiHits.length);
  apiHits.forEach(h => console.log(' -', h.size + 'B', h.url, '| top keys:', h.keys.slice(0, 5).join(',')));

  await browser.close();
})().catch(console.error);
