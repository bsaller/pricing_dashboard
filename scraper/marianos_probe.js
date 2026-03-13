'use strict';
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const jsonHits = [];
  page.on('response', async r => {
    const url = r.url();
    const ct = r.headers()['content-type'] || '';
    if (ct.includes('json') && (url.includes('kroger') || url.includes('marianos') || url.includes('api'))) {
      try {
        const json = await r.json();
        jsonHits.push({ url: url.slice(0, 150), keys: Object.keys(json) });
      } catch(e) {}
    }
  });

  console.log('Loading page...');
  await page.goto('https://www.marianos.com/pl/beer/5100', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait up to 15s for product cards to appear
  try {
    await page.waitForSelector('[data-testid="product-card"], .ProductCard, [class*="product-card"], [class*="ProductCard"]', { timeout: 15000 });
    console.log('Product cards found!');
  } catch(e) {
    console.log('No product cards selector matched, trying text...');
  }

  await new Promise(r => setTimeout(r, 3000));

  // Look at the DOM for product data
  const productData = await page.evaluate(() => {
    // Try various selectors Kroger sites use
    const selectors = [
      '[data-testid="product-card"]',
      '[class*="product-card"]',
      '[class*="ProductCard"]',
      '[class*="kds-Card"]',
      'article',
      '[data-qa="product-card"]',
    ];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        return {
          selector: sel,
          count: els.length,
          sample: els[0].innerText.slice(0, 300),
          html: els[0].outerHTML.slice(0, 500),
        };
      }
    }
    // Fallback: look for any price elements
    const prices = document.querySelectorAll('[class*="price"], [class*="Price"]');
    return {
      selector: 'price fallback',
      count: prices.length,
      sample: prices[0] ? prices[0].innerText : 'none',
      bodyText: document.body.innerText.slice(0, 500),
    };
  });

  console.log('\nDOM product data:', JSON.stringify(productData, null, 2));
  console.log('\nJSON API hits:', jsonHits.length);
  jsonHits.forEach(h => console.log(' -', h.url, '| keys:', h.keys.join(', ')));

  await browser.close();
})();
