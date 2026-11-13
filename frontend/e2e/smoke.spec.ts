import { expect,test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('public storefront exposes catalog and verification entry points',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:/shop globally/i})).toBeVisible();
  await expect(page.getByRole('link',{name:/verified store/i})).toBeVisible();
  const results=await new AxeBuilder({page}).analyze();
  expect(results.violations.filter(v=>v.impact==='critical'||v.impact==='serious')).toEqual([]);
});
test('catalog lists seeded verified products',async({page})=>{
  await page.goto('/store');
  await expect(page.getByText('Studio Monitor Headphones').first()).toBeVisible();
});
test('verification portal supports sample SKU search',async({page})=>{
  await page.goto('/verify');
  await page.getByRole('button',{name:'AUD-001'}).click();
  await expect(page.getByRole('heading',{name:'Studio Monitor Headphones'})).toBeVisible();
});
