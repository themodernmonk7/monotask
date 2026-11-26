import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { defaultSeed, mockSupabase, signIn, TEST_USER } from './fixtures/supabase'
import type { SeedData } from './fixtures/supabase'

async function open(page: Page, seed: SeedData = defaultSeed()) {
  await signIn(page)
  await mockSupabase(page, seed)
  await page.goto('/')
  await page.locator('#task-t-rls').waitFor()
}

const panel = (page: Page) => page.getByRole('tabpanel')

test.describe('Time entries', () => {
  test('every restart of a task is its own entry', async ({ page }) => {
    await open(page)
    const row = page.locator('#task-t-rls')

    for (let i = 0; i < 2; i++) {
      await row.getByTitle('Start').click()
      await page.waitForTimeout(1300)
      await row.getByTitle('Pause').click()
      await page.waitForTimeout(200)
    }

    await row.getByRole('button', { name: /2 entries/ }).click()
    await expect(row.locator('[data-entry-id]')).toHaveCount(2)
  })

  test('a running timer shows as a live entry', async ({ page }) => {
    await open(page)
    const row = page.locator('#task-t-rls')
    await row.getByTitle('Start').click()
    await page.waitForTimeout(1200)
    await row.getByRole('button', { name: /1 entry/ }).click()
    await expect(row.getByText('Running')).toBeVisible()
  })
})

test.describe('Move a completed task back to the list', () => {
  function seedWithCompleted() {
    const seed = defaultSeed()
    const now = Date.now()
    seed.completed_tasks = [
      {
        id: 'done-t-old',
        user_id: TEST_USER.id,
        task_name: 'Write release notes',
        group_name: 'Platform',
        total_seconds: 1800,
        completed_at: now - 60_000,
      },
      // An older completion: random id, and more time than its entries hold.
      {
        id: 'legacy-abc',
        user_id: TEST_USER.id,
        task_name: 'Legacy task',
        group_name: 'Meetings',
        total_seconds: 3600,
        completed_at: now - 30_000,
      },
    ]
    seed.work_sessions = [
      {
        id: 's1',
        user_id: TEST_USER.id,
        task_id: 't-old',
        task_name: 'Write release notes',
        group_name: 'Platform',
        start_time: now - 31 * 60_000,
        end_time: now - 61_000,
        duration_seconds: 1800,
        completed_task_id: 'done-t-old',
      },
      {
        id: 's2',
        user_id: TEST_USER.id,
        task_id: 't-legacy',
        task_name: 'Legacy task',
        group_name: 'Meetings',
        start_time: now - 20 * 60_000,
        end_time: now - 10 * 60_000,
        duration_seconds: 600,
        completed_task_id: 'legacy-abc',
      },
    ]
    return seed
  }

  test('it returns to its group with its time and entries, and can be restarted', async ({ page }) => {
    const seed = seedWithCompleted()
    await open(page, seed)
    await page.getByRole('tab', { name: 'Completed' }).click()

    const done = panel(page).locator('li', { hasText: 'Write release notes' })
    await done.hover()
    await done.getByRole('button', { name: 'Move back to tasks' }).click()
    await expect(panel(page).getByText('Write release notes')).toHaveCount(0)

    await page.getByRole('tab', { name: 'Tasks' }).click()
    const row = page.locator('#task-t-old')
    await expect(row).toContainText('00:30:00')
    await expect(row.getByRole('button', { name: /1 entry/ })).toBeVisible()

    // Restarting adds a new entry, it doesn't extend the old one.
    await row.getByTitle('Start').click()
    await page.waitForTimeout(1300)
    await row.getByTitle('Pause').click()
    await expect(row.getByRole('button', { name: /2 entries/ })).toBeVisible()

    // Server side: completion gone, entry un-linked, task back in Platform.
    expect((seed.completed_tasks as { id: string }[]).map((c) => c.id)).not.toContain('done-t-old')
    const s1 = (seed.work_sessions as { id: string; completed_task_id?: string | null }[]).find((s) => s.id === 's1')
    expect(s1?.completed_task_id ?? null).toBeNull()
    const platform = (seed.groups as { id: string; tasks: { id: string }[] }[]).find((g) => g.id === 'g-platform')
    expect(platform?.tasks.map((t) => t.id)).toContain('t-old')
  })

  test('an older completion keeps its full total, not just its entries', async ({ page }) => {
    await open(page, seedWithCompleted())
    await page.getByRole('tab', { name: 'Completed' }).click()
    const done = panel(page).locator('li', { hasText: 'Legacy task' })
    await done.hover()
    await done.getByRole('button', { name: 'Move back to tasks' }).click()

    await page.getByRole('tab', { name: 'Tasks' }).click()
    await expect(page.locator('#task-t-legacy')).toContainText('01:00:00')
  })

  test('moving back can be undone', async ({ page }) => {
    await open(page, seedWithCompleted())
    await page.getByRole('tab', { name: 'Completed' }).click()
    const done = panel(page).locator('li', { hasText: 'Write release notes' })
    await done.hover()
    await done.getByRole('button', { name: 'Move back to tasks' }).click()
    await page.getByRole('button', { name: /undo/i }).click()
    await expect(panel(page).getByText('Write release notes')).toBeVisible()
  })
})
