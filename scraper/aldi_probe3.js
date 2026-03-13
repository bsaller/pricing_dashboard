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

  // Capture ALL non-static network traffic on the beer page
  const captured = [];
  page.on('response', async r => {
    const url = r.url();
    if (!/api\.aldi\.us/.test(url)) return;
    if (r.status() !== 200) return;
    try {
      const text = await r.text();
      captured.push({ url: url.slice(0, 200), size: text.length, body: text.slice(0, 300) });
    } catch(e) {}
  });

  // Go directly to beer page, skip homepage
  console.log('[ALDI] Going to beer page...');
  await page.goto('https://www.aldi.us/products/alcohol/beer/', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);

  console.log('\nAll api.aldi.us calls:');
  captured.forEach(c => console.log(c.size + 'B', c.url));

  // Try direct API calls from page context to find beer category endpoint
  const results = await page.evaluate(async () => {
    const endpoints = [
      'https://api.aldi.us/v2/products?servicePoint=440-018&serviceType=pickup&category=21&limit=50',
      'https://api.aldi.us/v2/products?servicePoint=440-018&serviceType=pickup&categoryId=21&limit=50',
      'https://api.aldi.us/v1/products?servicePoint=440-018&serviceType=pickup&category=21',
      'https://api.aldi.us/v2/category/21/products?servicePoint=440-018&serviceType=pickup',
    ];
    const out = [];
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep, { credentials: 'include' });
        const text = await r.text();
        out.push({ ep, status: r.status, size: text.length, body: text.slice(0, 200) });
      } catch(e) {
        out.push({ ep, error: e.message });
      }
    }
    return out;
  });

  console.log('\nDirect API probes:');
  results.forEach(r => console.log(r.ep.slice(50), '|', r.status || r.error, '|', r.size || 0, 'B |', (r.body || '').slice(0, 100)));

  // Check what's actually in the DOM for product listing
  const domInfo = await page.evaluate(() => {
    const items = document.querySelectorAll('[class*="product"], [class*="tile"], [data-testid*="product"], article');
    return {
      itemCount: items.length,
      firstItem: items[0] ? items[0].innerText.slice(0, 200) : null,
    };
  });
  console.log('\nDOM items:', domInfo.itemCount);
  if (domInfo.firstItem) console.log('First item:', domInfo.firstItem);

  await browser.close();
})().catch(e => console.error('[ALDI] FATAL:', e.message));
