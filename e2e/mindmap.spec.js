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
    state.features.tasks.items = ['Alpha', 'Beta', 'Gamma'].map(title => ({ id: title.toLowerCase(), title, status: 'active', estimateMinutes: 25, importance: 3 }));
    state.features.projects.items = [{ id: 'projet', title: 'Projet Atlas' }];
    state.calendar.categories = [{ name: 'Travail', color: 'preset1' }];
    await createIndexedDbStorage().save(state);
  });
  await page.goto('/#/mindmap');
  await page.reload();
  await expect(page.locator('.entity-graph')).toBeVisible();
};
const choose = async (page, a, b) => {
  await page.getByRole('combobox', { name: 'Première entité', exact: true }).selectOption(a);
  await page.getByRole('combobox', { name: 'Deuxième entité', exact: true }).selectOption(b);
};
const savedTasks = page => page.evaluate(async () => {
  const { createIndexedDbStorage } = await import('/js/services/storage.js');
  return (await createIndexedDbStorage().load()).features.tasks.items;
});

test('graph replaces the tree and two selected nodes can create or remove a project link', async ({ page }) => {
  await seed(page);
  await expect(page.locator('.mindmap-project, .mindmap-branch')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tâche : Alpha', exact: true }).click();
  await page.getByRole('button', { name: 'Projet : Projet Atlas', exact: true }).click();
  await expect(page.locator('.graph-node.is-selected')).toHaveCount(2);
  await expect(page.locator('.graph-relation-copy')).toContainText('appartient au projet');
  await page.getByRole('button', { name: 'Créer ce lien', exact: true }).click();
  await expect(page.locator('.graph-edge--project')).toHaveCount(1);
  expect((await savedTasks(page))[0].projectId).toBe('projet');
  await page.reload();
  await expect(page.locator('.graph-edge--project')).toHaveCount(1);
  await page.getByRole('button', { name: 'Supprimer ce lien', exact: true }).click();
  await expect(page.locator('.graph-edge--project')).toHaveCount(0);
  expect((await savedTasks(page))[0].projectId).toBeNull();
});

test('blocking links are directed, reject cycles and release tasks when completed', async ({ page }) => {
  await seed(page);
  await choose(page, 'task:alpha', 'task:beta');
  await expect(page.locator('.graph-relation-copy')).toHaveText('« Alpha » est bloquée par « Beta »');
  await page.getByRole('button', { name: 'Créer ce lien', exact: true }).click();
  await expect(page.locator('.graph-edge--blocking')).toHaveCount(1);
  await page.getByRole('button', { name: 'Inverser le sens', exact: true }).click();
  await page.getByRole('button', { name: 'Créer ce lien', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('boucle');
  await page.goto('/#/tasks');
  await page.getByRole('tab', { name: 'Liste', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Terminer Alpha', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Terminer Beta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Terminer Alpha', exact: true })).toBeEnabled();
});

test('local categories and Outlook categories both link to tasks', async ({ page }) => {
  await seed(page);
  await page.getByRole('textbox', { name: 'Nom de la catégorie', exact: true }).fill('Maison');
  await page.getByRole('button', { name: 'Ajouter la catégorie', exact: true }).click();
  const option = page.getByRole('combobox', { name: 'Première entité', exact: true }).locator('option').filter({ hasText: 'Catégorie locale · Maison' });
  const localId = await option.getAttribute('value');
  await choose(page, 'task:alpha', localId);
  await page.getByRole('button', { name: 'Créer ce lien', exact: true }).click();
  await choose(page, 'task:alpha', 'outlook:Travail');
  await page.getByRole('button', { name: 'Créer ce lien', exact: true }).click();
  await expect(page.locator('.graph-edge--category')).toHaveCount(2);
  const tasks = await savedTasks(page);
  expect(tasks[0].categories).toEqual(['Travail']);
  expect(tasks[0].localCategoryIds).toHaveLength(1);
  await page.reload();
  await expect(page.locator('.graph-edge--category')).toHaveCount(2);
});

test('dragging, keyboard movement, focus and reorganization preserve the graph', async ({ page }) => {
  await seed(page);
  const node = page.getByRole('button', { name: 'Tâche : Alpha', exact: true });
  const old = await node.getAttribute('transform');
  await node.scrollIntoViewIfNeeded();
  const box = await node.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + 60, { steps: 8 });
  await page.mouse.up();
  await expect(node).not.toHaveAttribute('transform', old);
  const moved = await node.getAttribute('transform');
  await page.reload();
  await expect(node).toHaveAttribute('transform', moved);
  await node.focus();
  await node.press('Alt+ArrowRight');
  await expect(node).not.toHaveAttribute('transform', moved);
  await choose(page, 'task:alpha', 'task:beta');
  const beforeFocus = await page.locator('.entity-graph').getAttribute('viewBox');
  await page.getByRole('button', { name: 'Centrer la sélection', exact: true }).click();
  await expect(page.locator('.entity-graph')).not.toHaveAttribute('viewBox', beforeFocus);
  await page.getByRole('button', { name: 'Réorganiser', exact: true }).click();
  await expect(page.locator('.graph-node')).toHaveCount(5);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});
