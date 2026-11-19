import { test, expect } from '@playwright/test'
import { mockSupabase, signIn, defaultSeed, TEST_USER } from './fixtures/supabase'

test.describe('Timer reminder sound', () => {
  test('turning it on in Settings and saving persists the choice', async ({ page }) => {
    await signIn(page)
    const backend = await mockSupabase(page)
    await page.goto('/')
    await page.getByText('Supabase sync refactor').waitFor()

    await page.getByTitle('Settings').click()
    await expect(page.getByText('Timer Reminder')).toBeVisible()

    // Off by default.
    const toggle = page.getByRole('switch')
    await expect(toggle).not.toBeChecked()

    await toggle.click()
    await page.getByRole('button', { name: '10 min' }).click()

    await page.getByRole('button', { name: 'Save Settings' }).click()

    await expect.poll(() => {
      const write = backend
        .writes()
        .findLast((w) => w.table === 'user_settings')
      return write?.body
    }).toMatchObject({
      timer_reminder_enabled: true,
      timer_reminder_minutes: 10,
    })
  })

  test('the preview button actually plays the chime', async ({ page }) => {
    await signIn(page)
    await mockSupabase(page)

    // Record calls to HTMLMediaElement.play before the app's scripts run.
    await page.addInitScript(() => {
      ;(window as unknown as { __playCalls: number }).__playCalls = 0
      const original = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        ;(window as unknown as { __playCalls: number }).__playCalls++
        return original.call(this)
      }
    })

    await page.goto('/')
    await page.getByText('Supabase sync refactor').waitFor()

    await page.getByTitle('Settings').click()
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: 'Preview sound' }).click()

    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __playCalls: number }).__playCalls))
      .toBeGreaterThan(0)
  })

  test('a running timer chimes repeatedly on the configured interval', async ({ page }) => {
    // Faster than waiting real minutes: run with a 1-minute interval and
    // fast-forward the clock the app reads from, rather than actually
    // sleeping the test for real wall-clock minutes.
    await signIn(page)
    await mockSupabase(page, {
      ...defaultSeed(),
      user_settings: {
        user_id: TEST_USER.id,
        daily_target_minutes: 420,
        working_days: [1, 2, 3, 4, 5],
        timer_reminder_enabled: true,
        timer_reminder_minutes: 1,
      },
    })

    await page.addInitScript(() => {
      ;(window as unknown as { __playCalls: number }).__playCalls = 0
      const original = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        ;(window as unknown as { __playCalls: number }).__playCalls++
        return original.call(this)
      }
    })

    await page.clock.install()
    await page.goto('/')
    await page.getByText('Supabase sync refactor').waitFor()

    await page.getByRole('button', { name: /start/i }).first().click()

    const calls = () =>
      page.evaluate(() => (window as unknown as { __playCalls: number }).__playCalls)

    await expect(await calls()).toBe(0)

    await page.clock.fastForward('01:05') // past the 1-minute mark
    await expect.poll(calls).toBe(1)

    await page.clock.fastForward('01:00') // a second interval
    await expect.poll(calls).toBe(2)
  })
})
