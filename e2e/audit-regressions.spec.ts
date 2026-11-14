import {test,expect} from '@playwright/test';
import {CUSTOMER,signIn} from './helpers';
test('explicit map deep link updates an existing list view',async({page})=>{
  await signIn(page,CUSTOMER);
  await page.goto('/properties?view=list');
  await expect(page.getByRole('button',{name:'Map',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'◉ Open on map',exact:true}).click();
  await expect(page.getByRole('button',{name:'Zoom in',exact:true})).toBeVisible();
});
test('activity tracking keeps authentication on page exit',async({page})=>{
  await signIn(page,CUSTOMER);
  const result=page.waitForResponse(r=>r.url().includes('/api/activity/page')&&r.request().method()==='POST');
  await page.goto('/properties');
  expect((await result).status()).toBe(204);
});
