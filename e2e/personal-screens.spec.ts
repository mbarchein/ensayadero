import { test, expect } from '@playwright/test'
import { trackErrors } from './helpers'

// Global personal screens: availability/agenda, upcoming, notifications, admin.
test.describe('personal screens', () => {
  test('availability/agenda renders without crashing', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/availability')
    await expect(page.getByRole('heading', { name: 'Mi agenda' })).toBeVisible()
    expect(errors.join('\n')).not.toContain('Cannot read properties of null')
    await expect(page.locator('body')).not.toContainText('{{')
  })

  test('upcoming agenda lists scheduled events', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/upcoming')
    // OTHER glossary on this cross-group screen → "Mis próximos Eventos"
    await expect(page.getByRole('heading', { name: /Mis próximos/ })).toBeVisible()
    expect(errors.join('\n')).not.toContain('Cannot read properties of null')
    await expect(page.locator('body')).not.toContainText('{{')
  })

  test('notifications screen renders', async ({ page }) => {
    await page.goto('/notifications')
    await expect(page.getByRole('heading', { name: 'Avisos' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('{{')
  })

  test('admin screen lists groups and users (superadmin)', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible()
    await expect(page.getByText(/Grupos \(\d+\)/)).toBeVisible()
    await expect(page.getByText(/Usuarios \(\d+\)/)).toBeVisible()
  })
})
