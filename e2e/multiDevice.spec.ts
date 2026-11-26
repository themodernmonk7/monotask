import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { defaultSeed, mockSupabase, signIn } from './fixtures/supabase'
import type { SeedData } from './fixtures/supabase'

/**
 * Two (or more) devices signed in to one account, sharing one server.
 *
 * Each "device" is a separate browser context — its own storage, its own app
 * instance — and both talk to the SAME in-memory server (the shared seed).
 * Realtime is not mocked, so these tests exercise the worst case: a device
 * that has NOT heard about the other's change and acts on a stale copy.
 */

const TASK = 'Supabase sync refactor'

async function openDevice(browser: Browser, seed: SeedData): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signIn(page)
  await mockSupabase(page, seed)
  await page.goto('/')
  await page.getByText(TASK).waitFor()
  return page
}

/** The row containing a task's controls. */
const row = (page: Page, taskId: string) => page.locator(`#task-${taskId}`)

/** What focusing the app does: pull the latest from the server. */
async function resync(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForTimeout(1500)
}

type Row = { id: string; task_id?: string; tasks?: { id: string }[] }

test.describe('Multiple devices', () => {
  test('a task completed on one device does not come back from a stale device running it', async ({ browser }) => {
    const seed = defaultSeed()
    const laptop = await openDevice(browser, seed)
    const desktop = await openDevice(browser, seed)

    // The timer runs on the desktop.
    await row(desktop, 't-sync').getByTitle('Start').click()
    await desktop.waitForTimeout(1200)

    // The laptop learns about it, then completes the task.
    await resync(laptop)
    await row(laptop, 't-sync').getByLabel('Mark as done').click()
    await laptop.waitForTimeout(800)

    // The desktop hasn't heard yet and makes an unrelated change to the
    // groups. This is what used to write the completed task back.
    await desktop.getByLabel('Pin group').first().click()
    await desktop.waitForTimeout(800)

    const groups = seed.groups as Row[]
    const open = groups.flatMap((g) => g.tasks ?? []).map((t) => t.id)
    expect(open, 'the completed task must not be resurrected').not.toContain('t-sync')

    // Once the desktop syncs, the task is gone and its timer has stopped.
    await resync(desktop)
    await expect(row(desktop, 't-sync')).toHaveCount(0)
    await expect(desktop).not.toHaveTitle(/min/)

    // Exactly one completion, and the timed segment recorded exactly once.
    const completions = (seed.completed_tasks as Row[]).filter((c) => c.id === 'done-t-sync')
    expect(completions).toHaveLength(1)
    const sessions = (seed.work_sessions as Row[]).filter((s) => s.task_id === 't-sync')
    expect(sessions).toHaveLength(1)
    expect((seed.user_active_state as { running_task_id: string | null }).running_task_id).toBeNull()
  })

  test('completing the same task on two stale devices records it once', async ({ browser }) => {
    const seed = defaultSeed()
    const laptop = await openDevice(browser, seed)
    const desktop = await openDevice(browser, seed)

    await row(laptop, 't-sync').getByLabel('Mark as done').click()
    await row(desktop, 't-sync').getByLabel('Mark as done').click()
    await desktop.waitForTimeout(800)

    expect((seed.completed_tasks as Row[]).map((c) => c.id)).toEqual(['done-t-sync'])
  })

  test("a stale device never deletes time recorded on another device", async ({ browser }) => {
    const seed = defaultSeed()
    const laptop = await openDevice(browser, seed)
    const desktop = await openDevice(browser, seed)

    // Laptop records a session.
    await row(laptop, 't-sync').getByTitle('Start').click()
    await laptop.waitForTimeout(1500)
    await row(laptop, 't-sync').getByTitle('Pause').click()
    await laptop.waitForTimeout(500)
    const laptopSession = (seed.work_sessions as Row[])[0]
    expect(laptopSession, 'laptop recorded a session').toBeTruthy()

    // Desktop, not knowing about it, records its own on another task.
    await row(desktop, 't-standup').getByTitle('Start').click()
    await desktop.waitForTimeout(1500)
    await row(desktop, 't-standup').getByTitle('Pause').click()
    await desktop.waitForTimeout(500)

    // The old whole-collection write deleted the laptop's session here.
    const ids = (seed.work_sessions as Row[]).map((s) => s.id)
    expect(ids).toContain(laptopSession.id)
    expect(ids).toHaveLength(2)

    // And after syncing, the desktop shows the laptop's time on that task.
    await resync(desktop)
    // 30:00 seeded + however long the laptop's entry turned out to be.
    const recorded = (laptopSession as unknown as { duration_seconds: number }).duration_seconds
    const total = 1800 + recorded
    const hms = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
      .map((n) => String(n).padStart(2, '0'))
      .join(':')
    await expect(row(desktop, 't-sync')).toContainText(hms)
  })
})
