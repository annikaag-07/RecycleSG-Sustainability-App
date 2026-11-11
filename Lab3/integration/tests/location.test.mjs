import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { startServer } from './mock-server.mjs';

test('search another area and open Google Maps directions from current location', async () => {
  const service = await startServer(fileURLToPath(new URL('artifacts/web/', import.meta.url)));
  let browser;
  try {
    await service.state.db.exec(`INSERT INTO recycling_points(name,address,latitude,longitude,status)
      VALUES('Tampines test bin','Tampines Central',1.354,103.945,'Available');
      INSERT INTO recycling_point_materials SELECT 2,id FROM material_types WHERE name='Plastic';`);
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 430, height: 900 },
      geolocation: { latitude: 1.35, longitude: 103.68, accuracy: 5 }, permissions: ['geolocation'] });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      if (url.hostname === 'www.onemap.gov.sg' && url.pathname.includes('/elastic/search')) {
        return route.fulfill({ json: { results: [{ SEARCHVAL: 'TAMPINES CENTRAL', BLK_NO: '508',
          ROAD_NAME: 'TAMPINES CENTRAL', ADDRESS: '508 TAMPINES CENTRAL', POSTAL: '520508',
          LATITUDE: '1.354', LONGITUDE: '103.945' }] } });
      }
      if (url.hostname === 'www.google.com') return route.fulfill({ body: 'Directions handoff', contentType: 'text/html' });
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:54321/login');
    await page.getByRole('button', { name: 'Browse as guest', exact: true }).click();
    await page.getByRole('button', { name: 'Change search location', exact: true }).click();
    await page.getByText('Choose search location', { exact: true }).waitFor();
    assert.equal(await page.getByText('Location is switched off', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Search by address instead', exact: true }).click();
    await page.getByRole('textbox', { name: 'Address or postal code', exact: true }).fill('Tampines');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('button', { name: /508 TAMPINES CENTRAL/ }).click();
    const material = page.getByRole('textbox', { name: 'What are you recycling?', exact: true });
    await material.fill('plastic bottle');
    await material.press('Enter');
    await page.getByRole('button', { name: /^Tampines test bin\./ }).click();
    await page.getByRole('button', { name: /Directions/i }).click();
    const popupPromise = context.waitForEvent('page');
    await page.getByRole('button', { name: 'Open in Google Maps (walking)', exact: true }).click();
    const popup = await popupPromise;
    await popup.waitForURL('https://www.google.com/maps/dir/**');
    const destination = new URL(popup.url());
    assert.equal(destination.searchParams.get('destination'), '1.354,103.945');
    assert.equal(destination.searchParams.get('travelmode'), 'walking');
    assert.equal(destination.searchParams.has('origin'), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await service.close();
  }
});
