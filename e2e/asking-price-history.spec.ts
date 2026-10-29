import {test, expect} from '@playwright/test';
import {CUSTOMER, signIn, apiToken} from './helpers';

test('approved asking reduction appears on the listing and its retained timeline', async ({page}) => {
  await signIn(page, CUSTOMER);
  const token=await apiToken(CUSTOMER);
  const result=await page.request.get('/api/properties?search=1%20Test%20Street', {
    headers:{Authorization:`Bearer ${token}`},
  });
  expect(result.ok()).toBeTruthy();
  const data=await result.json();
  const subject=(data.rows ?? data.items).find((row:{address:string})=>row.address.startsWith('1 Test Street'));
  expect(subject.asking_price_change.change_dollars).toBe(-50000);
  await page.goto('/properties?search=1%20Test%20Street&view=list');
  await expect(page.getByLabel('Recorded asking-price change').first()).toContainText('Price reduced $50,000');
  await page.goto(`/property/${subject.id}`);
  await expect(page.getByLabel('Recorded asking-price change')).toContainText('Price reduced $50,000');
  const history=page.getByRole('region',{name:'Asking price history',exact:true});
  await expect(history).toContainText('First record');
  await expect(history).toContainText('−$50,000');
  await expect(history).toContainText('not the exact date the seller changed it');
});
