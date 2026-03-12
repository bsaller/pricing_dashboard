'use strict';
/**
 * Jewel-Osco beer scraper — SUSPENDED
 *
 * Blocked by Incapsula WAF. Both browser automation (TLS fingerprint) and
 * direct Node.js HTTP calls are dropped at the connection level.
 * Requires Python curl_cffi or a residential proxy to bypass.
 * See CLAUDE.md § Phase 2 Current Status for details.
 */
async function scrape() {
  throw new Error('Jewel scraper suspended — blocked by Incapsula WAF (not a code bug)');
}

module.exports = { scrape };
