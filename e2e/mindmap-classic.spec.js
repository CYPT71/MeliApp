import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const seed = async page => {
  await page.goto('/');
  await expect(page.locator('#storage-status')).toContainText('sauvegardées');
  await page.evaluate(async () => {
    const { features } = await import('/js/core/registry.js');
    const { createInitialState } = await import('/js/core/state.js');
    const { createIndexedDbStorage } = await import('/js/services/storage.js');
    const state = createInitialState(features);
    state.features.projects.items = [{ id: 'p', title: 'Voyage' }, { id: 'q', title: 'Personnel' }];
    state.features.tasks.items = [
      { id: 'parent', title: 'Préparer le voyage', projectId: 'p' },
      { id: 'child', title: 'Réserver le train', parentTaskId: 'parent', projectId: 'p' },
      { id: 'leaf', title: 'Comparer les prix', parentTaskId: 'child', projectId: 'p' },
      { id: 'other', title: 'Lire un livre', projectId: 'p' }
    ].map(task => ({ ...task, status: 'active', importance: 3, estimateMinutes: 25, difficulty: 2 }));
    await createIndexedDbStorage().save(state);
  });
  await page.goto('/#/mindmap');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Modifier Préparer le voyage', exact: true })).toBeVisible();
};
const node = (page, id) => page.locator(`[data-mindmap-task-id="${id}"]`);

test('branch collapse persists and search reveals a matching descendant with its context', async ({ page }) => {
  await seed(page);
  await node(page, 'parent').getByRole('button', { name: /1 étape/ }).click();
  await expect(node(page, 'child')).toHaveCount(0);
  await page.reload();
  await expect(node(page, 'child')).toHaveCount(0);
  const search = page.getByRole('searchbox', { name: 'Rechercher une tâche ou un projet' });
  await search.pressSequentially('Comparer');
  await expect(node(page, 'leaf')).toBeVisible();
  await expect(node(page, 'parent')).toBeVisible();
  await expect(node(page, 'other')).toHaveCount(0);
  await expect(search).toBeFocused();
  await search.fill('');
  await page.getByRole('button', { name: 'Tout déplier', exact: true }).click();
  await expect(node(page, 'child')).toBeVisible();
});

test('titles edit tasks and inline creation adds a persistent subtask without losing the branch', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Modifier Préparer le voyage', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Titre', exact: true }).fill('Préparer mon voyage');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await node(page, 'parent').getByRole('button', { name: 'Actions pour Préparer mon voyage', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Nouvelle sous-tâche de Préparer mon voyage', exact: true });
  await input.fill('Préparer la valise');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: 'Modifier Préparer la valise', exact: true })).toBeVisible();
  await expect(input).toHaveValue('');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Modifier Préparer la valise', exact: true })).toBeVisible();
});

test('moving a task changes its whole branch and focus can return to the complete tree', async ({ page }) => {
  await seed(page);
  await node(page, 'parent').getByRole('button', { name: 'Actions pour Préparer le voyage', exact: true }).click();
  await page.getByRole('combobox', { name: 'Projet principal de Préparer le voyage', exact: true }).selectOption('q');
  await expect(page.getByRole('status').filter({ hasText: 'Projet principal de la branche' })).toBeVisible();
  const saved = await page.evaluate(async () => {
    const { createIndexedDbStorage } = await import('/js/services/storage.js');
    return (await createIndexedDbStorage().load()).features.tasks.items;
  });
  expect(saved.filter(task => ['parent', 'child', 'leaf'].includes(task.id)).every(task => task.projectId === 'q')).toBe(true);
  expect(saved.find(task => task.id === 'other').projectId).toBe('p');
  await node(page, 'parent').getByRole('button', { name: 'Isoler cette branche', exact: true }).click();
  await expect(node(page, 'other')).toHaveCount(0);
  await expect(node(page, 'leaf')).toBeVisible();
  await page.getByRole('button', { name: 'Revenir à toute la carte', exact: true }).click();
  await expect(node(page, 'other')).toBeVisible();
});

test('completion, reopening and completed filter work and the populated tree is accessible', async ({ page }) => {
  await seed(page);
  await node(page, 'other').getByRole('button', { name: 'Terminer Lire un livre', exact: true }).click();
  await expect(node(page, 'other').getByRole('button', { name: 'Rouvrir Lire un livre', exact: true })).toBeVisible();
  const filter = page.getByRole('checkbox', { name: 'Afficher les tâches terminées' });
  await filter.uncheck();
  await expect(node(page, 'other')).toHaveCount(0);
  await filter.check();
  await node(page, 'other').getByRole('button', { name: 'Rouvrir Lire un livre', exact: true }).click();
  await expect(node(page, 'other').getByRole('button', { name: 'Terminer Lire un livre', exact: true })).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});
