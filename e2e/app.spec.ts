import { test, expect } from '@playwright/test';
test('homepage alterna Casa, candidato, busca e paginação', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Quem apoia quem no Congresso?' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ricardo Almeida/ })).toBeVisible();
  await page.getByRole('button', { name: /Helena Costa/ }).click();
  await expect(page.getByText('154 representantes')).toBeVisible();
  await page.getByLabel('Buscar representante').fill('não existe');
  await expect(page.getByText('Nenhum representante encontrado')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await page.getByRole('button', { name: 'Senado Federal', exact: true }).click();
  await expect(page.getByRole('button', { name: /Clara Monteiro/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ricardo Almeida/ })).toHaveCount(0);
  await expect(page.getByText('36 representantes')).toBeVisible();
  await page.getByLabel('Próxima página').click();
  await expect(page.getByText('2 / 2')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.screenshot({
    path: `test-results/home-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test('dashboard demonstra módulos e formulário sem permitir escrita', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Visão geral', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Candidatos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Candidaturas da edição' })).toBeVisible();
  await page.getByRole('button', { name: 'Novo candidato' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar alteração' })).toBeDisabled();
  await page.getByLabel('Fechar formulário').click();
  await page.getByRole('button', { name: 'Revisão editorial' }).click();
  await expect(page.getByRole('button', { name: 'Publicar', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
  await page.screenshot({
    path: `test-results/admin-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});
test('endpoints privados e cron recusam visitantes', async ({ request }) => {
  expect((await request.get('/api/admin')).status()).toBe(401);
  expect(
    (
      await request.post('/api/admin', {
        data: { action: 'settings', input: { self_approval: true } },
      })
    ).status(),
  ).toBe(401);
  expect((await request.get('/api/cron/sync')).status()).toBe(401);
});
