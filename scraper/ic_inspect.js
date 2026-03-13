const d = JSON.parse(require('fs').readFileSync('./scraper/ic_products_Items.json'));
const item = d.data.items[0];
console.log('All keys:', Object.keys(item));

// Find price
function findPrice(obj, path, depth) {
  if (depth > 6 || !obj) return;
  if (typeof obj === 'string' && (obj.includes('$') || /^\d+\.\d{2}$/.test(obj))) {
    console.log('PRICE-LIKE at', path, '=', obj);
  }
  if (typeof obj === 'number' && obj > 0 && obj < 1000) {
    console.log('NUMBER at', path, '=', obj);
  }
  if (typeof obj === 'object' && !Array.isArray(obj)) {
    for (const k of Object.keys(obj || {}).slice(0,20)) findPrice(obj[k], path+'.'+k, depth+1);
  }
}
findPrice(item, 'item', 0);
