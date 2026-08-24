import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { tomorrowLocal } from '../examples/elements-standalone/date.js';

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

describe('published documentation examples', () => {
  it('defaults standalone UI to local transport and retains real clients only after ping', async () => {
    const [page, script] = await Promise.all([source('examples/elements-standalone/index.html'), source('examples/elements-standalone/main.js')]);
    expect(page).toMatch(/real-sandbox[^>]*type="checkbox"/);
    expect(page).toMatch(/id="key"[^>]*disabled/);
    expect(script.indexOf('await candidate.carriers.list()')).toBeLessThan(script.indexOf('client=candidate'));
    expect(script).toMatch(/catch\(error\)\{client=undefined/);
    expect(script).toMatch(/finally\{keyInput\.value=''/);
    expect(script).toContain('transport:fixtureTransport');
  });

  it('does not mount purchase UI for failed or cancelled PayDemo outcomes', async () => {
    const script = await source('examples/elements-standalone/main.js');
    expect(script).toMatch(/if\(outcome!=='success'\).*No purchase element was mounted/);
    expect(script.indexOf("outcome!=='success'")).toBeLessThan(script.indexOf('showPurchase()'));
  });

  it('uses current address and nested purchase-document contracts', async () => {
    const [resources, standalone, automatic] = await Promise.all([source('examples/headless-node/resources.mjs'), source('examples/elements-standalone/main.js'), source('examples/headless-node/automatic-checkout.mjs')]);
    for (const field of ['first_name','last_name','email','phone','address_in_detail','zip_code','type']) expect(resources).toContain(field);
    expect(standalone).toMatch(/documents:\{waybill_doc:null,insurance_doc:null,invoice_doc:/);
    expect(automatic).toMatch(/documents:\{waybill_doc:null,insurance_doc:null,invoice_doc:/);
    expect(automatic).not.toMatch(/tracking_url:[^}]+,waybill_doc:/);
  });

  it('calculates tomorrow from a noon-normalized local calendar date', () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = 'Pacific/Kiritimati'; // UTC+14 exercises the positive-offset midnight boundary.
    try {
      expect(tomorrowLocal(new Date(2026, 7, 24, 23, 59, 59))).toBe('2026-08-25');
      expect(tomorrowLocal(new Date(2026, 11, 31, 0, 1))).toBe('2027-01-01');
    } finally { process.env.TZ = originalTimezone; }
  });

  it('executes every controller and previously name-only contract export', async () => {
    const example = await source('examples/headless-node/controllers-and-contracts.mjs');
    for (const name of ['AFRICANIES_ENVIRONMENTS','assertShipmentRequest','completeRateRequest','validatePurchaseRequest','ShipmentBuilderController','RateSelectionController','PurchaseController','UploadController']) {
      expect(example).toContain(name);
    }
    expect(example).toMatch(/new ShipmentBuilderController/);
    expect(example).toMatch(/await rates\.load\(\)/);
    expect(example).toMatch(/await purchase\.submit\(\)/);
    expect(example).toMatch(/uploads\.add/);
  });
});
