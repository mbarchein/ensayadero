import { test as setup, expect } from '@playwright/test'

// Logs in as the seeded superadmin (email+password) and stores the session so
// the e2e spec starts authenticated.
setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type=email]').fill('admin@local.test')
  await page.locator('input[type=password]').fill('password123')
  await page.locator('button[type=submit]').click()
  // LoginPage navigates to "/" on success; home shows the groups heading.
  await expect(page.getByText('Mis grupos')).toBeVisible({ timeout: 20_000 })
  await page.context().storageState({ path: '.auth/admin.json' })
})
