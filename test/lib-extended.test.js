'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { validate, budgetPlan, timeline, EVENT_TYPES } = require('../lib');

const today = new Date('2026-10-30T10:00:00');

// ==========================================
// Input Validation Extended Tests
// ==========================================
test('validate handles null, undefined, or empty object input gracefully', () => {
  const rNull = validate(null, today);
  assert.equal(rNull.ok, false);
  assert.ok(rNull.errors.length > 0);

  const rUndefined = validate(undefined, today);
  assert.equal(rUndefined.ok, false);
  assert.ok(rUndefined.errors.length > 0);

  const rEmpty = validate({}, today);
  assert.equal(rEmpty.ok, false);
  assert.ok(rEmpty.errors.length > 0);
});

test('validate checks eventType (case insensitivity, invalid types)', () => {
  assert.ok(validate({ eventType: 'WEDDING', guests: 50, budget: 100000, date: '2026-12-01' }, today).ok);
  assert.ok(validate({ eventType: 'Community', guests: 50, budget: 100000, date: '2026-12-01' }, today).ok);

  const rInvalid = validate({ eventType: 'gala', guests: 50, budget: 100000, date: '2026-12-01' }, today);
  assert.equal(rInvalid.ok, false);
  assert.ok(rInvalid.errors.some((e) => e.includes('event type')));
});

test('validate boundary checks for guests count', () => {
  // Valid boundary values
  assert.ok(validate({ eventType: 'birthday', guests: 1, budget: 50000, date: '2026-12-01' }, today).ok);
  assert.ok(validate({ eventType: 'birthday', guests: 5000, budget: 50000, date: '2026-12-01' }, today).ok);

  // Invalid values
  const cases = [0, -5, 5001, 12.5, 'not-a-number', NaN, Infinity];
  for (const g of cases) {
    const res = validate({ eventType: 'birthday', guests: g, budget: 50000, date: '2026-12-01' }, today);
    assert.equal(res.ok, false, `guests=${g} should fail validation`);
    assert.ok(res.errors.some((e) => e.includes('Guests must be a whole number')));
  }
});

test('validate boundary checks for budget', () => {
  // Valid boundaries
  assert.ok(validate({ eventType: 'birthday', guests: 10, budget: 1000, date: '2026-12-01' }, today).ok);
  assert.ok(validate({ eventType: 'birthday', guests: 10, budget: 100000000, date: '2026-12-01' }, today).ok);

  // Float budget is rounded in return value
  const rFloat = validate({ eventType: 'birthday', guests: 10, budget: 50000.8, date: '2026-12-01' }, today);
  assert.ok(rFloat.ok);
  assert.equal(rFloat.value.budget, 50001);

  // Invalid values
  const cases = [999, 100000001, -5000, 'free', NaN, Infinity];
  for (const b of cases) {
    const res = validate({ eventType: 'birthday', guests: 10, budget: b, date: '2026-12-01' }, today);
    assert.equal(res.ok, false, `budget=${b} should fail validation`);
    assert.ok(res.errors.some((e) => e.includes('Budget must be a number')));
  }
});

test('validate checks date correctness (future, today, past, invalid calendar dates)', () => {
  // Event on today is allowed
  const rToday = validate({ eventType: 'birthday', guests: 10, budget: 50000, date: '2026-10-30' }, today);
  assert.ok(rToday.ok);

  // Past date rejected
  const rPast = validate({ eventType: 'birthday', guests: 10, budget: 50000, date: '2026-10-29' }, today);
  assert.equal(rPast.ok, false);
  assert.ok(rPast.errors.some((e) => e.includes('past')));

  // Impossible calendar dates (e.g., Feb 31st) rejected
  const rFeb31 = validate({ eventType: 'birthday', guests: 10, budget: 50000, date: '2026-02-31' }, today);
  assert.equal(rFeb31.ok, false);
  assert.ok(rFeb31.errors.some((e) => e.includes('valid event date')));

  // Malformed date strings
  const badDates = ['invalid-date', '2026-13-01', '2026/11/20', '2026-11-20T00:00:00', ''];
  for (const d of badDates) {
    const res = validate({ eventType: 'birthday', guests: 10, budget: 50000, date: d }, today);
    assert.equal(res.ok, false, `date="${d}" should fail validation`);
    assert.ok(res.errors.some((e) => e.includes('valid event date')));
  }
});

test('validate sanitizes, trims, and caps city and notes', () => {
  const longCity = 'A'.repeat(100);
  const longNotes = 'B'.repeat(1000);
  const r = validate({
    eventType: 'birthday',
    guests: 10,
    budget: 50000,
    date: '2026-12-01',
    city: `  ${longCity}  `,
    notes: `  ${longNotes}  `
  }, today);

  assert.ok(r.ok);
  assert.equal(r.value.city.length, 60);
  assert.equal(r.value.notes.length, 500);

  // Missing city and notes default to empty strings
  const rEmpty = validate({ eventType: 'birthday', guests: 10, budget: 50000, date: '2026-12-01' }, today);
  assert.ok(rEmpty.ok);
  assert.equal(rEmpty.value.city, '');
  assert.equal(rEmpty.value.notes, '');
});

// ==========================================
// Budget Split & Per-Guest Calculation Tests
// ==========================================
test('budgetPlan computes perGuest rounded correctly', () => {
  // 50000 / 30 = 1666.666... -> 1667
  const p1 = budgetPlan('wedding', 50000, 30);
  assert.equal(p1.perGuest, 1667);

  // Single guest
  const p2 = budgetPlan('birthday', 20000, 1);
  assert.equal(p2.perGuest, 20000);

  // 5000 guests
  const p3 = budgetPlan('community', 100000, 5000);
  assert.equal(p3.perGuest, 20);
});

test('budgetPlan split percentages and totals match for all event types and unrounded amounts', () => {
  const types = ['wedding', 'birthday', 'community'];
  const testBudgets = [1000, 10001, 777777, 100000000];

  for (const type of types) {
    const splitConfig = EVENT_TYPES[type].split;
    const categories = Object.keys(splitConfig);

    for (const b of testBudgets) {
      const plan = budgetPlan(type, b, 50);
      assert.equal(plan.total, b);
      assert.equal(plan.lines.length, categories.length);

      // Verify each line category and percent match configuration
      plan.lines.forEach((line, idx) => {
        assert.equal(line.category, categories[idx]);
        assert.equal(line.percent, splitConfig[categories[idx]]);
      });

      // Total of line amounts must equal total budget
      const sum = plan.lines.reduce((acc, line) => acc + line.amount, 0);
      assert.equal(sum, b, `Sum of lines for ${type} with budget ${b} must equal budget`);
    }
  }
});

// ==========================================
// Timeline Compression & Lead-time Tests
// ==========================================
test('timeline returns accurate daysLeft and on-track rows when event is far in future', () => {
  // Event on 2027-10-30 is 365 days away from 2026-10-30
  const t = timeline('wedding', '2027-10-30', today);
  assert.equal(t.daysLeft, 365);
  assert.equal(t.tight, false);

  for (const row of t.rows) {
    assert.equal(row.status, 'on-track');
    assert.equal(row.note, undefined);
  }

  // Check calculated due date for 180-day milestone: 2027-10-30 minus 180 days -> 2027-05-03
  const m180 = t.rows.find((r) => r.daysBefore === 180);
  assert.equal(m180.due, '2027-05-03');
});

test('timeline compresses overdue milestones with short notice', () => {
  // Today is 2026-10-30. Event on 2026-11-09 (10 days away).
  // For wedding milestones: [180, 150, 120, 90, 60, 30, 7, 1]
  // Milestones > 10 days before (180..30) are overdue and compressed to today (2026-10-30).
  // Milestones <= 10 days before (7, 1) are on-track.
  const t = timeline('wedding', '2026-11-09', today);
  assert.equal(t.daysLeft, 10);
  assert.equal(t.tight, true);

  const compressedMilestones = t.rows.filter((r) => r.status === 'overdue-compress');
  const onTrackMilestones = t.rows.filter((r) => r.status === 'on-track');

  assert.equal(compressedMilestones.length, 6); // 180, 150, 120, 90, 60, 30
  assert.equal(onTrackMilestones.length, 2); // 7, 1

  for (const r of compressedMilestones) {
    assert.equal(r.due, '2026-10-30');
    assert.equal(r.note, 'Short notice: do this first, now.');
  }

  // Milestone 7 days before event (2026-11-09 minus 7 = 2026-11-02)
  const m7 = onTrackMilestones.find((r) => r.daysBefore === 7);
  assert.equal(m7.due, '2026-11-02');
  assert.equal(m7.note, undefined);
});

test('timeline handles event on current day (0 days left)', () => {
  // Today is 2026-10-30, event is 2026-10-30.
  // Birthday milestones: [[30, ...], [21, ...], [14, ...], [7, ...], [2, ...], [0, 'Set up early, enjoy the day']]
  const t = timeline('birthday', '2026-10-30', today);
  assert.equal(t.daysLeft, 0);

  const m0 = t.rows.find((r) => r.daysBefore === 0);
  assert.equal(m0.status, 'on-track');
  assert.equal(m0.due, '2026-10-30');
  assert.equal(m0.note, undefined);

  // All other milestones (>0 daysBefore) are compressed
  const compressed = t.rows.filter((r) => r.daysBefore > 0);
  assert.ok(compressed.every((r) => r.status === 'overdue-compress' && r.due === '2026-10-30'));
});
