import { test, expect } from '@playwright/test'
import { defaultSeed, mockSupabase, signIn, TEST_USER } from './fixtures/supabase'

const DAY = 24 * 3600_000

function seedWithHistory() {
  const seed = defaultSeed()
  const now = Date.now()
  const done = (id: string, name: string, at: number) => ({
    id,
    user_id: TEST_USER.id,
    task_name: name,
    group_name: 'Platform',
    total_seconds: 600,
    completed_at: at,
  })
  seed.completed_tasks = [
    done('c-today', 'Finished today', now - 60_000),
    done('c-yesterday', 'Finished yesterday', now - DAY),
    done('c-old', 'Finished last week', now - 7 * DAY),
  ]
  return seed
}

test.describe('Completed tab date filter', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
    await mockSupabase(page, seedWithHistory())
    await page.goto('/')
    await page.getByRole('tab', { name: 'Completed' }).click()
  })

  test('shows only today by default', async ({ page }) => {
    await expect(page.getByText('Finished today')).toBeVisible()
    await expect(page.getByText('Finished yesterday')).toHaveCount(0)
    await expect(page.getByText('Finished last week')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled()
  })

  test('previous day and the date picker move between days', async ({ page }) => {
    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(page.getByText('Finished yesterday')).toBeVisible()
    await expect(page.getByText('Finished today')).toHaveCount(0)

    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(page.getByText(/No tasks completed on/)).toBeVisible()

    await page.getByRole('button', { name: 'Today', exact: true }).click()
    await expect(page.getByText('Finished today')).toBeVisible()
  })

  test('picking a day from the calendar popover filters to it', async ({ page }) => {
    await page.getByRole('button', { name: 'Completed on' }).click()
    const yesterday = await page.evaluate(
      (ms) => new Date(Date.now() - ms).toLocaleDateString(),
      DAY,
    )
    await page.locator(`[data-day="${yesterday}"]`).click()

    await expect(page.getByText('Finished yesterday')).toBeVisible()
    await expect(page.getByText('Finished today')).toHaveCount(0)
    // The popover closes after choosing.
    await expect(page.locator('[data-slot="calendar"]')).toHaveCount(0)
  })

  test('All dates shows the full history', async ({ page }) => {
    await page.getByRole('button', { name: 'All dates' }).click()
    for (const name of ['Finished today', 'Finished yesterday', 'Finished last week']) {
      await expect(page.getByText(name)).toBeVisible()
    }
  })
})
