import {
  upsertDirectoryRecord,
  removeDirectoryRecord,
  getDirectorySnapshot,
  clearAllDirectories,
} from './paginatedDirectoryStore';

describe('paginatedDirectoryStore (local merge)', () => {
  afterEach(() => clearAllDirectories());

  test('upsert merges by id and sorts by name', () => {
    upsertDirectoryRecord('u1', 'customers', { id: 'b', name: 'ب' });
    upsertDirectoryRecord('u1', 'customers', { id: 'a', name: 'أ' });
    const list = getDirectorySnapshot('u1', 'customers');
    expect(list.map((x) => x.id)).toEqual(['a', 'b']);
  });

  test('remove drops record', () => {
    upsertDirectoryRecord('u1', 'suppliers', { id: 'x', name: 'تاجر' });
    removeDirectoryRecord('u1', 'suppliers', 'x');
    expect(getDirectorySnapshot('u1', 'suppliers')).toHaveLength(0);
  });
});