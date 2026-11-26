import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockSupabase, signIn } from './fixtures/supabase'

/** Record Badging API calls (headless browsers have no Dock to show them on). */
async function stubBadge(page: Page) {
  await page.addInitScript(() => {
    const calls: Array<number | 'dot' | 'clear'> = []
    ;(window as unknown as { __badge: typeof calls }).__badge = calls
    Object.assign(navigator, {
      setAppBadge: (n?: number) => {
        calls.push(n === undefined ? 'dot' : n)
        return Promise.resolve()
      },
      clearAppBadge: () => {
        calls.push('clear')
        return Promise.resolve()
      },
    })
  })
}

const lastBadge = (page: Page) =>
  page.evaluate(() => (window as unknown as { __badge: unknown[] }).__badge.at(-1))

test.describe('App icon badge', () => {
  test.beforeEach(async ({ page }) => {
    await stubBadge(page)
    await signIn(page)
    await mockSupabase(page)
    await page.goto('/')
    await page.locator('#task-t-sync').waitFor()
  })

  test('shows the running task’s minutes and clears on pause', async ({ page }) => {
    const row = page.locator('#task-t-sync') // seeded with 30 min
    await row.getByTitle('Start').click()
    await expect.poll(() => lastBadge(page)).toBe(30)

    await row.getByTitle('Pause').click()
    await expect.poll(() => lastBadge(page)).toBe('clear')
  })

  test('can be a plain dot, or off, per device', async ({ page }) => {
    await page.getByTitle('Settings').click()
    await page.getByLabel('App icon badge').click()
    await page.getByRole('option', { name: 'Dot' }).click()
    // Applies immediately — no Save needed — so the dialog can be cancelled.
    await page.getByRole('button', { name: 'Cancel' }).click()

    await page.locator('#task-t-sync').getByTitle('Start').click()
    await expect.poll(() => lastBadge(page)).toBe('dot')

    await page.getByTitle('Settings').click()
    await page.getByLabel('App icon badge').click()
    await page.getByRole('option', { name: 'Off' }).click()
    await expect.poll(() => lastBadge(page)).toBe('clear')
  })
})
