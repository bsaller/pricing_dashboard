'use strict';
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  const responses = [];
  page.on('response', async r => {
    const url = r.url();
    if (url.includes('/api/products/category/beer')) {
      try {
        const json = await r.json();
        responses.push({ url, json });
      } catch(e) {}
    }
  });

  await page.goto('https://www.wholefoodsmarket.com/products/beer-wine-spirits/beer', { waitUntil: 'load', timeout: 45000 });
  await sleep(5000);

  if (responses.length > 0) {
    const r = responses[0];
    console.log('URL:', r.url);
    const json = r.json;
    console.log('Top keys:', Object.keys(json).join(', '));
    // Find product array
    const products = json.products || json.results || json.items || json.data;
    if (products && Array.isArray(products)) {
      console.log('Products count:', products.length);
      console.log('First product keys:', Object.keys(products[0]).join(', '));
      console.log('First product:', JSON.stringify(products[0]).slice(0, 500));
      console.log('---');
      // Check total count info
      console.log('Pagination info:');
      console.log('  json.totalCount:', json.totalCount);
      console.log('  json.total:', json.total);
      console.log('  json.count:', json.count);
      console.log('  json.limit:', json.limit);
      console.log('  json.offset:', json.offset);
    }
    fs.writeFileSync('/c/Users/bensa/projects/pricing_dashboard/scraper/wf_api_sample.json', JSON.stringify(json, null, 2));
    console.log('Saved to wf_api_sample.json');
  } else {
    console.log('No API response captured');
  }
  await browser.close();
})().catch(e => console.error('ERROR:', e.message));
