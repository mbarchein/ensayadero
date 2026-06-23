import { test, expect } from '@playwright/test'

// Public auth screens — run unauthenticated.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('auth pages', () => {
  test('signup shows the OAuth hint linking to login', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible()
    const link = page.getByRole('link', { name: 'Inicia sesión con ese método' })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', '/login')
    await expect(page.getByRole('link', { name: 'Ya tengo cuenta' })).toBeVisible()
  })

  test('login rejects wrong credentials with a friendly error', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type=email]').fill('nobody@local.test')
    await page.locator('input[type=password]').fill('wrongpassword')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByText('Email o contraseña incorrectos.')).toBeVisible()
  })

  test('forgot-password is reachable from login', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click()
    await page.waitForURL(/\/forgot-password$/)
    await expect(page.getByRole('heading', { name: 'Recuperar contraseña' })).toBeVisible()
  })
})
