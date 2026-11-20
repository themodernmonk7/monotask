// @vitest-environment jsdom
import { test, describe, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { AppProvider } from '@/context/AppContext';
import { useApp } from '@/hooks/useApp';

/**
 * Regression coverage for: Supabase hands out a brand-new `session`/`user`
 * object on every token refresh — notably triggered by the tab regaining
 * focus, when the access token happens to be near expiry (auth-js's
 * _onVisibilityChanged -> _recoverAndRefresh) — even though it is the same
 * account. The load effect used to depend on the `user` object itself, so a
 * plain tab switch could re-trigger a full reload and flash the loading
 * splash. It must depend on the account id, not the object reference.
 */

const authState: { user: { id: string } | null } = { user: null };

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: authState.user }),
}));

const emptySnapshot = {
  groups: [],
  completedTasks: [],
  sessions: [],
  noteGroups: [],
  tags: [],
  settings: { dailyTargetMinutes: 420, workingDays: [1, 2, 3, 4, 5] },
  activeState: null,
};

const fetchUserData = vi.fn(async () => ({
  data: emptySnapshot,
  error: null,
  tablesMissing: false,
}));

vi.mock('@/lib/supabaseDb', () => ({
  DEFAULT_SETTINGS: { dailyTargetMinutes: 420, workingDays: [1, 2, 3, 4, 5] },
  fetchUserData: (...args: unknown[]) => fetchUserData(...args),
  persistActiveState: vi.fn(async () => ({ error: null })),
  persistCompletedTasks: vi.fn(async () => ({ error: null })),
  persistGroups: vi.fn(async () => ({ error: null })),
  persistNoteGroups: vi.fn(async () => ({ error: null })),
  persistSessions: vi.fn(async () => ({ error: null })),
  persistSettings: vi.fn(async () => ({ error: null })),
  persistTags: vi.fn(async () => ({ error: null })),
}));

vi.mock('@/lib/localCache', () => ({
  readCache: vi.fn(() => null),
  writeCache: vi.fn(),
}));

function LoadingProbe() {
  const { isLoading } = useApp();
  return <div data-testid="loading">{String(isLoading)}</div>;
}

describe('AppProvider load effect — account identity', () => {
  beforeEach(() => {
    fetchUserData.mockClear();
    authState.user = { id: 'user-1' };
  });

  test('a same-id user object (token refresh) does not trigger a reload', async () => {
    const { rerender } = render(
      <AppProvider>
        <LoadingProbe />
      </AppProvider>,
    );

    await screen.findByText('false');
    expect(fetchUserData).toHaveBeenCalledTimes(1);

    // Simulate what auth-js actually does: a fresh object, same account id.
    authState.user = { id: 'user-1' };
    await act(async () => {
      rerender(
        <AppProvider>
          <LoadingProbe />
        </AppProvider>,
      );
    });

    expect(fetchUserData).toHaveBeenCalledTimes(1); // must NOT refetch
    expect(screen.getByTestId('loading').textContent).toBe('false'); // must NOT flash the splash
  });

  test('an actual account change (different id) does trigger a fresh load', async () => {
    const { rerender } = render(
      <AppProvider>
        <LoadingProbe />
      </AppProvider>,
    );

    await screen.findByText('false');
    expect(fetchUserData).toHaveBeenCalledTimes(1);

    authState.user = { id: 'user-2' };
    await act(async () => {
      rerender(
        <AppProvider>
          <LoadingProbe />
        </AppProvider>,
      );
    });

    await screen.findByText('false');
    expect(fetchUserData).toHaveBeenCalledTimes(2);
    expect(fetchUserData).toHaveBeenLastCalledWith('user-2');
  });
});
