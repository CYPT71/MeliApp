import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ serviceWorkers: 'allow' });

test('a deployed update waits for consent, saves data and drafts, then works offline', async ({ page, context }) => {
  test.setTimeout(60000);
  let version = 'integration-v1';
  const root = process.cwd();
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/version.json') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ version }));
      return;
    }
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) { response.writeHead(403).end(); return; }
    try {
      let content = await readFile(file);
      if (pathname === '/' || pathname === '/index.html') content = Buffer.from(content.toString().replace('<head>', `<head><meta name="app-version" content="${version}">`));
      if (pathname === '/service-worker.js') content = Buffer.from(content.toString().replace(/const CACHE = "[^"]+";/, `const CACHE = "meliapp-shell-${version}";`));
      response.writeHead(200, { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(content);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.goto(`${baseURL}/#/tasks`);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; await caches.open('unrelated-cache'); });
    await page.reload();
    const title = page.getByRole('textbox', { name: 'Titre de la nouvelle tâche' });
    await title.fill('Tâche sauvegardée');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.locator('.task-workspace-summary strong')).toHaveText('1 tâche active');
    await title.fill('Brouillon avant mise à jour');
    version = 'integration-v2';
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByRole('button', { name: 'Mettre à jour', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state)).toBe('installed');
    await expect(page.locator('meta[name="app-version"]')).toHaveAttribute('content', 'integration-v1');
    await page.getByRole('button', { name: 'Mettre à jour', exact: true }).click();
    await expect(page.locator('meta[name="app-version"]')).toHaveAttribute('content', 'integration-v2');
    await expect(title).toHaveValue('Brouillon avant mise à jour');
    await expect(page.locator('.task-workspace-summary strong')).toHaveText('1 tâche active');
    expect(await page.evaluate(() => caches.has('unrelated-cache'))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(title).toHaveValue('Brouillon avant mise à jour');
    await expect(page.locator('.task-workspace-summary strong')).toHaveText('1 tâche active');
  } finally {
    await context.setOffline(false);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
