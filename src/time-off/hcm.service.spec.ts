import { Test, TestingModule } from '@nestjs/testing';
import { HcmService } from './hcm.service';
import { Logger } from '@nestjs/common'; 

describe('HcmService', () => {
  let service: HcmService;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {}); // suppress error logs

    const module: TestingModule = await Test.createTestingModule({
      providers: [HcmService],
    }).compile();

    service = module.get<HcmService>(HcmService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('requestApproval', () => {
    const payload = {
      requestId: 'req-1',
      employeeId: 'emp-1',
      locationId: 'loc-1',
      duration: 2,
    };

    it('should return approved response when HCM responds OK', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          approved: true,
          reason: 'Approved by policy',
        }),
      } as any);

      const result = await service.requestApproval(payload);

      expect(fetch).toHaveBeenCalled();
      expect(result.approved).toBe(true);
      expect(result.reason).toBe('Approved by policy');
    });

    it('should throw error when HCM responds with non-OK status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as any);

      await expect(service.requestApproval(payload)).rejects.toThrow(
        'HCM responded with HTTP 500',
      );
    });

    it('should throw error when fetch fails (network/timeout)', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(service.requestApproval(payload)).rejects.toThrow(
        'Network error',
      );
    });
  });
});
