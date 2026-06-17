import { test, expect, type Page } from '@playwright/test'

// One seeded group per type (admin is INSTRUCTOR in each). For every type we
// walk its group screens and assert the wording adapts: the activity noun on
// the sessions tab / planner, the leader role label, the selected type tile on
// the edit form — and that NO screen leaks an unresolved "{{placeholder}}".
type Case = {
  name: string
  actPl: string // group.tabs.sessions  ({{ActPl}})
  plannerWord: string // group.tabs.planner / planner.title ("Nuevo {{act}}")
  leader: string // roleLabel INSTRUCTOR (no gender)
  typeLabel: string // GroupTypeField selected tile
}

const CASES: Case[] = [
  { name: 'E2E Teatro', actPl: 'Ensayos', plannerWord: 'Nuevo ensayo', leader: 'Director', typeLabel: 'Teatro' },
  { name: 'E2E Música', actPl: 'Ensayos', plannerWord: 'Nuevo ensayo', leader: 'Director', typeLabel: 'Música' },
  { name: 'E2E Danza', actPl: 'Ensayos', plannerWord: 'Nuevo ensayo', leader: 'Coreógrafo', typeLabel: 'Danza' },
  {
    name: 'E2E Deportes',
    actPl: 'Entrenamientos',
    plannerWord: 'Nuevo entrenamiento',
    leader: 'Entrenador',
    typeLabel: 'Deportes',
  },
  { name: 'E2E Otro', actPl: 'Eventos', plannerWord: 'Nuevo evento', leader: 'Coordinador', typeLabel: 'Otro' },
]

// No screen may render a literal i18n placeholder.
async function expectNoPlaceholder(page: Page) {
  await expect(page.locator('body')).not.toContainText('{{')
}

async function openGroup(page: Page, name: string): Promise<string> {
  await page.goto('/')
  await expect(page.getByText('Mis grupos')).toBeVisible()
  await page.getByText(name, { exact: true }).click()
  await page.waitForURL(/\/g\/[0-9a-f-]+$/)
  return new URL(page.url()).pathname // /g/<id>
}

test.describe('group-type wording', () => {
  for (const c of CASES) {
    test(`${c.name}: screens use the right vocabulary`, async ({ page }) => {
      const base = await openGroup(page, c.name)

      // Sessions tab heading + planner button reflect the activity noun.
      await expect(page.getByRole('heading', { name: c.actPl, exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: c.plannerWord })).toBeVisible()
      await expectNoPlaceholder(page)

      // Planner screen title.
      await page.goto(`${base}/planner`)
      await expect(page.getByRole('heading', { name: c.plannerWord })).toBeVisible()
      await expectNoPlaceholder(page)

      // Members: the admin's role badge uses the per-type leader label.
      await page.goto(`${base}/members`)
      await expect(page.getByText(c.leader, { exact: true }).first()).toBeVisible()
      await expectNoPlaceholder(page)

      // Edit → type screen: the tile for this type is selected.
      await page.goto(`${base}/edit/type`)
      await expect(page.getByRole('button', { name: c.typeLabel, pressed: true })).toBeVisible()
      await expectNoPlaceholder(page)
    })
  }

  test('cross-group screens render without placeholders', async ({ page }) => {
    for (const path of ['/', '/upcoming', '/profile']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expectNoPlaceholder(page)
    }
  })
})
