import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { defaultSeed, mockSupabase, signIn, TEST_USER } from './fixtures/supabase'
import type { SeedData } from './fixtures/supabase'

const DAY = 24 * 3600_000

async function open(page: Page, seed: SeedData = defaultSeed()) {
  await signIn(page)
  await mockSupabase(page, seed)
  await page.goto('/')
  await page.locator('#task-t-sync').waitFor()
  await page.getByTitle('Log time manually').click()
}

async function pickYesterday(page: Page) {
  await page.locator('#log-date').click()
  const yesterday = await page.evaluate(
    (ms) => new Date(Date.now() - ms).toLocaleDateString(),
    DAY,
  )
  await page.locator(`[data-day="${yesterday}"]`).click()
}

async function pickTask(page: Page, name: string | RegExp) {
  await page.locator('#log-task').click()
  await page.getByRole('option', { name }).click()
}

/** The visible tab's content — the undo toast also names the task. */
const panel = (page: Page) => page.getByRole('tabpanel')

async function completedTab(page: Page) {
  await page.getByRole('tab', { name: 'Completed' }).click()
}

test.describe('Log time manually', () => {
  test('logging past work completes the task on that date, not today', async ({ page }) => {
    // The reported bug: logged yesterday, then completed → shown under today.
    await open(page)
    await pickTask(page, 'Audit RLS policies')
    await pickYesterday(page)
    await page.locator('#log-start').fill('10:00')
    await page.locator('#log-end').fill('11:30')
    await page.getByRole('button', { name: 'Log & complete' }).click()

    // Gone from the open list…
    await expect(page.locator('#task-t-rls')).toHaveCount(0)

    // …not under today…
    await completedTab(page)
    await expect(panel(page).getByText('Audit RLS policies')).toHaveCount(0)

    // …but under yesterday.
    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(panel(page).getByText('Audit RLS policies')).toBeVisible()
  })

  test('work on a task that was never added goes straight to Completed on that date', async ({ page }) => {
    await open(page)
    await pickTask(page, /New task/)
    await page.locator('#log-new-name').fill('Client call')
    await page.locator('#log-new-group').click()
    await page.getByRole('option', { name: 'Meetings' }).click()
    await pickYesterday(page)
    await page.locator('#log-start').fill('15:00')
    await page.locator('#log-end').fill('15:45')
    await page.getByRole('button', { name: 'Log & complete' }).click()

    await expect(panel(page).getByText('Client call')).toHaveCount(0) // not an open task
    await completedTab(page)
    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(panel(page).getByText('Client call')).toBeVisible()
    await expect(panel(page).getByText('45m').first()).toBeVisible()
  })

  test('with completion off, the time is added and the task stays open', async ({ page }) => {
    await open(page)
    await pickTask(page, 'Audit RLS policies')
    await pickYesterday(page)
    await page.locator('#log-start').fill('10:00')
    await page.locator('#log-end').fill('11:00')
    await page.locator('#log-complete').click()
    await page.getByRole('button', { name: 'Log time', exact: true }).click()

    // 10 min seeded + 1h logged.
    await expect(page.locator('#task-t-rls')).toContainText('01:10:00')
  })

  test('a task also worked on later is completed on the later day', async ({ page }) => {
    const seed = defaultSeed()
    const now = Date.now()
    seed.work_sessions = [
      {
        id: 's-today',
        user_id: TEST_USER.id,
        task_id: 't-rls',
        task_name: 'Audit RLS policies',
        group_name: 'Platform',
        start_time: now - 30 * 60_000,
        end_time: now - 20 * 60_000,
        duration_seconds: 600,
      },
    ]
    await open(page, seed)
    await pickTask(page, 'Audit RLS policies')
    await pickYesterday(page)
    await page.locator('#log-start').fill('10:00')
    await page.locator('#log-end').fill('11:00')
    await page.getByRole('button', { name: 'Log & complete' }).click()

    await completedTab(page)
    await expect(panel(page).getByText('Audit RLS policies')).toBeVisible() // today
  })

  test('time in the future is rejected', async ({ page }) => {
    await open(page)
    await pickTask(page, 'Audit RLS policies')
    await page.locator('#log-start').fill('23:58')
    await page.locator('#log-end').fill('23:59')
    const submit = page.getByRole('button', { name: 'Log & complete' })
    // Only meaningful before 23:59 local; skip the assertion in that last minute.
    const late = await page.evaluate(() => new Date().getHours() === 23 && new Date().getMinutes() >= 59)
    test.skip(late, 'runs too close to midnight')
    await submit.click()
    await expect(page.getByText("You can't log time that hasn't happened yet.")).toBeVisible()
    await expect(page.locator('#task-t-rls')).toHaveCount(1)
  })
})
