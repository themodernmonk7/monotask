import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// @testing-library/react normally registers this itself, but only when it
// detects a global `afterEach` — we don't enable Vitest's globals (tests
// import `test`/`expect`/etc. explicitly), so it never fires on its own.
// Without it, every render() leaks into the shared jsdom document and a
// later test's text queries can match leftover nodes from an earlier one.
afterEach(() => {
  cleanup();
});
