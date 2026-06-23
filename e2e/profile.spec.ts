import { test, expect } from '@playwright/test'

// Profile screen: per-field inline saving, auto-saving pronoun, fieldset
// legends, the OAuth password section, and the delete-account guard.
test.describe('profile', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()
  })

  test('fieldset legends are present', async ({ page }) => {
    for (const legend of ['Datos personales', 'Contraseña', 'Avisos por email', 'Consejos']) {
      await expect(page.getByText(legend, { exact: true })).toBeVisible()
    }
  })

  test('name saves inline and shows a confirmation', async ({ page }) => {
    const field = page.locator('label:has-text("Nombre")').first()
    await field.locator('input').fill('Admin Local Edit')
    await field.getByRole('button', { name: 'Guardar' }).click()
    await expect(field.getByText('✓ Guardado')).toBeVisible()
    // restore so other specs see the seeded name
    await field.locator('input').fill('Admin Local')
    await field.getByRole('button', { name: 'Guardar' }).click()
    await expect(field.getByText('✓ Guardado')).toBeVisible()
  })

  test('pronoun auto-saves on selection', async ({ page }) => {
    await page.getByRole('radio', { name: 'Ella' }).click()
    await expect(page.getByRole('radio', { name: 'Ella' })).toHaveAttribute('aria-checked', 'true')
    // reset to unspecified
    await page.getByRole('radio', { name: 'Sin especificar' }).click()
    await expect(page.getByRole('radio', { name: 'Sin especificar' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  test('password section is gated by minimum length (no submit)', async ({ page }) => {
    const field = page.locator('fieldset:has-text("Contraseña")')
    // admin already has an email identity → "Cambiar contraseña" (not "Crear")
    const btn = field.getByRole('button', { name: 'Cambiar contraseña' })
    await expect(btn).toBeDisabled()
    await field.locator('input').fill('short')
    await expect(btn).toBeDisabled()
    await field.locator('input').fill('longenough123')
    await expect(btn).toBeEnabled()
  })

  test('device-alerts push section is hidden when VAPID is unset', async ({ page }) => {
    await expect(page.getByText('Avisos en este dispositivo')).toHaveCount(0)
  })

  test('delete account opens a confirm modal that can be cancelled', async ({ page }) => {
    await expect(page.getByText('Zona peligrosa')).toBeVisible()
    await page.getByRole('button', { name: 'Borrar mi cuenta' }).click()
    await page.getByRole('button', { name: 'Cancelar' }).click()
    // still on the profile page, account intact
    await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()
  })
})
