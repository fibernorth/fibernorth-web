// Shared QA harness: launches a browser, bridges Google API calls through the
// proxy via curl, logs into the admin, and returns { browser, page }.
// Usage: import { launchAdmin } from './qa-harness.mjs'
import { chromium } from 'playwright-core';
import { execFileSync } from 'child_process';

export async function launchAdmin() {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--disable-web-security'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await installBridge(page);
  await page.goto('http://localhost:3200/login', { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('#email', 'webadmin@fibernorth.com');
  await page.fill('#password', process.env.QA_ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin', { timeout: 30000 });
  await page.waitForTimeout(2500);
  return { browser, page };
}

export async function installBridge(page) {
  await page.route(/googleapis\.com|gstatic\.com|googletagmanager/, async (route) => {
    const req = route.request();
    const args = ['-s', '-i', '--max-time', '25', '-X', req.method(), req.url()];
    for (const [k, v] of Object.entries(req.headers())) {
      if (['host', 'content-length', 'accept-encoding'].includes(k.toLowerCase())) continue;
      args.push('-H', `${k}: ${v}`);
    }
    const body = req.postData();
    if (body) args.push('--data-binary', body);
    try {
      let raw = execFileSync('curl', args, { maxBuffer: 20 * 1024 * 1024 }).toString('binary');
      while (/^HTTP\/[\d.]+ 200 Connection established/i.test(raw)) {
        raw = raw.slice(raw.indexOf('\r\n\r\n') + 4);
      }
      const sep = raw.indexOf('\r\n\r\n');
      const head = raw.slice(0, sep).split('\r\n');
      const status = parseInt(head[0].split(' ')[1], 10);
      const headers = {};
      for (const line of head.slice(1)) {
        const i = line.indexOf(':');
        if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
      }
      delete headers['content-encoding'];
      delete headers['transfer-encoding'];
      await route.fulfill({ status, headers, body: Buffer.from(raw.slice(sep + 4), 'binary') });
    } catch {
      await route.abort();
    }
  });
}
