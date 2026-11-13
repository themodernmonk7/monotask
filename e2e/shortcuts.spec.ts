import { test, expect } from '@playwright/test'
import { mockSupabase, signIn } from './fixtures/supabase'

test.describe('Keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
    await mockSupabase(page)
    await page.goto('/')
    await page.getByText('Supabase sync refactor').waitFor()
  })

  test('/ focuses the filter field', async ({ page }) => {
    await page.locator('body').click()
    await page.keyboard.press('/')
    await expect(page.getByLabel('Filter tasks')).toBeFocused()
  })

  test('Space starts a timer and Escape pauses it', async ({ page }) => {
    await page.locator('body').click()
    await page.keyboard.press(' ')
    await expect.poll(() => page.title(), { timeout: 10_000 }).toContain('Monotask')
    await expect.poll(() => page.title()).toMatch(/^\(\d{2}:/)

    await page.keyboard.press('Escape')
    await expect.poll(() => page.title()).toBe('Monotask')
  })

  test('shortcuts are ignored while typing in a field', async ({ page }) => {
    const input = page.getByLabel('Filter tasks')
    await input.fill('')
    await input.press('n')
    // "n" must land as text, not trigger the new-task shortcut.
    await expect(input).toHaveValue('n')
  })
})
