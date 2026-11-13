import { test, expect } from '@playwright/test'
import { mockSupabase, signIn } from './fixtures/supabase'

test.describe('Tags', () => {
  test('the tag dropdown is not clipped by its parent containers', async ({ page }) => {
    await signIn(page)
    await mockSupabase(page)
    await page.goto('/')

    await page.getByText('Supabase sync refactor').waitFor()

    // Open the details panel, then the tag picker.
    await page.getByTitle(/Description & tags|Hide details/).first().click()
    await page.getByRole('button', { name: /tagged|Add tags/ }).first().click()

    const panel = page.getByPlaceholder('Search or create…')
    await expect(panel).toBeVisible()

    // The regression: the task row, the details animation wrapper and the
    // group expander all clip overflow, so an absolutely positioned panel
    // got sliced off. Assert the whole panel sits inside the viewport.
    const box = await panel.locator('xpath=ancestor::div[1]').boundingBox()
    const viewport = page.viewportSize()
    expect(box).not.toBeNull()
    expect(box!.height, 'panel should not be collapsed').toBeGreaterThan(50)
    expect(box!.y + box!.height, 'panel bottom must be on screen').toBeLessThanOrEqual(
      viewport!.height,
    )

    // The create row must be reachable, which is what got cut off before.
    await panel.fill('Brand New Tag')
    await expect(page.getByText(/Create .Brand New Tag./)).toBeVisible()
  })

  test('filtering by tag narrows the task list', async ({ page }) => {
    await signIn(page)
    await mockSupabase(page)
    await page.goto('/')

    await expect(page.getByText('Supabase sync refactor')).toBeVisible()
    await expect(page.getByText('Daily standup')).toBeVisible()

    await page.getByRole('button', { name: 'Deep Work', exact: true }).click()

    await expect(page.getByText('Supabase sync refactor')).toBeVisible()
    await expect(page.getByText('Daily standup')).toBeHidden()
  })

  test('text search filters across names and descriptions', async ({ page }) => {
    await signIn(page)
    await mockSupabase(page)
    await page.goto('/')

    await page.getByLabel('Filter tasks').fill('standup')

    await expect(page.getByText('Daily standup')).toBeVisible()
    await expect(page.getByText('Supabase sync refactor')).toBeHidden()
  })
})
