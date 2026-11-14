import { test, expect } from '@playwright/test'
import { mockSupabase, signIn } from './fixtures/supabase'

test.describe('Offline resilience', () => {
  test('a cold reload with no network renders cached data, not a spinner', async ({ page }) => {
    await signIn(page)
    const backend = await mockSupabase(page)

    // First load populates the cache from the server.
    await page.goto('/')
    await expect(page.getByText('Supabase sync refactor')).toBeVisible()

    // Give the debounced cache write time to land.
    await page.waitForTimeout(3500)

    // Now pull the network and reload — the regression being guarded is the
    // app hanging on "Loading your workspace…" forever.
    backend.goOffline()
    await page.reload()

    await expect(page.getByText('Supabase sync refactor')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/Loading your workspace/)).toBeHidden()
    await expect(page.getByText(/You.re offline/)).toBeVisible()
  })

  test('edits made offline are kept and pushed on reconnect', async ({ page }) => {
    await signIn(page)
    const backend = await mockSupabase(page)

    await page.goto('/')
    await expect(page.getByText('Supabase sync refactor')).toBeVisible()
    await page.waitForTimeout(3500)

    backend.goOffline()
    await page.reload()
    await expect(page.getByText(/You.re offline/)).toBeVisible({ timeout: 15_000 })

    // Add a task while offline.
    const input = page.locator('#new-task-g-platform')
    await input.fill('Written while offline')
    await input.press('Enter')
    await expect(page.getByText('Written while offline')).toBeVisible()

    // Reconnect: the queue should flush the local edit to the server.
    const before = backend.writes().length
    backend.goOnline()
    await page.evaluate(() => window.dispatchEvent(new Event('online')))

    await expect.poll(() => backend.writes().length, { timeout: 15_000 }).toBeGreaterThan(before)
    await expect(page.getByText('Written while offline')).toBeVisible()
  })

  test('with no cache at all it offers a retry instead of hanging', async ({ page }) => {
    await signIn(page)
    const backend = await mockSupabase(page)
    backend.goOffline()

    await page.goto('/')

    await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/Loading your workspace/)).toBeHidden()
  })
})
