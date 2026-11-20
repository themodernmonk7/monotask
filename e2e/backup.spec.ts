import { test, expect } from '@playwright/test'
import { mockSupabase, signIn } from './fixtures/supabase'

test.describe('Data backup', () => {
  test('downloads a JSON file containing the current data', async ({ page }) => {
    await signIn(page)
    await mockSupabase(page)
    await page.goto('/')
    await page.getByText('Supabase sync refactor').waitFor()

    await page.getByTitle('Settings').click()
    await expect(page.getByText('Your Data')).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download my data' }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/^monotask-backup-\d{4}-\d{2}-\d{2}\.json$/)

    const path = await download.path()
    expect(path).toBeTruthy()
    const fs = await import('node:fs/promises')
    const content = JSON.parse(await fs.readFile(path!, 'utf-8'))

    expect(content.format).toBe('monotask-backup')
    expect(content.version).toBe(1)
    expect(content.data.groups.some((g: { name: string }) => g.name === 'Platform')).toBe(true)
    expect(
      content.data.groups
        .flatMap((g: { tasks: { name: string }[] }) => g.tasks)
        .some((t: { name: string }) => t.name === 'Supabase sync refactor'),
    ).toBe(true)
  })
})
