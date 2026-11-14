import { fetchAllActiveOrders, clearActiveOrdersCache } from './activeOrdersStore';

jest.mock('../../firebaseClient', () => ({
  db: {},
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  startAfter: jest.fn(),
  getDocs: jest.fn(),
}));

const { getDocs } = require('../../firebaseClient');

function page(docs) {
  return {
    docs: docs.map((d) => ({
      id: d.id,
      data: () => d,
    })),
    length: docs.length,
  };
}

describe('fetchAllActiveOrders', () => {
  beforeEach(() => {
    clearActiveOrdersCache();
    jest.clearAllMocks();
  });

  it('paginates until fewer than page size (55 open bills)', async () => {
    const batch1 = Array.from({ length: 50 }, (_, i) => ({ id: `o${i}`, status: 'unpaid', timestamp: { toDate: () => new Date() } }));
    const batch2 = Array.from({ length: 5 }, (_, i) => ({ id: `o${50 + i}`, status: 'partial', timestamp: { toDate: () => new Date() } }));
    getDocs
      .mockResolvedValueOnce(page(batch1))
      .mockResolvedValueOnce(page(batch2));

    const result = await fetchAllActiveOrders('u1', { pageSize: 50, force: true });
    expect(result.complete).toBe(true);
    expect(result.orders).toHaveLength(55);
    expect(getDocs).toHaveBeenCalledTimes(2);
  });
});