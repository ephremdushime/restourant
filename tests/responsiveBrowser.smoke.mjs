import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const port = Number(process.env.RESTOPASS_BROWSER_TEST_PORT || 4173);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'development', PORT: String(port), DISABLE_HMR: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(`RestoPass server exited early:\n${serverOutput}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await delay(1000);
  }
  throw new Error(`RestoPass server did not become ready:\n${serverOutput}`);
}

const roles = [
  { name: 'restaurant admin', demoButton: 'Demo Boss', workspace: '.restaurant-admin-workspace' },
  { name: 'scanner station', demoButton: 'Demo Stand', workspace: '.scanner-workspace' },
  { name: 'customer', demoButton: 'Demo Patron', workspace: '.customer-portal-workspace' },
  { name: 'platform admin', demoButton: 'Demo Super', workspace: '.platform-admin-workspace' },
];
const widths = [320, 360, 390, 430, 768, 1024, 1440, 1920];
const browser = await chromium.launch({ headless: true });

try {
  await waitForServer();
  for (const role of roles) {
    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: width < 500 ? 844 : 900 },
        deviceScaleFactor: 1,
        isMobile: width < 768,
        hasTouch: width < 768,
      });
      await context.addInitScript(() => sessionStorage.setItem('restopass_demo_mode', 'true'));
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));

      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: role.demoButton, exact: true }).click();
      await page.locator(role.workspace).waitFor({ state: 'visible' });

      const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        workspace: document.querySelector('main')?.scrollWidth ?? null,
      }));
      assert.ok(
        dimensions.document <= dimensions.viewport + 1,
        `${role.name} overflows horizontally at ${width}px: ${JSON.stringify(dimensions)}`
      );
      assert.deepEqual(pageErrors, [], `${role.name} has browser errors at ${width}px`);
      console.log(`PASS ${role.name.padEnd(16)} ${String(width).padStart(4)}px — no page-level horizontal overflow`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => server.once('exit', resolve)),
    delay(5000),
  ]);
}
