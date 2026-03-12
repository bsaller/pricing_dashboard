'use strict';
/**
 * Total Wine & More beer scraper — PROBE v3
 * Stealth confirmed working. Finding correct beer URL + selectors.
 */
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

// Beer landing page — no category code needed; let the site resolve it
const BEER_URL = 'https://www.totalwine.com/beer?state=il&store=1103&psize=120';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function scrape() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  let docStatus = null;
  let finalUrl  = null;
  page.on('response', r => {
    if (r.request().resourceType() === 'document') {
      docStatus = r.status();
      finalUrl  = r.url();
      console.log('[TW][net] document', docStatus, finalUrl.slice(0, 100));
    }
  });

  try {
    console.log('[TW] Navigating to beer page...');
    await page.goto(BEER_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(2000);

    const result = await page.evaluate(() => {
      // Collect relevant class tokens
      const tokens = new Set();
      document.querySelectorAll('*').forEach(el => {
        String(el.className || '').split(/\s+/).forEach(c => {
          if (/product|item|price|card|tile|grid|plp/i.test(c)) tokens.add(c);
        });
      });

      // Try selectors most likely on Total Wine (React/SFCC)
      const guesses = [
        '[class*="productCard"]', '[class*="product-card"]', '[class*="ProductCard"]',
        '[class*="product_card"]', '[class*="plp-"]', '[class*="plpProduct"]',
        '[data-testid*="product"]', '.product',
      ];
      let productCount = 0;
      let matchedSel = '';
      for (const sel of guesses) {
        const n = document.querySelectorAll(sel).length;
        if (n > 0) { productCount = n; matchedSel = sel; break; }
      }

      // Sample first matched element's inner class names for sub-selector hints
      let sampleHtml = '';
      if (matchedSel) {
        const el = document.querySelector(matchedSel);
        sampleHtml = el ? el.innerHTML.slice(0, 600) : '';
      }

      return {
        title: document.title,
        productCount,
        matchedSel,
        sampleHtml,
        classes: [...tokens].join(', '),
      };
    });

    console.log('[TW] Page title:', result.title);
    console.log('[TW] Final URL:', finalUrl && finalUrl.slice(0, 100));
    console.log('[TW] Product count:', result.productCount, '| Selector:', result.matchedSel);
    console.log('[TW] Relevant classes:', result.classes.slice(0, 500) || '(none)');
    if (result.sampleHtml) console.log('[TW] Sample product HTML:', result.sampleHtml);
    if (result.productCount === 0) {
      const snap = await page.evaluate(() => document.body.innerHTML.slice(0, 3000));
      console.log('[TW] DOM snapshot:', snap);
    }

    throw new Error('Probe complete — not yet implemented');
  } finally {
    await browser.close();
  }
}

module.exports = { scrape };
