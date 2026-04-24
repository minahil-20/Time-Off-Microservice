import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";

interface ApprovalPayload {
  requestId: string;
  employeeId: string;
  locationId: string;
  duration: number;
}

/**
 * MockHcmController — simulates an external HCM approval API.
 *
 * Behaviour (configurable via env vars):
 *  - HCM_ERROR_RATE   (0–1, default 0.15): probability of returning HTTP 503
 *  - HCM_REJECT_RATE  (0–1, default 0.20): probability of rejecting an otherwise valid request
 *  - HCM_MIN_LATENCY  (ms, default 100):   simulated network latency floor
 *  - HCM_MAX_LATENCY  (ms, default 400):   simulated network latency ceiling
 */
@Controller("mock-hcm")
export class HcmMockController {
  private readonly logger = new Logger(HcmMockController.name);

  private readonly errorRate = parseFloat(process.env.HCM_ERROR_RATE ?? "0.15");
  private readonly rejectRate = parseFloat(
    process.env.HCM_REJECT_RATE ?? "0.20",
  );
  private readonly minLatency = parseInt(
    process.env.HCM_MIN_LATENCY ?? "100",
    10,
  );
  private readonly maxLatency = parseInt(
    process.env.HCM_MAX_LATENCY ?? "400",
    10,
  );

  @Post("approve")
  async approve(@Body() payload: ApprovalPayload) {
    // Simulate network latency
    await this.simulateLatency();

    this.logger.debug(
      `[MockHCM] Received request id=${payload.requestId} duration=${payload.duration}d`,
    );

    // ── Simulate intermittent 503 errors ────────────────────────────────────
    if (Math.random() < this.errorRate) {
      this.logger.warn(
        `[MockHCM] Simulating 503 for request ${payload.requestId}`,
      );
      throw new HttpException(
        { message: "HCM service temporarily unavailable (simulated)." },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // ── Simulate policy-based rejections ────────────────────────────────────
    if (Math.random() < this.rejectRate) {
      const reason = this.pickRejectionReason(payload);
      this.logger.log(`[MockHCM] Rejecting ${payload.requestId}: ${reason}`);
      return { approved: false, reason };
    }

    // ── Happy path: approve ─────────────────────────────────────────────────
    this.logger.log(`[MockHCM] Approving ${payload.requestId}`);
    return {
      approved: true,
      reason: "Approved by line manager via HCM workflow.",
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async simulateLatency(): Promise<void> {
    const ms =
      this.minLatency +
      Math.floor(Math.random() * (this.maxLatency - this.minLatency));
    await new Promise((r) => setTimeout(r, ms));
  }

  private pickRejectionReason(payload: ApprovalPayload): string {
    const reasons = [
      `Request exceeds the maximum consecutive days policy for location ${payload.locationId}.`,
      `Employee ${payload.employeeId} has a pending conflicting request.`,
      `Team coverage threshold would be breached during the requested period.`,
      `Manager approval not obtained within SLA window.`,
    ];
    return reasons[Math.floor(Math.random() * reasons.length)];
  }
}
