import { test, expect, type Page } from '@playwright/test'
import { trackErrors } from './helpers'

// Regression: "E2E Sesiones" (owned by directora) has a CONFIRMED session whose
// ACCEPTED participant (Eva Exmiembro) was removed from the group. profiles RLS
// then hides her from directora — who, unlike the superadmin, has no privileged
// view — so the session embeds profiles=null. This used to crash
// SessionDetailPage with "Cannot read properties of null (reading 'name')".
//
// Viewed as directora, NOT the seeded admin: a superadmin sees every profile, so
// the orphan would never be null for them and the bug wouldn't reproduce.
test.use({ storageState: { cookies: [], origins: [] } })

async function loginAndOpenSession(page: Page) {
  await page.goto('/login')
  await page.locator('input[type=email]').fill('directora@local.test')
  await page.locator('input[type=password]').fill('password123')
  await page.locator('button[type=submit]').click()
  await page.getByText('E2E Sesiones', { exact: true }).click()
  await page.waitForURL(/\/g\/[0-9a-f-]+$/)
  await page.locator('a[href*="/sessions/"]').first().click()
  await page.waitForURL(/\/sessions\/[0-9a-f-]+$/)
}

test.describe('session detail', () => {
  test('renders a session with an RLS-hidden ex-member without crashing', async ({ page }) => {
    const errors = trackErrors(page)
    await loginAndOpenSession(page)

    // page rendered (no white-screen): RSVP card + attendees list are visible
    await expect(page.getByText('¿Vas a ir?')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Asistentes', exact: true })).toBeVisible()
    // the orphaned ex-member is filtered out, never rendered
    await expect(page.getByText('Eva Exmiembro')).toHaveCount(0)
    // confirmed session → calendar export offered
    await expect(page.getByRole('button', { name: 'Añadir a mi calendario' })).toBeVisible()
    // the exact crash signature must not appear
    expect(errors.join('\n')).not.toContain('Cannot read properties of null')
    await expect(page.locator('body')).not.toContainText('{{')
  })

  test('RSVP can be set and persists across reload', async ({ page }) => {
    await loginAndOpenSession(page)

    // my own row is labelled "Yo"; its status dot reflects my response
    const myRow = page.locator('li', { hasText: 'Yo' })
    await page.getByRole('button', { name: 'Voy', exact: true }).click()
    await expect(myRow.getByLabel('Voy')).toBeVisible()
    await page.reload()
    await expect(myRow.getByLabel('Voy')).toBeVisible()
  })
})
