/**
 * capture-screenshots.ts
 * Playwright (headless Chromium) script that captures 10 labelled screenshots
 * of the CreditFlow UI and writes them to docs/report-assets/screens/.
 *
 * Usage (from repo root):
 *   npx ts-node scripts/capture-screenshots.ts
 *   # or after building:
 *   node dist/capture-screenshots.js
 *
 * Pre-requisites:
 *   • CreditFlow is running (docker-compose up OR dev server):
 *       Client  → http://localhost:3000
 *       API     → http://localhost:4000
 *   • DB seeded (npm run demo:reset, or AUTO_SEED=true on server start)
 *   • npx playwright install chromium
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const API_BASE  = process.env.API_BASE  || 'http://localhost:4000/api';

const ADMIN_EMAIL    = 'wholesale_a@demo.com';
const ADMIN_PASSWORD = 'CreditFlow@123';

const MEMBER_EMAIL    = 'retailer_b@demo.com';
const MEMBER_PASSWORD = 'CreditFlow@123';

const SCREENS_DIR = path.resolve(__dirname, '../docs/report-assets/screens');

// ── Helpers ───────────────────────────────────────────────────────────────────
async function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function shot(page: Page, name: string, label: string) {
  const file = path.join(SCREENS_DIR, `${name}.webp`);
  await page.screenshot({ path: file, fullPage: false, type: 'webp', quality: 90 });
  console.log(`  ✅  [${label}] → ${path.basename(file)}`);
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"], input[name="email"], #email', email);
  await page.fill('input[type="password"], input[name="password"], #password', password);
  await page.click('button[type="submit"]');
  // Wait for navigation away from /login
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15_000 });
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  await ensureDir(SCREENS_DIR);

  const browser: Browser = await chromium.launch({ headless: true });

  // ── Context A: Admin user (Wholesale_A) ─────────────────────────────────
  const ctxA: BrowserContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const pageA: Page = await ctxA.newPage();

  console.log('\n📸  CreditFlow Screenshot Capture — 10 frames\n');
  console.log(`   Client: ${BASE_URL}`);
  console.log(`   API:    ${API_BASE}\n`);

  // 01 — Login page
  await pageA.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await shot(pageA, '01_login', '01 Login page');

  // 02 — Login, land on Overview / Dashboard
  await login(pageA, ADMIN_EMAIL, ADMIN_PASSWORD);
  await pageA.waitForTimeout(1000);
  await shot(pageA, '02_overview_admin', '02 Overview (Wholesale_A admin)');

  // 03 — Groups page — group isolation: Crawford Market selected
  await pageA.goto(`${BASE_URL}/groups`, { waitUntil: 'networkidle' });
  await pageA.waitForTimeout(800);
  await shot(pageA, '03_groups_admin', '03 Groups — Crawford Market & Supplier Circle');

  // 04 — Network graph (ego-network / admin full view)
  await pageA.goto(`${BASE_URL}/network`, { waitUntil: 'networkidle' });
  await pageA.waitForTimeout(2000); // let force simulation settle
  await shot(pageA, '04_network_graph', '04 Network graph (admin view)');

  // 05 — Ledger page (debt table)
  await pageA.goto(`${BASE_URL}/ledger`, { waitUntil: 'networkidle' });
  await pageA.waitForTimeout(800);
  await shot(pageA, '05_ledger', '05 Ledger / Debt table');

  // 06 — Risk page (heatmap + contagion overlay)
  await pageA.goto(`${BASE_URL}/risk`, { waitUntil: 'networkidle' });
  await pageA.waitForTimeout(1500);
  await shot(pageA, '06_risk_heatmap', '06 Risk heatmap & z-score overlay');

  // 07 — Settlement / Optimise page
  await pageA.goto(`${BASE_URL}/settle`, { waitUntil: 'networkidle' });
  await pageA.waitForTimeout(1000);
  await shot(pageA, '07_settlement', '07 Settlement optimise (greedy vs exact)');

  // 08 — Inbox / Approval queue (admin)
  await pageA.goto(`${BASE_URL}/inbox`, { waitUntil: 'networkidle' });
  await pageA.waitForTimeout(800);
  await shot(pageA, '08_inbox_admin', '08 Inbox / Approval queue (admin)');

  // 09 — Context B: Member user (Retailer_B) — group isolation proof
  const ctxB: BrowserContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const pageB: Page = await ctxB.newPage();
  await login(pageB, MEMBER_EMAIL, MEMBER_PASSWORD);
  await pageB.goto(`${BASE_URL}/network`, { waitUntil: 'networkidle' });
  await pageB.waitForTimeout(1500);
  await shot(pageB, '09_network_member', '09 Network graph (Retailer_B ego-network)');
  await ctxB.close();

  // 10 — Activity / Audit log
  await pageA.goto(`${BASE_URL}/activity`, { waitUntil: 'networkidle' });
  await pageA.waitForTimeout(800);
  await shot(pageA, '10_activity_log', '10 Activity / Audit log');

  await ctxA.close();
  await browser.close();

  console.log(`\n✅  All 10 screenshots saved to:\n   ${SCREENS_DIR}\n`);
})().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
