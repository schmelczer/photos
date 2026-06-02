import { expect, test } from '@playwright/test';

test('renders the gallery and supports keyboard navigation', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.locator('.thumbnail')).toHaveCount(47);
  await expect(page.locator('#frame-image')).toBeVisible();

  const firstAlt = await page.locator('#frame-image').getAttribute('alt');

  await page.locator('.thumbnail').first().focus();
  await page.keyboard.press('ArrowRight');

  await expect(page.locator('.thumbnail[aria-current="true"]')).toHaveCount(1);
  await expect(page.locator('#frame-image')).not.toHaveAttribute(
    'alt',
    firstAlt ?? ''
  );
});
