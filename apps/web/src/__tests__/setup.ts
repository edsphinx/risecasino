/**
 * Vitest Test Setup
 *
 * Global setup for all tests. Runs before each test file.
 */

import { vi } from 'vitest';

// Mock GSAP since we're testing state logic, not actual animations
vi.mock('gsap', () => ({
  default: {
    to: vi.fn(() => ({ kill: vi.fn() })),
    fromTo: vi.fn(() => ({ kill: vi.fn() })),
    set: vi.fn(),
    timeline: vi.fn(() => ({
      to: vi.fn().mockReturnThis(),
      fromTo: vi.fn().mockReturnThis(),
      add: vi.fn().mockReturnThis(),
      call: vi.fn().mockReturnThis(),
      kill: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    })),
    killTweensOf: vi.fn(),
    globalTimeline: { clear: vi.fn() },
  },
  gsap: {
    to: vi.fn(() => ({ kill: vi.fn() })),
    fromTo: vi.fn(() => ({ kill: vi.fn() })),
    set: vi.fn(),
    timeline: vi.fn(() => ({
      to: vi.fn().mockReturnThis(),
      fromTo: vi.fn().mockReturnThis(),
      add: vi.fn().mockReturnThis(),
      call: vi.fn().mockReturnThis(),
      kill: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    })),
  },
}));

// Mock logger to avoid console spam in tests
vi.mock('@/lib/logger', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
