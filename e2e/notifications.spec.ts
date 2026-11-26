import { test, expect } from '@playwright/test'
import { mockSupabase, signIn } from './fixtures/supabase'

// Chromium reports India's zone by its legacy alias; both are valid IANA names.
const IST = /^Asia\/(Kolkata|Calcutta)$/

test.describe('Notification settings', () => {
  test.use({ timezoneId: 'Asia/Kolkata' })

  test('open-task reminder times are saved with the device time zone', async ({ page }) => {
    await signIn(page)
    const backend = await mockSupabase(page)
    await page.goto('/')
    await page.getByText('Supabase sync refactor').waitFor()

    await page.getByTitle('Settings').click()
    await expect(page.getByText('Notifications', { exact: true })).toBeVisible()

    // This device's status resolves (no service worker in dev, so "off").
    await expect(page.getByTestId('push-device-state')).not.toHaveText('Checking this device…')

    // "Were you working while away?" is on by default; the reminder is off.
    await expect(page.locator('#idle-push')).toBeChecked()
    await expect(page.locator('#pending-push')).not.toBeChecked()

    await page.locator('#pending-push').click()
    await page.getByLabel('First reminder time').click()
    await page.getByRole('option', { name: '7:00 PM' }).click()
    await page.getByLabel('Reminder interval').click()
    await page.getByRole('option', { name: '1 h', exact: true }).click()
    await page.getByLabel('Reminders per day').click()
    await page.getByRole('option', { name: '2', exact: true }).click()
    await expect(page.getByText(/Asia\/(Kolkata|Calcutta)/)).toBeVisible()

    await page.getByRole('button', { name: 'Save Settings' }).click()

    await expect
      .poll(() => backend.writes().findLast((w) => w.table === 'user_settings')?.body)
      .toMatchObject({
        idle_push_enabled: true,
        pending_reminder_enabled: true,
        pending_reminder_start: '19:00',
        pending_reminder_interval_minutes: 60,
        pending_reminder_count: 2,
        timezone: expect.stringMatching(IST),
      })
  })

  test('the time zone is filled in from the device on first load', async ({ page }) => {
    await signIn(page)
    const backend = await mockSupabase(page)
    await page.goto('/')
    await page.getByText('Supabase sync refactor').waitFor()

    await expect
      .poll(() => backend.writes().findLast((w) => w.table === 'user_settings')?.body)
      .toMatchObject({ timezone: expect.stringMatching(IST) })
  })
})
