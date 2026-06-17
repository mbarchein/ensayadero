import { test, expect, type Page } from '@playwright/test'

// Editing a group: the type is shown as a row that opens a separate screen to
// pick another; choosing one saves and the change is reflected back. Uses a
// throwaway group so it never mutates the fixtures other specs rely on.
const RUN = Date.now().toString(36)

async function createTheatreGroup(page: Page, name: string): Promise<string> {
  await page.goto('/new-group')
  await page.getByRole('button', { name: 'Teatro', exact: true }).click()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await page.getByLabel('Nombre del grupo').fill(name)
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await page.getByRole('button', { name: 'Crear grupo' }).click()
  await page.getByRole('button', { name: 'Ir al grupo' }).click()
  await page.waitForURL(/\/g\/[0-9a-f-]+$/)
  return new URL(page.url()).pathname
}

test('change group type from a separate screen', async ({ page }) => {
  const base = await createTheatreGroup(page, `E2E Editar Tipo ${RUN}`)

  await page.goto(`${base}/edit`)
  // The new-member setting is presented as one boxed group with a clear title.
  await expect(page.getByText('Cuando alguien se une al grupo')).toBeVisible()

  // Type is a row showing the current value; tapping it opens the picker.
  await page.getByRole('button', { name: /Tipo de grupo/ }).click()
  await page.waitForURL(/\/edit\/type$/)
  await expect(page.getByRole('button', { name: 'Teatro', pressed: true })).toBeVisible()

  // Pick another type → saves and returns to the edit screen.
  await page.getByRole('button', { name: 'Deportes', exact: true }).click()
  await page.waitForURL(/\/edit$/)
  await expect(page.getByText('Deportes')).toBeVisible()

  // The change took effect: the group now speaks the sports vocabulary.
  await page.goto(base)
  await expect(page.getByRole('heading', { name: 'Entrenamientos', exact: true })).toBeVisible()
})
