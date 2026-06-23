import { test, expect } from '@playwright/test'
import { trackErrors, openGroup } from './helpers'

// Per-group screens reachable from a group: members and planner (director).
test.describe('group screens', () => {
  test('members list renders the current members', async ({ page }) => {
    await openGroup(page, 'E2E Teatro')
    await page.getByRole('button', { name: 'Ver miembros / Invitar' }).click()
    await page.waitForURL(/\/g\/[0-9a-f-]+\/members$/)
    await expect(page.getByRole('heading', { name: 'Miembros' })).toBeVisible()
    await expect(page.getByText('Admin Local')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('{{')
  })

  test('planner opens for a director', async ({ page }) => {
    const errors = trackErrors(page)
    await openGroup(page, 'E2E Teatro')
    await page.getByRole('button', { name: 'Nuevo Ensayo' }).click()
    await page.waitForURL(/\/g\/[0-9a-f-]+\/planner$/)
    await expect(page.getByRole('heading', { name: 'Nuevo Ensayo' })).toBeVisible()
    expect(errors.join('\n')).not.toContain('Cannot read properties of null')
    await expect(page.locator('body')).not.toContainText('{{')
  })

  test('group activity tab speaks its type wording', async ({ page }) => {
    await openGroup(page, 'E2E Deportes')
    await expect(page.getByRole('heading', { name: 'Entrenamientos', exact: true })).toBeVisible()
  })
})
