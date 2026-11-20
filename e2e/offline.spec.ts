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

  test('a reconnect with no local edits refreshes quietly, without the loading splash', async ({ page }) => {
    // The regression this guards: a reconnect that had nothing to push used
    // to re-enter the same code path as a cold load, which flashed the full
    // "Loading your workspace…" splash for what should be an invisible
    // background refresh.
    await signIn(page)
    await mockSupabase(page)

    await page.goto('/')
    await expect(page.getByText('Supabase sync refactor')).toBeVisible()

    let groupsRefetched = false
    page.on('request', (r) => {
      if (r.method() === 'GET' && r.url().includes('/rest/v1/groups')) groupsRefetched = true
    })

    // No edits were made, so this must take the silent "pull latest" path.
    await page.evaluate(() => window.dispatchEvent(new Event('online')))

    // Checked immediately, before the refetch resolves — this is exactly the
    // instant the splash used to appear.
    await expect(page.getByText(/Loading your workspace/)).toBeHidden()
    await expect(page.getByText('Supabase sync refactor')).toBeVisible()

    await expect.poll(() => groupsRefetched, { timeout: 10_000 }).toBe(true)
    // Still true after the refresh actually completed.
    await expect(page.getByText(/Loading your workspace/)).toBeHidden()
    await expect(page.getByText('Supabase sync refactor')).toBeVisible()
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
