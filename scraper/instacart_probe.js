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
    if (!url.includes('/graphql')) return;
    if (r.status() !== 200) return;
    try {
      const text = await r.text();
      const op = new URL(url).searchParams.get('operationName') || 'unknown';
      if (text.includes('displayPrice') || text.includes('priceString') || text.includes('"price":{')) {
        productHits.push({ op, size: text.length });
        fs.writeFileSync(__dirname + `/ic_products_${op}.json`, text);
        console.log('[IC] PRODUCT HIT:', op, text.length + 'B');
      }
    } catch(e) {}
  });

  console.log('[IC] Navigating to Jewel-Osco beer search...');
  await page.goto('https://www.instacart.com/store/jewel-osco/s?k=beer', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // Scroll to trigger lazy product load
  for (let i = 0; i < 5; i++) {
    await page.evaluate(i => window.scrollTo(0, i * 800), i);
    await sleep(800);
  }
  await sleep(3000);

  const dom = await page.evaluate(() => {
    const items = document.querySelectorAll('[class*="item-card"], [data-testid*="item"], [class*="ItemCard"], [class*="product-item"]');
    return {
      title: document.title,
      url: location.href,
      itemCount: items.length,
      firstItem: items[0] ? items[0].innerText.slice(0, 150) : null,
      bodySnip: document.body.innerText.slice(0, 400),
    };
  });

  console.log('\n[IC] Page:', JSON.stringify(dom, null, 2));
  console.log('[IC] Product GQL hits:', productHits.length);
  productHits.forEach(h => console.log(' -', h.op, h.size + 'B'));

  await browser.close();
})().catch(e => console.error('[IC] FATAL:', e.message));
