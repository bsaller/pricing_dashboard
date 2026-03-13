'use strict';
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Target beer category
const BEER_URL = 'https://www.target.com/c/beer/-/N-5xt2e';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', viewport: { width: 1440, height: 900 },
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
        if (str.length > 3000 && (str.includes('price') || str.includes('product') || str.includes('item'))) {
          apiHits.push({ url: url.slice(0, 180), size: str.length, keys: Object.keys(json) });
          // Save the first large product hit
          if (apiHits.length === 1) {
            require('fs').writeFileSync(__dirname + '/target_resp.json', str);
            console.log('Saved first large hit to target_resp.json');
          }
        }
      } catch(e) {}
    }
  });

  console.log('Loading Target beer page...');
  await page.goto(BEER_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(5000);

  const info = await page.evaluate(() => {
    const cards = document.querySelectorAll('[data-test="product-list"] [data-test="product-title"], [class*="ProductTitle"], [data-test*="product"]');
    return {
      title: document.title,
      cardCount: cards.length,
      bodySnip: document.body.innerText.slice(0, 400),
      sampleCard: cards[0] ? cards[0].innerText.trim() : null,
    };
  });

  console.log('\nPage info:', JSON.stringify(info, null, 2));
  console.log('\nAPI hits with product data:', apiHits.length);
  apiHits.slice(0, 5).forEach(h => console.log(' -', h.size + 'B', h.url.slice(0, 100), '| keys:', h.keys.slice(0, 6).join(',')));

  await browser.close();
})().catch(console.error);
