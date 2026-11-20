import { test, expect } from '@playwright/test'
import { mockSupabase, signIn, defaultSeed, TEST_USER } from './fixtures/supabase'

test.describe('Theme toggle', () => {
  test('switching to light mode removes the dark class and persists it', async ({ page }) => {
    await signIn(page)
    const backend = await mockSupabase(page)
    await page.goto('/')
    await page.getByText('Supabase sync refactor').waitFor()

    const html = page.locator('html')
    await expect(html).toHaveClass(/dark/)

    await page.getByTitle('Switch to light mode').click()
    await expect(html).not.toHaveClass(/dark/)

    await expect.poll(() => {
      const write = backend.writes().findLast((w) => w.table === 'user_settings')
      return (write?.body as Record<string, unknown> | undefined)?.theme
    }).toBe('light')
  })

  test('a saved light preference is applied again on reload', async ({ page }) => {
    await signIn(page)
    await mockSupabase(page, {
      ...defaultSeed(),
      user_settings: {
        user_id: TEST_USER.id,
        daily_target_minutes: 420,
        working_days: [1, 2, 3, 4, 5],
        timer_reminder_enabled: false,
        timer_reminder_minutes: 5,
        theme: 'light',
      },
    })
    await page.goto('/')
    await page.getByText('Supabase sync refactor').waitFor()

    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await expect(page.getByTitle('Switch to dark mode')).toBeVisible()
  })
})
