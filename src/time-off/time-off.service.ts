import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import {
  TimeOffRequest,
  TimeOffStatus,
} from "./entities/time-off-request.entity";
import { Balance } from "./entities/balance.entity";
import { CreateTimeOffDto } from "./dto/create-time-off.dto";
import { HcmService } from "./hcm.service";

@Injectable()
export class TimeOffService {
  private readonly logger = new Logger(TimeOffService.name);

  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly requestRepo: Repository<TimeOffRequest>,
    @InjectRepository(Balance)
    private readonly balanceRepo: Repository<Balance>,
    private readonly hcmService: HcmService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Full lifecycle for a single time-off request:
   * 1. Verify balance exists and is sufficient.
   * 2. Persist as PENDING inside a DB transaction.
   * 3. Call external HCM for approval.
   * 4. Update status (APPROVED | REJECTED) and persist.
   * 5. On APPROVED, deduct balance.
   */
  async createRequest(dto: CreateTimeOffDto): Promise<TimeOffRequest> {
    const { employeeId, locationId, duration } = dto;

    // ── Step 1: Balance check (outside transaction — read-only) ─────────────
    const balance = await this.balanceRepo.findOne({
      where: { employeeId, locationId },
    });

    if (!balance) {
      throw new NotFoundException(
        `No balance record found for employee=${employeeId} location=${locationId}. ` +
          `Run POST /sync/batch to seed balances from HCM.`,
      );
    }

    if (balance.remainingDays < duration) {
      throw new UnprocessableEntityException(
        `Insufficient balance: requested ${duration} days but only ${balance.remainingDays} remaining.`,
      );
    }

    // ── Step 2: Persist PENDING request (in transaction) ────────────────────
    const savedRequest = await this.dataSource.transaction(async (manager) => {
      const request = manager.create(TimeOffRequest, {
        employeeId,
        locationId,
        duration,
        status: TimeOffStatus.PENDING,
      });
      return manager.save(request);
    });

    this.logger.log(`Saved PENDING request id=${savedRequest.id}`);

    // ── Step 3 + 4: Call HCM and update status ───────────────────────────────
    let finalStatus: TimeOffStatus;
    let hcmReason: string;

    try {
      const hcmResponse = await this.hcmService.requestApproval({
        requestId: savedRequest.id,
        employeeId,
        locationId,
        duration,
      });

      finalStatus = hcmResponse.approved
        ? TimeOffStatus.APPROVED
        : TimeOffStatus.REJECTED;
      hcmReason = hcmResponse.reason;
    } catch (err) {
      // HCM is unreachable — leave as PENDING so a retry job can pick it up
      this.logger.warn(
        `HCM unavailable for request ${savedRequest.id}. Leaving as PENDING. Error: ${err.message}`,
      );
      return savedRequest;
    }

    // ── Step 5: Persist final status + conditionally deduct balance ──────────
    await this.dataSource.transaction(async (manager) => {
      await manager.update(TimeOffRequest, savedRequest.id, {
        status: finalStatus,
        hcmReason,
      });

      if (finalStatus === TimeOffStatus.APPROVED) {
        // Atomic decrement — safe against concurrent requests
        await manager
          .createQueryBuilder()
          .update(Balance)
          .set({ remainingDays: () => `remaining_days - ${duration}` })
          .where("employee_id = :employeeId AND location_id = :locationId", {
            employeeId,
            locationId,
          })
          .execute();

        this.logger.log(
          `Balance deducted ${duration}d for employee=${employeeId}`,
        );
      }
    });

    savedRequest.status = finalStatus;
    savedRequest.hcmReason = hcmReason;
    return savedRequest;
  }

  async findAll(): Promise<TimeOffRequest[]> {
    return this.requestRepo.find({ order: { createdAt: "DESC" } });
  }

  async findOne(id: string): Promise<TimeOffRequest> {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException(`Request ${id} not found.`);
    return request;
  }
}
