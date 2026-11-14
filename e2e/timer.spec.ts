import { test, expect } from '@playwright/test'
import { mockSupabase, signIn } from './fixtures/supabase'

test.describe('Running timer', () => {
  test('the tab title keeps ticking while the tab is backgrounded', async ({ page, context }) => {
    await signIn(page)
    await mockSupabase(page)
    await page.goto('/')

    await page.getByText('Supabase sync refactor').waitFor()
    await page.getByRole('button', { name: /start/i }).first().click()

    await expect.poll(() => page.title(), { timeout: 10_000 }).toMatch(
      /^\(\d{2}:\d{2}:\d{2}\) Supabase sync refactor/,
    )

    const readSeconds = async () => {
      const m = (await page.title()).match(/\((\d{2}):(\d{2}):(\d{2})\)/)
      if (!m) throw new Error(`title had no timer: ${await page.title()}`)
      return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
    }

    const before = await readSeconds()

    // Background this page by focusing another tab. requestAnimationFrame
    // stops here, which is exactly what used to freeze the title.
    const other = await context.newPage()
    await other.goto('about:blank')
    await other.bringToFront()
    await page.waitForTimeout(4000)
    await other.close()

    const after = await readSeconds()
    expect(after, 'title must advance while hidden').toBeGreaterThan(before)
  })

  test('pausing clears the timer from the title', async ({ page }) => {
    await signIn(page)
    await mockSupabase(page)
    await page.goto('/')

    await page.getByText('Supabase sync refactor').waitFor()
    await page.getByRole('button', { name: /start/i }).first().click()
    await expect.poll(() => page.title()).toContain('Supabase sync refactor')

    await page.getByRole('button', { name: /pause/i }).first().click()
    await expect.poll(() => page.title()).toBe('Monotask')
  })
})
