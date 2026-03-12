'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT        = path.join(__dirname, '..');
const DATA_FILE   = path.join(ROOT, 'data', 'data.json');
const STATUS_FILE = path.join(ROOT, 'data', 'last_updated.json');
const LOG_DIR     = path.join(__dirname, 'logs');
const MIN_VALID   = 5; // reject any scrape returning fewer products

const RETAILERS = [
  { name: "Binny's",     file: 'binny'      },
  { name: "Total Wine",  file: 'totalwine'  },
  { name: "Jewel",       file: 'jewel'      },
  { name: "Whole Foods", file: 'wholefoods' },
  { name: "Mariano's",   file: 'marianos'   },
];

// ── UTILITIES ────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts    = ()  => new Date().toISOString();

function log(msg) {
  const line = `[${ts()}] ${msg}`;
  console.log(line);
  const file = path.join(LOG_DIR, `${ts().slice(0, 10)}.log`);
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(file, line + '\n');
}

function readJSON(file, fallback) {
  try   { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function computeFields(p) {
  const totalOz             = p.sizeOz * p.packSize;
  const pricePerOz          = p.price / totalOz;
  const pricePerAlcoholUnit = p.price / (totalOz * (p.abv / 100));
  return { ...p, totalOz, pricePerOz, pricePerAlcoholUnit };
}

// ── LOAD SCRAPER MODULE (graceful if file missing) ──────────────────────────
function loadRetailerModule(file) {
  const modPath = path.join(__dirname, 'retailers', file);
  try   { return require(modPath); }
  catch { return null; }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  log('=== Scrape run started ===');

  // Seed from existing data so failed retailers keep their last-good products
  const existing = readJSON(DATA_FILE, []);
  const dataByRetailer = {};
  existing.forEach(p => {
    if (!dataByRetailer[p.retailer]) dataByRetailer[p.retailer] = [];
    dataByRetailer[p.retailer].push(p);
  });

  const statusFile = readJSON(STATUS_FILE, {
    lastRun: null,
    retailers: Object.fromEntries(
      RETAILERS.map(r => [r.name, { status: 'never', lastSuccess: null, productCount: 0 }])
    ),
  });

  for (const retailer of RETAILERS) {
    log(`── Scraping ${retailer.name} ...`);

    const mod = loadRetailerModule(retailer.file);
    if (!mod) {
      log(`   SKIP: ${retailer.file}.js not yet implemented`);
      statusFile.retailers[retailer.name] = {
        ...statusFile.retailers[retailer.name],
        status: 'not_implemented',
      };
      continue;
    }

    try {
      const raw      = await mod.scrape();
      const products = raw.map(computeFields);

      if (products.length < MIN_VALID) {
        throw new Error(`Only ${products.length} products (min ${MIN_VALID})`);
      }

      dataByRetailer[retailer.name] = products;
      statusFile.retailers[retailer.name] = {
        status: 'success', lastSuccess: ts(), productCount: products.length,
      };
      log(`   OK: ${products.length} products`);
    } catch (err) {
      log(`   ERROR: ${err.message}`);
      statusFile.retailers[retailer.name] = {
        ...statusFile.retailers[retailer.name],
        status: 'failed',
      };
    }

    // Polite pause between retailers (2–4 s)
    if (RETAILERS.indexOf(retailer) < RETAILERS.length - 1) {
      await sleep(2000 + Math.random() * 2000);
    }
  }

  const allProducts = Object.values(dataByRetailer).flat();
  statusFile.lastRun = ts();

  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  fs.writeFileSync(DATA_FILE,   JSON.stringify(allProducts, null, 2));
  fs.writeFileSync(STATUS_FILE, JSON.stringify(statusFile,  null, 2));

  log(`=== Done — ${allProducts.length} total products written ===`);
}

main().catch(err => {
  log(`FATAL: ${err.message}\n${err.stack}`);
  process.exit(1);
});
