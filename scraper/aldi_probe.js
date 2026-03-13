'use strict';
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
    if (r.status() !== 200) return;
    try {
      const text = await r.text();
      if (text.length > 1000 && (text.includes('price') || text.includes('product') || text.includes('beer'))) {
        apiHits.push({ url: url.slice(0, 180), size: text.length });
        if (apiHits.length === 1) require('fs').writeFileSync(__dirname + '/aldi_resp.json', text);
      }
    } catch(e) {}
  });

  console.log('[ALDI] Loading beer page...');
  try {
    await page.goto('https://www.aldi.us/en/weekly-specials/wine-beer-and-spirits/', { waitUntil: 'load', timeout: 25000 });
  } catch(e) {
    console.log('[ALDI] goto error:', e.message.slice(0, 80));
  }
  await sleep(3000);

  const info = await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="product"], [class*="Product"], article, [class*="item"]');
    return {
      title: document.title,
      url: location.href,
      cardCount: cards.length,
      bodySnip: document.body.innerText.slice(0, 500),
    };
  });
  console.log('[ALDI]', JSON.stringify(info, null, 2));
  console.log('[ALDI] API hits:', apiHits.length, apiHits.map(h => h.size + 'B ' + h.url.slice(0, 80)));
  await browser.close();
})().catch(e => console.error('[ALDI] FATAL:', e.message));
