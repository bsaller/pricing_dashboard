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
  let firstApiResp = null;

  page.on('response', async r => {
    const url = r.url();
    if (url.includes('/api/products/category/beer') && !firstApiResp) {
      try { firstApiResp = await r.json(); } catch(e){}
    }
  });

  await page.goto('https://www.wholefoodsmarket.com/products/beer-wine-spirits/beer', { waitUntil: 'load', timeout: 45000 });
  await sleep(5000);

  if (firstApiResp) {
    console.log('meta:', JSON.stringify(firstApiResp.meta));
    console.log('product count:', firstApiResp.results.length);
    const sample = firstApiResp.results.slice(1, 5); // skip first odd one
    sample.forEach(p => console.log('  ', JSON.stringify(p)));

    // Try calling next page directly via page.evaluate fetch
    const storeId = new URL(page.url()).searchParams.get('store') || '10571';
    const page2 = await page.evaluate(async (sid) => {
      const r = await fetch('/api/products/category/beer?leafCategory=beer&store=' + sid + '&limit=10&offset=60');
      const j = await r.json();
      return { count: j.results ? j.results.length : 0, sample: j.results ? j.results.slice(0,2) : [] };
    }, '10571');
    console.log('Page2 via in-page fetch:', JSON.stringify(page2));
  }

  await browser.close();
})().catch(e => console.error('ERROR:', e.message));
