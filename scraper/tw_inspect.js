'use strict';
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(__dirname + '/tw_resp_080e7_0199ee06_b12f_738e_b71e_1fe3c4f51316_en_json.json', 'utf8'));

function find(obj, path, depth) {
  if (depth > 6) return;
  if (Array.isArray(obj) && obj.length > 3) {
    const first = obj[0];
    if (first && typeof first === 'object') {
      const keys = Object.keys(first);
      if (keys.some(k => /name|price|title|sku|product/i.test(k))) {
        console.log('PATH:', path, 'LEN:', obj.length, 'KEYS:', keys.slice(0,12).join(', '));
        console.log('SAMPLE:', JSON.stringify(first).slice(0, 400));
        console.log('---');
        return;
      }
    }
  }
  if (obj && typeof obj === 'object' && Array.isArray(obj) === false) {
    for (const k of Object.keys(obj).slice(0, 30)) {
      find(obj[k], path + '.' + k, depth + 1);
    }
  }
}
find(data, 'root', 0);
