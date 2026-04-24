import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SyncService } from './sync.service';
import { Balance } from '../time-off/entities/balance.entity';

const mockBalanceRepo = () => ({ find: jest.fn() });

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

  it('upserts all provided balances in a single transaction', async () => {
    // Mock findOne to simulate existing record
    mockEntityManager.findOne.mockResolvedValue({
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      remainingDays: 10,
    });
    mockEntityManager.save.mockResolvedValue({});

    const dto = {
      balances: [
        { employeeId: 'emp-001', locationId: 'loc-nyc', remainingDays: 15 },
        { employeeId: 'emp-002', locationId: 'loc-lon', remainingDays: 10 },
      ],
    };

    const result = await service.batchSync(dto);
    expect(result.upserted).toBe(2);
    expect(mockEntityManager.save).toHaveBeenCalledTimes(2);
  });

  it('returns zero upserted for an empty array', async () => {
    const result = await service.batchSync({ balances: [] });
    expect(result.upserted).toBe(0);
  });
});
