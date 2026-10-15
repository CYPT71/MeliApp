import { test, expect } from '@playwright/test';

const input = page => page.getByRole('textbox', { name: 'Titre de la nouvelle tâche' });

test('task drafts are written to IndexedDB and restored on reload', async ({ page }) => {
  await page.goto('/#/tasks');
  await input(page).fill('Brouillon persistant');
  await expect.poll(() => page.evaluate(async () => {
    const { createIndexedDbStorage } = await import('/js/services/storage.js');
    const drafts = await createIndexedDbStorage().loadDrafts();
    return drafts?.['tasks:task']?.find(field => field.name === 'title')?.value;
  })).toBe('Brouillon persistant');
  await page.reload();
  await expect(input(page)).toHaveValue('Brouillon persistant');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.locator('.task-workspace-summary strong')).toHaveText('1 tâche active');
  await page.reload();
  await expect(input(page)).toHaveValue('');
  const saved = await page.evaluate(async () => {
    const { createIndexedDbStorage } = await import('/js/services/storage.js');
    return (await createIndexedDbStorage().load()).features.tasks.items;
  });
  expect(saved[0].title).toBe('Brouillon persistant');
});

test('aborted IndexedDB transactions reject and the app stays usable', async ({ page }) => {
  await page.goto('/#/tasks');
  const aborted = await page.evaluate(async () => {
    const { createIndexedDbStorage } = await import('/js/services/storage.js');
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      request.addEventListener('success', () => this.transaction.abort());
      return request;
    };
    try { await createIndexedDbStorage().save({ marker: 'must-not-commit' }); return false; }
    catch { return true; }
    finally { IDBObjectStore.prototype.put = original; }
  });
  expect(aborted).toBe(true);
  await input(page).fill('Toujours utilisable');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.locator('.task-workspace-summary strong')).toHaveText('1 tâche active');
});

test('daily goal and earned progress survive a reload', async ({ page }) => {
  await page.goto('/#/tasks');
  await page.getByRole('combobox', { name: 'Objectif de tâches du jour' }).selectOption('1');
  await input(page).fill('Petit cap');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.locator('.task-workspace-summary strong')).toHaveText('1 tâche active');
  await page.getByRole('tab', { name: 'Liste', exact: true }).click();
  await page.getByRole('button', { name: 'Terminer Petit cap', exact: true }).click();
  await expect(page.locator('.daily-progress')).toContainText('Cap atteint');
  await expect(page.locator('.reward-feedback')).toContainText('XP');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Objectif de tâches du jour' })).toHaveValue('1');
  await expect(page.locator('.daily-progress')).toContainText('Cap atteint');
});

test('an unfinished task edit survives reloading without changing the saved task', async ({ page }) => {
  await page.goto('/#/tasks');
  await input(page).fill('Titre enregistré');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.locator('.task-workspace-summary strong')).toHaveText('1 tâche active');
  await page.getByRole('tab', { name: 'Liste', exact: true }).click();
  await page.locator('.task-title-button').click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Titre', exact: true }).fill('Édition en cours');
  await expect.poll(() => page.evaluate(async () => {
    const { createIndexedDbStorage } = await import('/js/services/storage.js');
    return Object.values(await createIndexedDbStorage().loadDrafts()).flat().some(field => field.value === 'Édition en cours');
  })).toBe(true);
  await page.reload();
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Titre', exact: true })).toHaveValue('Édition en cours');
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.task-title-button')).toHaveText('Titre enregistré');
});

test('failed saves are visible and a later successful action recovers the queue', async ({ page }) => {
  await page.goto('/#/tasks');
  await expect(page.locator('#storage-status')).toContainText('sauvegardées');
  await page.evaluate(() => {
    window.originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (args[1] === 'app') throw new DOMException('Quota test', 'QuotaExceededError');
      return window.originalPut.apply(this, args);
    };
  });
  await input(page).fill('Avancée non sauvegardée');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.locator('#storage-status')).toContainText('Sauvegarde indisponible');
  await expect(page.locator('.task-workspace-summary strong')).toHaveText('1 tâche active');
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalPut; });
  await input(page).fill('Sauvegarde rétablie');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.locator('.task-workspace-summary strong')).toHaveText('2 tâches actives');
  await expect(page.locator('#storage-status')).toContainText('sauvegardées');
  await page.reload();
  await expect(page.locator('.task-workspace-summary strong')).toHaveText('2 tâches actives');
});
