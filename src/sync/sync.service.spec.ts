import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SyncService } from './sync.service';
import { Balance } from '../time-off/entities/balance.entity';

const mockBalanceRepo = () => ({
  find: jest.fn(),
});

const mockEntityManager = {
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
};

const mockDataSource = {
  transaction: jest.fn((cb) => cb(mockEntityManager)),
};

describe('SyncService', () => {
  let service: SyncService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: getRepositoryToken(Balance), useFactory: mockBalanceRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('batchSync', () => {
    it('should insert new balance if not existing', async () => {
      mockEntityManager.findOne.mockResolvedValue(null);

      const dto = {
        balances: [
          { employeeId: 'emp-1', locationId: 'loc-1', remainingDays: 5 },
        ],
      };

      const result = await service.batchSync(dto);

      expect(mockEntityManager.create).toHaveBeenCalled();
      expect(mockEntityManager.save).toHaveBeenCalledTimes(1);
      expect(result.upserted).toBe(1);
    });

    it('should update existing balance', async () => {
      const existing = {
        employeeId: 'emp-1',
        locationId: 'loc-1',
        remainingDays: 2,
      };

      mockEntityManager.findOne.mockResolvedValue(existing);

      const dto = {
        balances: [
          { employeeId: 'emp-1', locationId: 'loc-1', remainingDays: 10 },
        ],
      };

      await service.batchSync(dto);

      expect(existing.remainingDays).toBe(10);
      expect(mockEntityManager.save).toHaveBeenCalledWith(existing);
    });

    it('should process multiple balances correctly', async () => {
      mockEntityManager.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          employeeId: 'emp-2',
          locationId: 'loc-2',
          remainingDays: 1,
        });

      const dto = {
        balances: [
          { employeeId: 'emp-1', locationId: 'loc-1', remainingDays: 5 },
          { employeeId: 'emp-2', locationId: 'loc-2', remainingDays: 8 },
        ],
      };

      const result = await service.batchSync(dto);

      expect(result.upserted).toBe(2);
      expect(mockEntityManager.save).toHaveBeenCalledTimes(2);
    });

    it('should run inside a transaction', async () => {
      const spy = jest.spyOn(mockDataSource, 'transaction');

      await service.batchSync({ balances: [] });

      expect(spy).toHaveBeenCalled();
    });

    it('should return zero for empty input', async () => {
      const result = await service.batchSync({ balances: [] });

      expect(result.upserted).toBe(0);
    });
  });

  describe('getAllBalances', () => {
    it('should return all balances', async () => {
      const mockData = [{ employeeId: 'emp-1' }];
      service['balanceRepo'].find = jest.fn().mockResolvedValue(mockData);

      const result = await service.getAllBalances();

      expect(result).toEqual(mockData);
    });
  });
});
