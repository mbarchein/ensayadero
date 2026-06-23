import { type Page } from '@playwright/test'

/** Collect console + uncaught page errors so a spec can assert none leaked. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}

/** Open a group from the home list by its (unique) name. */
export async function openGroup(page: Page, name: string) {
  await page.goto('/')
  await page.getByText(name, { exact: true }).click()
  await page.waitForURL(/\/g\/[0-9a-f-]+$/)
}
