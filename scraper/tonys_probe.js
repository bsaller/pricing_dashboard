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

  const itemBatches = [];
  page.on('response', async r => {
    const url = r.url();
    if (!url.includes('/graphql')) return;
    if (r.status() !== 200) return;
    try {
      const text = await r.text();
      const op = new URL(url).searchParams.get('operationName') || '';
      if (op === 'Items' && text.includes('priceString')) {
        const json = JSON.parse(text);
        const items = json.data && json.data.items || [];
        itemBatches.push(...items);
        console.log('[Tony] Items batch:', items.length, 'running total:', itemBatches.length);
      }
    } catch(e) {}
  });

  console.log("[Tony's] Navigating to beer search...");
  await page.goto("https://www.instacart.com/store/tonys-fresh-market/s?k=beer", { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // Check for markup notice and page title
  const pageInfo = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    markup: document.body.innerText.includes('No markup') || document.body.innerText.includes('no markup'),
    pricingInfo: (document.body.innerText.match(/markup|pricing|fee/gi) || []).join(', '),
    bodySnip: document.body.innerText.slice(0, 300),
  }));
  console.log('\n[Tony] Page info:', JSON.stringify(pageInfo, null, 2));

  // Scroll to load all products
  console.log("\n[Tony's] Scrolling to load products...");
  for (let i = 0; i < 20; i++) {
    await page.evaluate(i => window.scrollTo(0, i * 600), i);
    await sleep(500);
  }
  await sleep(3000);

  const domItems = await page.evaluate(() => {
    const items = document.querySelectorAll('[class*="item-card"], [data-testid*="item"]');
    return {
      count: items.length,
      samples: Array.from(items).slice(0, 5).map(el => el.innerText.slice(0, 100)),
    };
  });
  console.log('\n[Tony] DOM items:', domItems.count);
  domItems.samples.forEach(s => console.log(' -', s.replace(/\n/g, ' | ')));

  console.log('\n[Tony] Total items from API:', itemBatches.length);
  if (itemBatches.length > 0) {
    const sample = itemBatches[0];
    console.log('Sample keys:', Object.keys(sample));
    console.log('Name:', sample.name);
    console.log('Brand:', sample.brandName);
    console.log('Size:', sample.size);
    console.log('Price:', sample.price?.viewSection?.itemCard?.priceString);
    console.log('Unit:', sample.price?.viewSection?.itemCard?.pricingUnitString);
  }

  fs.writeFileSync('./scraper/tonys_items.json', JSON.stringify(itemBatches, null, 2));
  await browser.close();
})().catch(e => console.error("[Tony's] FATAL:", e.message));
