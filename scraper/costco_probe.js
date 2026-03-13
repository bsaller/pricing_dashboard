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
      if (text.length > 2000 && (text.includes('price') || text.includes('product') || text.includes('item'))) {
        apiHits.push({ url: url.slice(0, 180), size: text.length });
        if (apiHits.length === 1) require('fs').writeFileSync(__dirname + '/costco_resp.json', text);
      }
    } catch(e) {}
  });

  console.log('[Costco] Loading beer search...');
  try {
    await page.goto('https://www.costco.com/CatalogSearch?dept=Beer&keyword=beer', { waitUntil: 'load', timeout: 25000 });
  } catch(e) {
    console.log('[Costco] goto error:', e.message.slice(0, 80));
  }
  await sleep(4000);

  const info = await page.evaluate(() => {
    const cards = document.querySelectorAll('.product-list-item, [class*="product"], [automation-id="productDescription"]');
    return {
      title: document.title,
      url: location.href,
      cardCount: cards.length,
      bodySnip: document.body.innerText.slice(0, 400),
    };
  });
  console.log('[Costco]', JSON.stringify(info, null, 2));
  console.log('[Costco] API hits:', apiHits.length, apiHits.map(h => h.size + 'B ' + h.url.slice(0, 80)));
  await browser.close();
})().catch(e => console.error('[Costco] FATAL:', e.message));
