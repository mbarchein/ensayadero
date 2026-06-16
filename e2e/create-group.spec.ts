import { test, expect } from '@playwright/test'

// Exercises the create-group flow through the UI for every type: fill the name,
// pick the GroupTypeField tile, submit, then confirm the brand-new group adopts
// the type's vocabulary (activity tab) and that Edit shows the chosen type.
const TYPES = [
  { tile: 'Teatro', actPl: 'Ensayos' },
  { tile: 'Música', actPl: 'Ensayos' },
  { tile: 'Danza', actPl: 'Ensayos' },
  { tile: 'Deportes', actPl: 'Entrenamientos' },
  { tile: 'Otro', actPl: 'Eventos' },
]
// Unique per run so repeated runs don't collide and the new card is findable.
const RUN = Date.now().toString(36)

test.describe('create group adopts type wording', () => {
  for (const c of TYPES) {
    test(`create a ${c.tile} group`, async ({ page }) => {
      const name = `E2E Crear ${c.tile} ${RUN}`

      await page.goto('/new-group')
      // Step 1 — type
      await page.getByRole('button', { name: c.tile, exact: true }).click()
      await page.getByRole('button', { name: 'Siguiente' }).click()
      // Step 2 — name
      await page.getByLabel('Nombre del grupo').fill(name)
      await page.getByRole('button', { name: 'Siguiente' }).click()
      // Step 3 — new-member policy
      await page.getByRole('button', { name: 'Siguiente' }).click()
      // Step 4 — image → create
      await page.getByRole('button', { name: 'Crear grupo' }).click()

      // NewGroupPage navigates back to home; open the freshly created group.
      await page.waitForURL('http://localhost:5173/')
      await page.getByText(name, { exact: true }).click()
      await page.waitForURL(/\/g\/[0-9a-f-]+$/)

      // The new group already speaks its type's language.
      await expect(page.getByRole('heading', { name: c.actPl, exact: true })).toBeVisible()
      await expect(page.locator('body')).not.toContainText('{{')

      // Edit form reflects the type chosen at creation time.
      const base = new URL(page.url()).pathname
      await page.goto(`${base}/edit`)
      await expect(page.getByRole('button', { name: c.tile, pressed: true })).toBeVisible()
    })
  }
})
