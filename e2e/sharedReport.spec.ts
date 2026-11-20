import { test, expect } from '@playwright/test'
import { mockSupabase, signIn, defaultSeed } from './fixtures/supabase'

/**
 * These tests cover the thing that actually matters for this feature: a
 * genuinely signed-out visitor — a fresh, isolated browser context, never
 * calling signIn() — can open the link and see the report, with the full
 * authenticated app shell never appearing on that page.
 */
test.describe('Shared reports', () => {
  test('a signed-out visitor sees the shared report and nothing else', async ({ browser }) => {
    const ownerCtx = await browser.newContext()
    const ownerPage = await ownerCtx.newPage()
    await signIn(ownerPage)
    const backend = await mockSupabase(ownerPage)
    await ownerPage.goto('/')
    await ownerPage.getByText('Supabase sync refactor').waitFor()
    await ownerPage.getByRole('tab', { name: 'Reports' }).click()

    await ownerPage.getByRole('button', { name: 'Share' }).click()
    await expect(ownerPage.getByText('Share this report')).toBeVisible()
    await ownerPage.getByRole('button', { name: 'Create share link' }).click()

    const linkInput = ownerPage.locator('input[readonly]')
    await expect(linkInput).toBeVisible()
    const link = await linkInput.inputValue()
    expect(link).toMatch(/\/share\/[0-9a-f-]+$/)
    const shareId = link.split('/share/')[1]

    const sharedRows = backend.getSeed().shared_reports
    expect(sharedRows).toHaveLength(1)
    expect(sharedRows[0].id).toBe(shareId)
    expect(sharedRows[0].owner_name).toBe('Ada Lovelace')
    await ownerCtx.close()

    // A brand new, fully isolated context: no cookies, no localStorage, no
    // auth session — exactly what a stranger clicking the link has. Its mock
    // backend is seeded with just the one row the owner actually created.
    const visitorCtx = await browser.newContext()
    const visitor = await visitorCtx.newPage()
    await mockSupabase(visitor, { ...defaultSeed(), shared_reports: sharedRows })

    await visitor.goto(`/share/${shareId}`)

    await expect(visitor.getByText('Shared report')).toBeVisible()
    await expect(visitor.getByText('Total Logged')).toBeVisible({ timeout: 10_000 })

    // The full authenticated app shell must never appear on this page.
    await expect(visitor.getByRole('tab', { name: 'Tasks' })).toHaveCount(0)
    await expect(visitor.getByTitle('Sign Out')).toHaveCount(0)

    await visitorCtx.close()
  })

  test('revoking a link makes it stop working immediately', async ({ browser }) => {
    const ownerCtx = await browser.newContext()
    const ownerPage = await ownerCtx.newPage()
    await signIn(ownerPage)
    const backend = await mockSupabase(ownerPage)
    await ownerPage.goto('/')
    await ownerPage.getByText('Supabase sync refactor').waitFor()
    await ownerPage.getByRole('tab', { name: 'Reports' }).click()
    await ownerPage.getByRole('button', { name: 'Share' }).click()
    await ownerPage.getByRole('button', { name: 'Create share link' }).click()

    const link = await ownerPage.locator('input[readonly]').inputValue()
    const shareId = link.split('/share/')[1]

    await ownerPage.getByTitle('Revoke link').click()
    await expect
      .poll(() => backend.getSeed().shared_reports.find((r) => r.id === shareId)?.revoked)
      .toBe(true)
    await ownerCtx.close()

    const visitorCtx = await browser.newContext()
    const visitor = await visitorCtx.newPage()
    await mockSupabase(visitor, { ...defaultSeed(), shared_reports: backend.getSeed().shared_reports })

    await visitor.goto(`/share/${shareId}`)
    await expect(visitor.getByText("This link isn't available")).toBeVisible({ timeout: 10_000 })

    await visitorCtx.close()
  })

  test('an unknown or made-up id shows the same not-available message, not an error', async ({ page }) => {
    await mockSupabase(page)
    await page.goto('/share/00000000-0000-0000-0000-000000000000')
    await expect(page.getByText("This link isn't available")).toBeVisible({ timeout: 10_000 })
  })
})
