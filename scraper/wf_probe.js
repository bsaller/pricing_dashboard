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
    const allowed = ['xhr', 'fetch'];
    if (allowed.indexOf(type) === -1) return;
    try {
      const txt = await r.text();
      const hasPrice = txt.includes('"price"') || txt.includes('"regularPrice"');
      const hasProduct = txt.includes('"productName"') || txt.includes('"beer"');
      if ((hasPrice || hasProduct) && txt.length > 500) {
        apiHits.push({ url: url.slice(0,120), size: txt.length, snip: txt.slice(0,200) });
      }
    } catch(e) {}
  });

  await page.goto('https://www.wholefoodsmarket.com/products/beer-wine-spirits/beer', { waitUntil: 'load', timeout: 45000 });
  await sleep(5000);

  const info = await page.evaluate(() => ({
    title: document.title.slice(0,80),
    url: location.href.slice(0,100),
    prodCards: document.querySelectorAll('[class*="product"], [data-testid*="product"], article').length,
    bodyLen: document.body.innerHTML.length,
    hasNextData: typeof window.__NEXT_DATA__ !== 'undefined',
    nextDataSize: typeof window.__NEXT_DATA__ !== 'undefined' ? JSON.stringify(window.__NEXT_DATA__).length : 0,
  }));
  console.log(JSON.stringify(info, null, 2));
  console.log('API hits with price/product data:', apiHits.length);
  apiHits.slice(0, 3).forEach(h => {
    console.log('  URL:', h.url);
    console.log('  Size:', h.size, 'B  Snip:', h.snip.slice(0,100));
  });
  await browser.close();
})().catch(e => console.error('ERROR:', e.message.slice(0,100)));
