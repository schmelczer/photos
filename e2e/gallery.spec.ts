import { expect, test } from '@playwright/test';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

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
  const selected = page.locator('.thumbnail[aria-current="true"]');
  await expect(selected).toBeFocused();
  expect(new URL(page.url()).hash).toBe(
    `#photo=${await selected.getAttribute('data-photo-id')}`
  );

  await page.keyboard.press('End');
  await expect(page.locator('.thumbnail[data-order="47"]')).toHaveAttribute(
    'aria-current',
    'true'
  );
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.thumbnail[data-order="1"]')).toHaveAttribute(
    'aria-current',
    'true'
  );
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.thumbnail[data-order="47"]')).toHaveAttribute(
    'aria-current',
    'true'
  );
  await page.keyboard.press('Home');
  await expect(page.locator('.thumbnail[data-order="1"]')).toBeFocused();
});

test('keeps a selected photo on reload and in a copied thumbnail link', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?ref=gallery');
  const thumbnail = page.locator('.thumbnail[data-order="9"]');
  const id = await thumbnail.getAttribute('data-photo-id');
  const alt = await thumbnail.locator('img').getAttribute('alt');
  const copiedLink = await thumbnail.evaluate(
    (link: HTMLAnchorElement) => link.href
  );

  await thumbnail.click();
  expect(page.url()).toBe(copiedLink);
  expect(new URL(page.url()).search).toBe('?ref=gallery');
  expect(new URL(page.url()).hash).toBe(`#photo=${id}`);
  await expect(page.locator('#frame-image')).toHaveAttribute('alt', alt ?? '');
  await expect(page.locator('#slideshow-toggle')).toHaveAttribute(
    'aria-pressed',
    'false'
  );

  await page.reload();
  await expect(page.locator('#frame-image')).toHaveAttribute('alt', alt ?? '');
  await expect(page.locator('.thumbnail[aria-current="true"]')).toHaveAttribute(
    'data-photo-id',
    id ?? ''
  );
  await expect(page.locator('#slideshow-toggle')).toHaveText('Play');

  const sharedPage = await context.newPage();
  await sharedPage.emulateMedia({ reducedMotion: 'no-preference' });
  await sharedPage.clock.install();
  await sharedPage.goto(copiedLink);
  await expect(sharedPage.locator('#frame-image')).toHaveAttribute(
    'alt',
    alt ?? ''
  );
  await sharedPage.clock.fastForward(14_000);
  await expect(sharedPage.locator('#frame-image')).toHaveAttribute(
    'alt',
    alt ?? ''
  );
  await expect(sharedPage.locator('#slideshow-toggle')).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  await sharedPage.close();
});

test('restores photo selections with Back, Forward, and hash changes', async ({
  page,
}) => {
  await page.goto('/');
  const first = page.locator('.thumbnail[data-order="1"]');
  const later = page.locator('.thumbnail[data-order="6"]');
  const last = page.locator('.thumbnail[data-order="47"]');
  await later.click();
  const laterUrl = page.url();
  await last.click();
  const lastUrl = page.url();

  await page.goBack();
  await expect(page).toHaveURL(laterUrl);
  await expect(later).toHaveAttribute('aria-current', 'true');
  await page.goBack();
  expect(new URL(page.url()).hash).toBe('');
  await expect(first).toHaveAttribute('aria-current', 'true');
  await page.goForward();
  await expect(later).toHaveAttribute('aria-current', 'true');
  await page.goForward();
  await expect(page).toHaveURL(lastUrl);
  await expect(last).toHaveAttribute('aria-current', 'true');

  const firstLink = await first.getAttribute('href');
  await page.evaluate((hash) => {
    window.location.hash = hash ?? '';
  }, firstLink);
  await expect(first).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#slideshow-toggle')).toHaveText('Play');
});

test('updates slideshow links without filling browser history and still pauses', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install();
  await page.goto('/');
  const historyLength = await page.evaluate(() => window.history.length);
  await page.clock.fastForward(7000);
  const selected = page.locator('.thumbnail[aria-current="true"]');
  await expect(selected).toHaveAttribute('data-order', '2');
  expect(new URL(page.url()).hash).toBe(
    `#photo=${await selected.getAttribute('data-photo-id')}`
  );
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);

  await page.getByRole('button', { name: 'Pause' }).click();
  const pausedUrl = page.url();
  await page.clock.fastForward(14_000);
  await expect(page).toHaveURL(pausedUrl);
  await expect(selected).toHaveAttribute('data-order', '2');
  await page.getByRole('button', { name: 'Play' }).click();
  await page.clock.fastForward(7000);
  await expect(selected).toHaveAttribute('data-order', '3');
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);
});

test('falls back to the first photo for unknown or malformed links', async ({
  page,
}) => {
  for (const hash of [
    '#photo=missing-photo',
    '#photo=%E0%A4%A',
    '#portraits',
  ]) {
    await page.goto(`/${hash}`);
    const first = page.locator('.thumbnail[data-order="1"]');
    await expect(first).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('#frame-image')).toHaveAttribute(
      'alt',
      (await first.locator('img').getAttribute('alt')) ?? ''
    );
    await page.locator('.thumbnail[data-order="6"]').click();
    await expect(
      page.locator('.thumbnail[aria-current="true"]')
    ).toHaveAttribute('data-order', '6');
  }
});

test('keeps the portfolio link and gallery usable on a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  const portfolio = page.getByRole('link', { name: 'Portfolio' });
  await expect(portfolio).toBeVisible();
  await expect(portfolio).toHaveAttribute('href', 'https://schmelczer.dev/');
  await expect(portfolio).toBeInViewport();
  await expect(page.locator('#slideshow-toggle')).toBeInViewport();
  await portfolio.focus();
  await expect(portfolio).toBeFocused();
  await page.locator('.thumbnail[data-order="6"]').click();
  await expect(page.locator('#frame-image')).toBeVisible();
  await expect(
    page.locator('#frame-content source[type="image/avif"]')
  ).toHaveAttribute('srcset', /480w.*960w/);
  await expect(
    page.locator('#frame-content source[type="image/webp"]')
  ).toHaveAttribute('sizes', /max-width: 899px/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});

test('retains asset links and the portfolio link without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.locator('.thumbnail').first()).toHaveAttribute(
    'href',
    /^static\/photos\/.*\.jpg$/
  );
  await expect(page.locator('#frame-image')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Portfolio' })).toBeVisible();
  await expect(page.locator('#slideshow-toggle')).toBeHidden();
  await context.close();
});
