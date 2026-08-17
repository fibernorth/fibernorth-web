import { chromium } from 'playwright-core';
import { execFileSync } from 'child_process';
function bridgeFetch(req) {
  const args = ['-s', '-i', '--max-time', '30', '-X', req.method(), req.url()];
  for (const [k, v] of Object.entries(req.headers())) {
    if (['host', 'content-length', 'accept-encoding'].includes(k.toLowerCase())) continue;
    args.push('-H', `${k}: ${v}`);
  }
  const body = req.postData();
  if (body) args.push('--data-binary', body);
  let raw = execFileSync('curl', args, { maxBuffer: 30 * 1024 * 1024 }).toString('binary');
  while (/^HTTP\/[\d.]+ 200 Connection established/i.test(raw)) raw = raw.slice(raw.indexOf('\r\n\r\n') + 4);
  const sep = raw.indexOf('\r\n\r\n');
  const head = raw.slice(0, sep).split('\r\n');
  const status = parseInt(head[0].split(' ')[1], 10);
  const headers = {};
  for (const line of head.slice(1)) { const i = line.indexOf(':'); if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim(); }
  delete headers['content-encoding']; delete headers['transfer-encoding'];
  return { status, headers, body: Buffer.from(raw.slice(sep + 4), 'binary') };
}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--disable-web-security'] });
const page = await browser.newPage();
await page.route('**/*', async (route) => { try { await route.fulfill(bridgeFetch(route.request())); } catch { await route.abort(); } });
const log = (m) => console.log('•', m);

await page.goto('https://fibernorth.com/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.fill('#email', 'webadmin@fibernorth.com');
await page.fill('#password', process.env.QA_ADMIN_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL('**/admin', { timeout: 45000 });
const gotoQuotes = async () => {
  await page.goto('https://fibernorth.com/admin/quotes', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(9000);
};
await gotoQuotes();

const qa = 'QA-TEST Final E2E';
const cardEval = (fn, arg) => page.evaluate(([fnSrc, name, a]) => {
  const card = [...document.querySelectorAll('div.bg-card')].find((c) => c.textContent.includes(name));
  if (!card) return 'NO_CARD';
  return eval(fnSrc)(card, a);
}, [fn.toString(), qa, arg]);

// STATUS
await cardEval((card) => {
  const el = card.querySelector('select');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(el, 'contacted');
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'dispatched';
});
await page.waitForTimeout(4000);
await gotoQuotes();
log('status persisted: ' + await cardEval((card) => card.querySelector('select').value === 'contacted'));

// NOTES
await cardEval((card) => {
  const el = card.querySelector('textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(el, 'QA final note');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  [...card.querySelectorAll('button')].find((b) => b.textContent.includes('Save Notes')).click();
  return 'saved';
});
await page.waitForTimeout(4000);
await gotoQuotes();
log('notes persisted: ' + await cardEval((card) => card.querySelector('textarea').value === 'QA final note'));

// DELETE all QA-TEST copies
for (let i = 0; i < 5; i++) {
  const found = await page.evaluate((name) => {
    const card = [...document.querySelectorAll('div.bg-card')].find((c) => c.textContent.includes(name));
    if (!card) return false;
    card.querySelector('button[title="Delete"]').click();
    return true;
  }, qa);
  if (!found) break;
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const dlg = document.querySelector('div[role="dialog"]');
    [...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Delete').click();
  });
  await page.waitForTimeout(3500);
  log(`delete #${i + 1} confirmed`);
}
await gotoQuotes();
const remaining = await page.evaluate((name) =>
  [...document.querySelectorAll('div.bg-card')].filter((c) => c.textContent.includes(name)).length, qa);
log(`QA-TEST quotes remaining: ${remaining}`);
const realQuotes = await page.evaluate(() =>
  [...document.querySelectorAll('div.bg-card')].filter((c) => c.textContent.includes('Me2')).length);
log(`real customer quotes intact: ${realQuotes}`);
await browser.close();
