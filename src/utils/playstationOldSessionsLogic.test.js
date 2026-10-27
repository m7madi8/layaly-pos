import { buildPlaystationCleanupPreview, sessionCleanupBlockReason } from './playstationOldSessionsLogic';

describe('playstationOldSessionsLogic', () => {
  test('blocks active and billed with live order', () => {
    const orders = [{ id: 'o1' }];
    const set = new Set(['o1']);
    expect(sessionCleanupBlockReason({ status: 'active' }, set)).toBe('active');
    expect(sessionCleanupBlockReason({ status: 'ended', billed: true, orderId: 'o1' }, set)).toBe('billed_live_order');
    expect(sessionCleanupBlockReason({ status: 'ended', billed: true, orderId: 'o1', isTestData: true }, set)).toBeNull();
  });

  test('recommends ended unbilled sessions', () => {
    const preview = buildPlaystationCleanupPreview(
      [
        { id: 'a', status: 'active', startedAtMs: 1 },
        { id: 'b', status: 'ended', billed: false, startedAtMs: 2, endedAtMs: 3 },
        { id: 'c', status: 'ended', billed: true, orderId: 'o9', startedAtMs: 4 },
      ],
      []
    );
    expect(preview.recommendedIds).toContain('b');
    expect(preview.eligibleIds).toContain('b');
    expect(preview.eligibleIds).toContain('c');
  });
});
