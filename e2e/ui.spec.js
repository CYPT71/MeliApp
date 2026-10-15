import { test, expect } from '@playwright/test';

const titleInput = page => page.getByRole('textbox', { name: 'Titre de la nouvelle tâche' });
const openTasks = async page => {
  await page.goto('/#/tasks');
  await expect(titleInput(page)).toBeVisible();
};
const createTask = async (page, title) => {
  await titleInput(page).fill(title);
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.locator('.task-workspace-summary strong')).toHaveText('1 tâche active');
  await page.getByRole('tab', { name: 'Liste', exact: true }).click();
  await expect(page.locator('.task-title-button')).toHaveText(title);
};

test('all navigation pages render without browser errors or horizontal overflow', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const links = await page.locator('.feature-nav a').evaluateAll(links => links.map(link => link.getAttribute('href')));
  for (const href of links) {
    await page.goto(`/${href}`);
    await expect(page.locator('.feature')).not.toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('Enter creates a task and keeps the page loaded', async ({ page }) => {
  await openTasks(page);
  await titleInput(page).fill('Préparer le rendez-vous');
  await titleInput(page).press('Enter');
  await expect(page.locator('.task-workspace-summary strong')).toHaveText('1 tâche active');
  await expect(titleInput(page)).toHaveValue('');
});

test('opening creation options preserves the draft', async ({ page }) => {
  await openTasks(page);
  await titleInput(page).fill('Brouillon à conserver');
  await page.getByRole('button', { name: 'Options', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Moins', exact: true })).toBeVisible();
  await expect(titleInput(page)).toHaveValue('Brouillon à conserver');
  await page.getByRole('spinbutton', { name: 'Durée', exact: true }).fill('45');
  await page.getByRole('button', { name: 'Moins', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Options', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Options', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Durée', exact: true })).toHaveValue('45');
});

test('search filters while typing and keeps keyboard focus', async ({ page }) => {
  await openTasks(page);
  await createTask(page, 'Préparer le rendez-vous');
  const search = page.getByRole('searchbox', { name: 'Rechercher une tâche' });
  await search.pressSequentially('absent');
  await expect(page.locator('.task-title-button')).toHaveCount(0);
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('absent');
});

test('task inspector traps focus, closes with Escape and returns focus', async ({ page }) => {
  await openTasks(page);
  await createTask(page, 'Préparer le rendez-vous');
  const task = page.locator('.task-title-button');
  await task.click();
  const dialog = page.getByRole('dialog', { name: 'Préciser la tâche' });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).focus();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(task).toBeFocused();
});

test('unknown routes offer a way home', async ({ page }) => {
  await page.goto('/#/page-inconnue');
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
  await page.getByRole('link', { name: 'Retour à l’accueil' }).click();
  await expect(page.locator('.feature-nav a[aria-current="page"]')).toHaveText('🏠 Accueil');
});

test('editing, completing and reloading a task preserves its data', async ({ page }) => {
  await openTasks(page);
  await createTask(page, 'Brouillon');
  await page.locator('.task-title-button').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Titre', exact: true }).fill('Tâche corrigée');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.task-title-button')).toHaveText('Tâche corrigée');
  await page.reload();
  await expect(page.locator('.task-title-button')).toHaveText('Tâche corrigée');
  await page.getByRole('button', { name: 'Terminer Tâche corrigée', exact: true }).click();
  await expect(page.locator('.task-title-button')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Filtrer par état', exact: true }).selectOption('completed');
  await expect(page.locator('.task-title-button')).toHaveText('Tâche corrigée');
});

test('task details still allow manual decomposition', async ({ page }) => {
  await openTasks(page);
  await createTask(page, 'Préparer le rendez-vous');
  await page.getByRole('button', { name: 'Détails', exact: true }).click();
  await page.getByRole('button', { name: 'Découper', exact: true }).click();
  await page.getByRole('textbox', { name: 'Titre de la sous-tâche' }).fill('Ouvrir le document');
  await page.getByRole('textbox', { name: 'Titre de la sous-tâche' }).press('Enter');
  await expect(page.locator('.subtask-row__title')).toHaveText('Ouvrir le document');
});

test('creating a task from a project preselects its project', async ({ page }) => {
  await page.goto('/#/projects');
  await page.getByRole('textbox', { name: 'Nom du projet', exact: true }).fill('Projet UI');
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  const card = page.locator('.project-card');
  await expect(card).toContainText('Projet UI');
  await card.getByRole('button', { name: 'Ajouter une tâche', exact: true }).click();
  await expect(page).toHaveURL(/#\/tasks$/);
  await expect(page.getByRole('combobox', { name: 'Projet', exact: true })).toHaveValue(/.+/);
  await titleInput(page).fill('Tâche reliée');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.locator('.task-workspace-summary strong')).toHaveText('1 tâche active');
  await page.goto('/#/projects');
  await expect(page.locator('.project-card')).toContainText('Tâche reliée');
});

test('pausing a guided task preserves the session after reloading', async ({ page }) => {
  await openTasks(page);
  await createTask(page, 'Préparer le rendez-vous');
  await page.getByRole('button', { name: 'Commencer Préparer le rendez-vous pas à pas', exact: true }).click();
  await expect(page).toHaveURL(/#\/step-by-step$/);
  await page.getByRole('button', { name: 'Faire une pause', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ton repère est sauvegardé' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ton repère est sauvegardé' })).toBeVisible();
  await page.getByRole('button', { name: 'Reprendre cette étape', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Faire une pause', exact: true })).toBeVisible();
});


test('adding an existing task to a project persists without duplication', async ({ page }) => {
  await openTasks(page);
  await createTask(page, 'Tâche existante');
  await page.goto('/#/projects');
  await page.getByRole('textbox', { name: 'Nom du projet', exact: true }).fill('Projet existant');
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  const card = page.locator('.project-card');
  await card.getByRole('combobox', { name: 'Tâche existante à ajouter', exact: true }).selectOption({ label: 'Tâche existante' });
  await expect(card.locator('.project-task-row')).toHaveCount(0);
  await card.getByRole('button', { name: 'Ajouter une tâche existante', exact: true }).click();
  await expect(card.locator('.project-task-row')).toContainText('Tâche existante');
  await page.reload();
  await expect(card.locator('.project-task-row')).toHaveCount(1);
  await expect(card.locator('.project-task-row')).toContainText('Tâche existante');
});
