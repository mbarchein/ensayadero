import { test, expect, type Page } from '@playwright/test'

// Smoke test for account switching: after signing out and signing in as another
// user, the app shows the NEW user's data, not the previous one's. directora
// owns "E2E Solo Directora" (admin is not a member); admin owns "E2E Teatro".
//
// Note: the cross-user leak this guards against surfaces mainly through the PWA
// service-worker api-cache (RLS-scoped endpoints share a URL across users); the
// dev server runs no service worker, so this exercises the auth + react-query
// path. The cache purge lives in AuthContext (queryClient.clear + api-cache).
test.use({ storageState: { cookies: [], origins: [] } }) // start unauthenticated

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('input[type=email]').fill(email)
  await page.locator('input[type=password]').fill('password123')
  await page.locator('button[type=submit]').click()
}

test('switching users shows the new user data, not the previous one', async ({ page }) => {
  await login(page, 'directora@local.test')
  await expect(page.getByText('E2E Solo Directora')).toBeVisible({ timeout: 20_000 })

  await page.goto('/profile')
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await page.waitForURL(/\/login/)

  await login(page, 'admin@local.test')
  await expect(page.getByText('E2E Teatro', { exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('E2E Solo Directora')).toHaveCount(0)
})
