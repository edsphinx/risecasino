# Testing Strategy

## TDD Approach

All GameEngine code follows Test-Driven Development:

1. Write test first (red)
2. Write minimal code to pass (green)
3. Refactor while tests pass (refactor)

---

## Test Pyramid

```
                    ╱╲
                   ╱  ╲
                  ╱ E2E ╲         5%
                 ╱────────╲
                ╱Integration╲      15%
               ╱──────────────╲
              ╱   Unit Tests    ╲   80%
             ╱────────────────────╲
```

---

## Unit Tests (Vitest)

### StateMachine Tests

```typescript
describe('StateMachine', () => {
  // State operations
  it('starts in idle phase');
  it('adds player card correctly');
  it('adds dealer card correctly');
  it('tracks hidden card');
  it('reveals hidden card');
  it('calculates player value');
  it('calculates dealer value');

  // Phase transitions
  it('transitions idle → dealing');
  it('blocks invalid transitions');
  it('notifies subscribers on change');

  // Edge cases
  it('handles empty state');
  it('handles max cards (11)');
  it('handles multiple aces');
});
```

### CardRenderer Tests

```typescript
describe('CardRenderer', () => {
  it('creates card element with correct classes');
  it('adds card to player zone');
  it('adds card to dealer zone');
  it('removes specific card');
  it('removes all cards');
  it('sets card face up/down');
  it('returns correct deck position');
});
```

### AnimationController Tests

```typescript
describe('AnimationController', () => {
  it('creates deal animation timeline');
  it('creates flip animation timeline');
  it('kills all active timelines');
  it('tracks active timeline count');
  it('respects timing configuration');
});
```

---

## Invariant Tests

Tests that verify conditions that must ALWAYS hold:

```typescript
describe('Invariants', () => {
  // Card count limits
  test.prop([fc.array(fc.integer({ min: 0, max: 51 }), { maxLength: 20 })])(
    'player never has more than 11 cards',
    (cards) => {
      const engine = new GameEngine('test');
      cards.forEach((c) => engine.dealCard(c, false, false));
      expect(engine.getState().playerCards.length).toBeLessThanOrEqual(11);
    }
  );

  // Value calculation
  test.prop([fc.array(fc.integer({ min: 0, max: 51 }), { maxLength: 10 })])(
    'hand value is always 0-30',
    (cards) => {
      const value = calculateHandValue(cards);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(30);
    }
  );

  // Phase transitions
  test('phase only changes to valid next states', () => {
    const engine = new GameEngine('test');
    const phases = ['idle', 'dealing', 'player_turn', 'dealer_turn', 'result'];
    // Cannot skip phases
    expect(() => engine.setPhase('result')).toThrow();
  });
});
```

---

## Fuzzing Tests

Random input testing to find edge cases:

```typescript
describe('Fuzzing', () => {
  // Random card sequences
  test.prop([
    fc.array(
      fc.record({
        card: fc.integer({ min: 0, max: 51 }),
        isDealer: fc.boolean(),
        isHidden: fc.boolean(),
      }),
      { minLength: 1, maxLength: 50 }
    ),
  ])('handles any card sequence without crashing', (events) => {
    const engine = new GameEngine('test');
    expect(() => {
      events.forEach((e) => engine.dealCard(e.card, e.isDealer, e.isHidden));
    }).not.toThrow();
  });

  // Random state mutations
  test.prop([
    fc.array(
      fc.oneof(fc.constant('deal'), fc.constant('hit'), fc.constant('stand'), fc.constant('reset')),
      { maxLength: 100 }
    ),
  ])('survives random action sequences', (actions) => {
    const engine = new GameEngine('test');
    actions.forEach((action) => {
      try {
        switch (action) {
          case 'deal':
            engine.dealCard(randomCard(), false, false);
            break;
          case 'hit':
            engine.dealCard(randomCard(), false, false);
            break;
          case 'stand':
            engine.setPhase('dealer_turn');
            break;
          case 'reset':
            engine.reset();
            break;
        }
      } catch {} // Actions may fail, that's ok
    });
    // Should be in valid state after any sequence
    expect(['idle', 'dealing', 'player_turn', 'dealer_turn', 'result']).toContain(
      engine.getState().phase
    );
  });
});
```

---

## E2E Tests (Playwright)

```typescript
describe('Game Flow E2E', () => {
  test('complete game: deal → player turn → result', async ({ page }) => {
    await page.goto('/game');

    // Bet
    await page.click('[data-testid="bet-10"]');

    // Wait for cards
    await page.waitForSelector('.ge-card', { count: 4 });

    // Hit
    await page.click('[data-testid="btn-hit"]');
    await page.waitForSelector('.ge-card', { count: 5 });

    // Stand
    await page.click('[data-testid="btn-stand"]');

    // Result overlay
    await page.waitForSelector('.result-overlay', { state: 'visible' });
  });

  test('cards animate from deck position', async ({ page }) => {
    await page.goto('/game');
    await page.click('[data-testid="bet-10"]');

    // First card should animate
    const card = page.locator('.ge-card').first();
    const initialX = await card.evaluate((el) =>
      parseFloat(getComputedStyle(el).transform.split(',')[4] || '0')
    );

    await page.waitForTimeout(100);

    const finalX = await card.evaluate((el) =>
      parseFloat(getComputedStyle(el).transform.split(',')[4] || '0')
    );

    expect(initialX).not.toBe(finalX); // Position changed
  });
});
```

---

## Test Commands

```bash
# Unit tests
pnpm test

# Watch mode
pnpm test:watch

# With coverage
pnpm test --coverage

# E2E tests
pnpm e2e

# E2E debug mode
pnpm e2e:debug
```

---

## Coverage Targets

| Module              | Target | Critical Areas              |
| ------------------- | ------ | --------------------------- |
| StateMachine        | 95%    | All transitions, value calc |
| CardRenderer        | 80%    | Create, add, remove         |
| AnimationController | 70%    | Timeline creation           |
| GameEngine          | 90%    | Public API methods          |
