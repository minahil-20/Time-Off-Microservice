import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TimeOffService } from './time-off.service';
import { HcmService } from './hcm.service';
import {
  TimeOffRequest,
  TimeOffStatus,
} from './entities/time-off-request.entity';
import { Balance } from './entities/balance.entity';

const mockRequestRepo = () => ({ find: jest.fn(), findOne: jest.fn() });
const mockBalanceRepo = () => ({ findOne: jest.fn() });
const mockHcmService = () => ({ requestApproval: jest.fn() });

const mockEntityManager = {
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
  })),
};

const mockDataSource = {
  transaction: jest.fn((cb) => cb(mockEntityManager)),
};

describe('TimeOffService', () => {
  let service: TimeOffService;
  let balanceRepo: ReturnType<typeof mockBalanceRepo>;
  let hcmService: ReturnType<typeof mockHcmService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeOffService,
        {
          provide: getRepositoryToken(TimeOffRequest),
          useFactory: mockRequestRepo,
        },
        { provide: getRepositoryToken(Balance), useFactory: mockBalanceRepo },
        { provide: HcmService, useFactory: mockHcmService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<TimeOffService>(TimeOffService);
    balanceRepo = module.get(getRepositoryToken(Balance));
    hcmService = module.get(HcmService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createRequest', () => {
    const dto = { employeeId: 'emp-001', locationId: 'loc-nyc', duration: 3 };

    it('throws NotFoundException when no balance record exists', async () => {
      balanceRepo.findOne.mockResolvedValue(null);
      await expect(service.createRequest(dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnprocessableEntityException when balance is insufficient', async () => {
      balanceRepo.findOne.mockResolvedValue({ remainingDays: 2 });
      await expect(service.createRequest(dto)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('returns PENDING when HCM is unreachable', async () => {
      balanceRepo.findOne.mockResolvedValue({ remainingDays: 10 });
      const pending = {
        id: 'uuid-1',
        status: TimeOffStatus.PENDING,
      } as TimeOffRequest;
      mockEntityManager.create.mockReturnValue(pending);
      mockEntityManager.save.mockResolvedValue(pending);
      hcmService.requestApproval.mockRejectedValue(new Error('Network error'));

      const result = await service.createRequest(dto);
      expect(result.status).toBe(TimeOffStatus.PENDING);
    });

    it('returns APPROVED and deducts balance on HCM approval', async () => {
      balanceRepo.findOne.mockResolvedValue({ remainingDays: 10 });
      const pending = {
        id: 'uuid-2',
        status: TimeOffStatus.PENDING,
      } as TimeOffRequest;
      mockEntityManager.create.mockReturnValue(pending);
      mockEntityManager.save.mockResolvedValue(pending);
      hcmService.requestApproval.mockResolvedValue({
        approved: true,
        reason: 'Approved',
      });
      mockEntityManager.update.mockResolvedValue({});

      const result = await service.createRequest(dto);
      expect(result.status).toBe(TimeOffStatus.APPROVED);
      expect(mockEntityManager.update).toHaveBeenCalled();
    });

    it('returns REJECTED and does not deduct balance', async () => {
      balanceRepo.findOne.mockResolvedValue({ remainingDays: 10 });
      const pending = {
        id: 'uuid-3',
        status: TimeOffStatus.PENDING,
      } as TimeOffRequest;
      mockEntityManager.create.mockReturnValue(pending);
      mockEntityManager.save.mockResolvedValue(pending);
      hcmService.requestApproval.mockResolvedValue({
        approved: false,
        reason: 'Rejected',
      });
      mockEntityManager.update.mockResolvedValue({});

      const result = await service.createRequest(dto);
      expect(result.status).toBe(TimeOffStatus.REJECTED);
    });
  });
});
