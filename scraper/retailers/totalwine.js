'use strict';
/**
 * Total Wine & More beer scraper — PROBE
 * Testing basic page access and DOM structure before full implementation.
 */
const { chromium } = require('playwright');

const BEER_URL = 'https://www.totalwine.com/beer/all-beer/c/000001?state=il&store=1103&psize=120';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function scrape() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  page.on('response', r => {
    const s = r.status();
    if (s >= 400 || r.url().includes('totalwine')) {
      const type = r.request().resourceType();
      if (type === 'document' || s >= 400)
        console.log('[TW][net]', s, r.url().slice(0, 100));
    }
  });

  try {
    console.log('[TW] Navigating to:', BEER_URL);
    await page.goto(BEER_URL, { waitUntil: 'networkidle', timeout: 90000 });
    await sleep(3000);

    const { classes, title, productCount } = await page.evaluate(() => {
      const tokens = new Set();
      document.querySelectorAll('*').forEach(el => {
        String(el.className || '').split(/\s+/).forEach(c => {
          if (/product|item|price|card|tile|grid/i.test(c)) tokens.add(c);
        });
      });
      // Try common selectors
      const guesses = [
        '[class*="productCard"]', '[class*="product-card"]',
        '[class*="ProductCard"]', '[class*="product_card"]',
        '.product', '[data-testid*="product"]',
      ];
      let productCount = 0;
      for (const sel of guesses) {
        const n = document.querySelectorAll(sel).length;
        if (n > 0) { productCount = n; break; }
      }
      return { classes: [...tokens].join(', '), title: document.title, productCount };
    });

    console.log('[TW] Page title:', title);
    console.log('[TW] Product count (probe):', productCount);
    console.log('[TW] Relevant classes:', classes.slice(0, 500) || '(none)');

    if (productCount === 0) {
      const html = await page.evaluate(() => document.body.innerHTML.slice(0, 3000));
      console.log('[TW] DOM snapshot:', html);
    }

    throw new Error('Probe complete — not yet implemented');
  } finally {
    await browser.close();
  }
}

module.exports = { scrape };
