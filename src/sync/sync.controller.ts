import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { SyncService } from "./sync.service";
import { BatchSyncDto } from "./dto/batch-sync.dto";

@Controller("sync")
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /**
   * POST /sync/batch
   * Accepts an array of balance records from the HCM system and
   * overwrites local SQLite state (the canonical "source of truth" sync).
   *
   * Example body:
   * {
   *   "balances": [
   *     { "employeeId": "emp-001", "locationId": "loc-nyc", "remainingDays": 15 }
   *   ]
   * }
   */
  @Post("batch")
  @HttpCode(HttpStatus.OK)
  async batchSync(@Body() dto: BatchSyncDto) {
    const result = await this.syncService.batchSync(dto);
    return {
      message: `Sync complete. ${result.upserted} balance(s) updated in ${result.durationMs}ms.`,
      data: result,
    };
  }

  /** GET /sync/balances — inspect current local balances */
  @Get("balances")
  async getBalances() {
    const balances = await this.syncService.getAllBalances();
    return { data: balances, total: balances.length };
  }
}
