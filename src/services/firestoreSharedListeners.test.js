import { sharedOnSnapshot, getActiveSharedListenerCount, teardownAllSharedListeners } from './firestoreSharedListeners';

describe('firestoreSharedListeners', () => {
  afterEach(() => teardownAllSharedListeners());

  test('reuses one subscription per key', () => {
    let starts = 0;
    const start = (deliver) => {
      starts += 1;
      deliver(['a']);
      return () => {};
    };
    const a = [];
    const b = [];
    const unsub1 = sharedOnSnapshot('staff:u1', start, null, (d) => a.push(d), null);
    const unsub2 = sharedOnSnapshot('staff:u1', start, null, (d) => b.push(d), null);
    expect(starts).toBe(1);
    expect(getActiveSharedListenerCount()).toBe(1);
    unsub1();
    expect(getActiveSharedListenerCount()).toBe(1);
    unsub2();
    expect(getActiveSharedListenerCount()).toBe(0);
  });

  test('separate keys for different users', () => {
    let starts = 0;
    const start = (deliver) => {
      starts += 1;
      deliver([]);
      return () => {};
    };
    sharedOnSnapshot('staff:u1', start, null, () => {}, null);
    sharedOnSnapshot('staff:u2', start, null, () => {}, null);
    expect(starts).toBe(2);
    teardownAllSharedListeners();
    expect(getActiveSharedListenerCount()).toBe(0);
  });
});
