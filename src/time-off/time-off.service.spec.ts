import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TimeOffService } from './time-off.service';
import {
  TimeOffRequest,
  TimeOffStatus,
} from './entities/time-off-request.entity';
import { Balance } from './entities/balance.entity';
import { DataSource } from 'typeorm';
import { HcmService } from './hcm.service';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
});

const mockHcmService = {
  requestApproval: jest.fn(),
};

const mockDataSource = {
  transaction: jest.fn(),
};

describe('TimeOffService', () => {
  let service: TimeOffService;
  let balanceRepo;
  let hcmService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeOffService,
        { provide: getRepositoryToken(TimeOffRequest), useFactory: mockRepo },
        { provide: getRepositoryToken(Balance), useFactory: mockRepo },
        { provide: HcmService, useValue: mockHcmService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<TimeOffService>(TimeOffService);
    balanceRepo = module.get(getRepositoryToken(Balance));
    hcmService = module.get(HcmService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createRequest', () => {
    const dto = {
      employeeId: 'emp-1',
      locationId: 'loc-1',
      duration: 3,
    };

    it('should execute balance deduction query when request is APPROVED', async () => {
      balanceRepo.findOne.mockResolvedValue({ remainingDays: 10 });

      const executeMock = jest.fn();

      const qbMock = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: executeMock,
      };

      mockDataSource.transaction
        // First transaction (save PENDING request)
        .mockImplementationOnce(async (cb) =>
          cb({
            create: jest.fn().mockReturnValue({ id: 'req-1' }),
            save: jest.fn().mockResolvedValue({ id: 'req-1' }),
          }),
        )
        // Second transaction (update + deduction)
        .mockImplementationOnce(async (cb) =>
          cb({
            update: jest.fn(),
            createQueryBuilder: () => qbMock,
          }),
        );

      hcmService.requestApproval.mockResolvedValue({
        approved: true,
        reason: 'OK',
      });

      await service.createRequest({
        employeeId: 'emp-1',
        locationId: 'loc-1',
        duration: 3,
      });

      expect(executeMock).toHaveBeenCalled();
    });

    it('should NOT execute balance deduction query when request is REJECTED', async () => {
      balanceRepo.findOne.mockResolvedValue({ remainingDays: 10 });

      const executeMock = jest.fn();

      const qbMock = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: executeMock,
      };

      mockDataSource.transaction.mockImplementation(async (cb) =>
        cb({
          create: jest.fn().mockReturnValue({ id: 'req-1' }),
          save: jest.fn().mockResolvedValue({ id: 'req-1' }),
          update: jest.fn(),
          createQueryBuilder: () => qbMock,
        }),
      );

      hcmService.requestApproval.mockResolvedValue({
        approved: false,
        reason: 'Rejected',
      });

      await service.createRequest({
        employeeId: 'emp-1',
        locationId: 'loc-1',
        duration: 3,
      });

      expect(executeMock).not.toHaveBeenCalled();
    });

    it('should handle multiple rapid requests without breaking transaction flow', async () => {
      balanceRepo.findOne.mockResolvedValue({ remainingDays: 10 });

      const executeMock = jest.fn();

      const qbMock = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: executeMock,
      };

      mockDataSource.transaction.mockImplementation(async (cb) =>
        cb({
          create: jest.fn().mockReturnValue({ id: Math.random().toString() }),
          save: jest.fn().mockImplementation((r) => Promise.resolve(r)),
          update: jest.fn(),
          createQueryBuilder: () => qbMock,
        }),
      );

      hcmService.requestApproval.mockResolvedValue({
        approved: true,
        reason: 'OK',
      });

      const dto = {
        employeeId: 'emp-1',
        locationId: 'loc-1',
        duration: 2,
      };

      // Simulate concurrent requests
      await Promise.all([
        service.createRequest(dto),
        service.createRequest(dto),
      ]);

      // Expect deduction executed twice (2 approvals)
      expect(executeMock).toHaveBeenCalledTimes(2);
    });

    it('should throw NotFoundException if balance not found', async () => {
      balanceRepo.findOne.mockResolvedValue(null);

      await expect(service.createRequest(dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if balance is insufficient', async () => {
      balanceRepo.findOne.mockResolvedValue({ remainingDays: 1 });

      await expect(service.createRequest(dto)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('should approve request and deduct balance', async () => {
      balanceRepo.findOne.mockResolvedValue({ remainingDays: 10 });

      const savedRequest = { id: 'req-1' };

      mockDataSource.transaction
        .mockImplementationOnce(async (cb) =>
          cb({
            create: jest.fn().mockReturnValue(savedRequest),
            save: jest.fn().mockResolvedValue(savedRequest),
          }),
        )
        .mockImplementationOnce(async (cb) =>
          cb({
            update: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue({
              update: jest.fn().mockReturnThis(),
              set: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn(),
            }),
          }),
        );

      hcmService.requestApproval.mockResolvedValue({
        approved: true,
        reason: 'OK',
      });

      const result = await service.createRequest(dto);

      expect(result.status).toBe(TimeOffStatus.APPROVED);
    });

    it('should mark request as REJECTED if HCM rejects', async () => {
      balanceRepo.findOne.mockResolvedValue({ remainingDays: 10 });

      mockDataSource.transaction.mockImplementation(async (cb) =>
        cb({
          create: jest.fn().mockReturnValue({ id: 'req-1' }),
          save: jest.fn().mockResolvedValue({ id: 'req-1' }),
          update: jest.fn(),
        }),
      );

      hcmService.requestApproval.mockResolvedValue({
        approved: false,
        reason: 'Rejected',
      });

      const result = await service.createRequest(dto);

      expect(result.status).toBe(TimeOffStatus.REJECTED);
    });

    it('should keep request PENDING if HCM fails', async () => {
      balanceRepo.findOne.mockResolvedValue({ remainingDays: 10 });

      mockDataSource.transaction.mockImplementation(async (cb) =>
        cb({
          create: jest
            .fn()
            .mockReturnValue({ id: 'req-1', status: TimeOffStatus.PENDING }),
          save: jest.fn().mockResolvedValue({
            id: 'req-1',
            status: TimeOffStatus.PENDING,
          }),
        }),
      );

      hcmService.requestApproval.mockRejectedValue(new Error('HCM down'));

      const result = await service.createRequest(dto);

      expect(result.status).toBe(TimeOffStatus.PENDING);
    });
  });

  describe('findOne', () => {
    it('should return request if found', async () => {
      const mockData = { id: 'req-1' };
      service['requestRepo'].findOne = jest.fn().mockResolvedValue(mockData);

      const result = await service.findOne('req-1');

      expect(result).toEqual(mockData);
    });

    it('should throw if request not found', async () => {
      service['requestRepo'].findOne = jest.fn().mockResolvedValue(null);

      await expect(service.findOne('req-1')).rejects.toThrow(NotFoundException);
    });
  });
});
