'use strict';
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fsmod = require('fs');
const path = require('path');
chromium.use(StealthPlugin());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TEST_URL = 'https://www.totalwine.com/search/results?q=beer&state=IL&store=1103&psize=24&ipp=24';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', viewport: { width: 1920, height: 1080 },
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const page = await ctx.newPage();
  const captured = [];
  page.on('response', async r => {
    const url = r.url();
    const type = r.request().resourceType();
    if (!['xhr', 'fetch'].includes(type)) return;
    const status = r.status();
    try {
      const buf = await r.body();
      const size = buf.length;
      const text = buf.toString('utf8');
      const isJson = text.trimStart().startsWith('{') || text.trimStart().startsWith('[');
      console.log('[net] ' + status + ' ' + size + 'B ' + url.slice(0, 120));
      if (isJson && size > 2000) {
        const slug = url.replace(/[^a-z0-9]/gi, '_').slice(-50);
        const outPath = path.join(__dirname, 'tw_resp_' + slug + '.json');
        fsmod.writeFileSync(outPath, text);
        console.log('  => saved to ' + outPath);
        captured.push({ url, size });
      }
    } catch (_) {}
  });
  console.log('Navigating to:', TEST_URL);
  try {
    await page.goto(TEST_URL, { waitUntil: 'load', timeout: 30000 });
  } catch (e) {
    console.log('goto error:', e.message.slice(0, 80));
  }
  console.log('Waiting 10s...');
  await sleep(10000);
  const info = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : null,
    cards: document.querySelectorAll('[class*="productCard"]').length,
    url: location.href,
    bodySnip: document.body.innerText.slice(0, 400),
  }));
  console.log('Page info:', JSON.stringify(info, null, 2));
  console.log('Large JSON responses:', captured.length);
  captured.forEach(c => console.log('  ' + c.size + 'B  ' + c.url.slice(0, 100)));
  await browser.close();
})().catch(console.error);
