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
    const ct = r.headers()['content-type'] || '';
    if (!ct.includes('json')) return;
    try {
      const text = await r.text();
      if (text.length > 2000 && (text.includes('price') || text.includes('product'))) {
        apiHits.push({ url: url.slice(0, 180), size: text.length });
        if (apiHits.length === 1) require('fs').writeFileSync(__dirname + '/wag_resp_1.json', text);
      }
    } catch(e) {}
  });

  console.log('Loading Walgreens homepage...');
  try {
    await page.goto('https://www.walgreens.com', { waitUntil: 'load', timeout: 20000 });
    console.log('Title:', await page.title());
  } catch(e) {
    console.log('Homepage error:', e.message.slice(0, 80));
  }

  await sleep(2000);

  // Try their beer/wine search via their API directly
  console.log('\nTrying API search...');
  const apiResult = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/2.0/products/search?query=beer&category=alcohol&limit=10', {
        credentials: 'include', headers: { 'Accept': 'application/json' }
      });
      return { status: r.status, url: r.url, body: (await r.text()).slice(0, 300) };
    } catch(e) { return { error: e.message }; }
  });
  console.log('API probe:', apiResult);

  // Try navigating to beer page
  console.log('\nNavigating to beer search...');
  try {
    await page.goto('https://www.walgreens.com/search/results.jsp?Ntt=beer', { waitUntil: 'load', timeout: 20000 });
    await sleep(3000);
    const info = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      bodySnip: document.body.innerText.slice(0, 400),
    }));
    console.log('Beer page:', JSON.stringify(info, null, 2));
  } catch(e) {
    console.log('Beer page error:', e.message.slice(0, 80));
  }

  console.log('\nAPI hits:', apiHits.length);
  apiHits.forEach(h => console.log(' -', h.size + 'B', h.url));

  await browser.close();
})().catch(console.error);
