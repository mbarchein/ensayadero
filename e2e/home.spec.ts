import { test, expect } from '@playwright/test'
import { trackErrors } from './helpers'

// Home "¿Sabías que…?" rotating tips card: navigation, counter, and the
// per-group facts that render clickable group thumbnails.
test.describe('home did-you-know card', () => {
  test('shows the card, advances with next/prev, and keeps a counter', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/')
    const card = page.locator('section', { hasText: '¿Sabías que…?' })
    await expect(card).toBeVisible()

    const counter = card.locator('span.tabular-nums')
    await expect(counter).toHaveText(/^\d+ \/ \d+$/)
    const before = await counter.textContent()

    await card.getByRole('button', { name: 'Siguiente' }).click()
    await expect(counter).not.toHaveText(before!)
    await card.getByRole('button', { name: 'Anterior' }).click()
    await expect(counter).toHaveText(before!)

    expect(errors.join('\n')).not.toContain('Cannot read properties of null')
    await expect(card).not.toContainText('{{')
  })

  test('a per-group fact links to that group via clickable thumbnails', async ({ page }) => {
    await page.goto('/')
    const card = page.locator('section', { hasText: '¿Sabías que…?' })
    await expect(card).toBeVisible()

    // cycle forward (order-independent) until a fact with member thumbnails shows
    const thumb = card.locator('a[href*="/members"]').first()
    let found = false
    for (let i = 0; i < 25; i++) {
      if (await thumb.count()) {
        found = true
        break
      }
      await card.getByRole('button', { name: 'Siguiente' }).click()
    }
    expect(found).toBeTruthy()

    await thumb.click()
    await page.waitForURL(/\/g\/[0-9a-f-]+\/members$/)
    await expect(page.getByRole('heading', { name: 'Miembros' })).toBeVisible()
  })
})

// Quick fuzzy filter over the group cards (only rendered past 3 groups; the
// seeded admin is in 6+). Accent-insensitive, and clearing restores the list.
test.describe('home group filter', () => {
  test('filters the cards and clears back to the full list', async ({ page }) => {
    await page.goto('/')
    const input = page.getByLabel('Buscar grupo…')
    await expect(input).toBeVisible()

    // accent-insensitive: "musica" finds "E2E Música", hides "E2E Teatro",
    // and the matched letters are highlighted (accents included)
    await input.fill('musica')
    await expect(page.getByText('E2E Música', { exact: true })).toBeVisible()
    await expect(page.getByText('E2E Teatro', { exact: true })).not.toBeVisible()
    await expect(page.locator('mark', { hasText: 'Música' }).first()).toBeVisible()

    // no matches → friendly empty message
    await input.fill('zzzz no existe')
    await expect(page.getByText(/Ningún grupo coincide/)).toBeVisible()

    // the X clears the filter and the full list returns
    await page.getByRole('button', { name: 'Limpiar búsqueda' }).click()
    await expect(input).toHaveValue('')
    await expect(page.getByText('E2E Teatro', { exact: true })).toBeVisible()
    await expect(page.getByText('E2E Música', { exact: true })).toBeVisible()
  })
})
