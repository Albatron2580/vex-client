// Renders every page in headless Chromium with a mocked backend. Needs Playwright (not part of `npm test`).
// Usage: NODE_PATH=<dir with playwright> node tests/ui.js [outDir]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const out = process.argv[2] || path.join(__dirname, 'screens');
fs.mkdirSync(out, { recursive: true });


const { mock } = require('./ui-mock');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  let bad = 0;
  for (const signedIn of [false, true]) {
    for (const width of [1200, 940]) {
      const page = await browser.newPage({ viewport: { width, height: width === 940 ? 600 : 760 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('console', (m) => { if ((m.type() === 'error' && !/ERR_TUNNEL|fonts\.g/.test(m.text())) || /UNMOCKED/.test(m.text())) errors.push(m.type() + ': ' + m.text()); });
      await page.addInitScript(mock(signedIn));
      await page.goto('file://' + path.resolve(__dirname, '..', 'renderer', 'index.html'));
      await page.waitForSelector('.nav-btn');
      const ids = await page.$$eval('.nav-btn', (b) => b.map((x) => x.dataset.nav));
      for (const id of ids) {
        await page.click(`.nav-btn[data-nav="${id}"]`);
        await page.waitForTimeout(500);
        const visible = await page.$$eval('section.page', (s) => s.filter((x) => x.getBoundingClientRect().height > 0 && getComputedStyle(x).display !== 'none').map((x) => x.id));
        if (visible.length !== 1 || visible[0] !== `page-${id}`) { errors.push(`visible pages for ${id}: ${visible.join(',')}`); }
        const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        if (overflowX) errors.push(`horizontal overflow on ${id}`);
        await page.screenshot({ path: path.join(out, `${signedIn ? 'in' : 'out'}-${width}-${id}.png`) });
      }
      console.log(`${signedIn ? 'signed-in ' : 'signed-out'} ${width}px: ${ids.length} pages, ${errors.length} problems`);
      errors.forEach((e) => console.log('   ' + e));
      bad += errors.length;
      await page.close();
    }
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
