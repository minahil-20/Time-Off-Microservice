import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Balance } from '../time-off/entities/balance.entity';
import { BatchSyncDto, BalanceItemDto } from './dto/batch-sync.dto';

export interface SyncResult {
  upserted: number;
  durationMs: number;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectRepository(Balance)
    private readonly balanceRepo: Repository<Balance>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Overwrites local SQLite balances with the HCM payload.
   *
   * Strategy: upsert on (employeeId, locationId) unique index so that:
   *  - New employees get inserted.
   *  - Existing rows are updated (HCM is source of truth).
   *
   * Everything runs in a single transaction for atomicity.
   */
  async batchSync(dto: BatchSyncDto): Promise<SyncResult> {
    const start = Date.now();
    const { balances } = dto;

    this.logger.log(`Starting batch sync for ${balances.length} balance(s).`);

    await this.dataSource.transaction(async (manager) => {
      for (const item of balances) {
        const existing = await manager.findOne(Balance, {
          where: { employeeId: item.employeeId, locationId: item.locationId },
        });

        if (existing) {
          existing.remainingDays = item.remainingDays;
          await manager.save(existing);
        } else {
          const newBalance = manager.create(Balance, {
            employeeId: item.employeeId,
            locationId: item.locationId,
            remainingDays: item.remainingDays,
          });
          await manager.save(newBalance);
        }
      }
    });

    const durationMs = Date.now() - start;
    this.logger.log(
      `Batch sync complete. Upserted ${balances.length} records in ${durationMs}ms.`,
    );

    return { upserted: balances.length, durationMs };
  }

  async getAllBalances(): Promise<Balance[]> {
    return this.balanceRepo.find();
  }
}
