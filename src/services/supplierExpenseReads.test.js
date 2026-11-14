import {
  previewSupplierReconciliation,
  applySupplierBalanceCorrection,
} from './supplierExpenseReads';

jest.mock('../firebaseClient', () => ({
  db: {},
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  startAfter: jest.fn(),
  getDocs: jest.fn(),
  getDoc: jest.fn(),
  doc: jest.fn(() => ({ path: 'sup' })),
  updateDoc: jest.fn(),
  serverTimestamp: jest.fn(),
  cachedGetDocs: jest.fn(),
}));

const { getDoc, getDocs, updateDoc } = require('../firebaseClient');

describe('previewSupplierReconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns VERIFIED preview without writing', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      id: 's1',
      data: () => ({ balance: 10, name: 'T' }),
    });
    getDocs.mockResolvedValue({
      docs: [{ id: 'e1', data: () => ({ supplierId: 's1', amount: 10, section: 'purchase' }) }],
      length: 1,
    });

    const row = await previewSupplierReconciliation('u1', 's1');
    expect(row.state).toBe('VERIFIED');
    expect(row.ledgerComplete).toBe(true);
    expect(updateDoc).not.toHaveBeenCalled();
  });
});

describe('applySupplierBalanceCorrection', () => {
  it('writes only after explicit apply', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      id: 's1',
      data: () => ({ balance: 5, name: 'T' }),
    });
    getDocs.mockResolvedValue({ docs: [], length: 0 });
    updateDoc.mockResolvedValue(undefined);

    await applySupplierBalanceCorrection('u1', 's1', { balance: 0, actorLabel: 'admin', reason: 'test' });
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc.mock.calls[0][1]).toMatchObject({
      balance: 0,
      balanceCorrectionReason: 'test',
    });
  });
});