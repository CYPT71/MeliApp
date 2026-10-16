import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const route of ['', 'calendar', 'tasks', 'projects', 'mindmap', 'step-by-step', 'day', 'progress', 'devices', 'settings', 'stats', 'diagnostic', 'data']) {
  test(`accessibility of ${route || 'home'}`, async ({ page }) => {
    await page.goto(`/#/${route}`);
    await expect(page.locator('.feature')).not.toHaveCount(0);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });
}
