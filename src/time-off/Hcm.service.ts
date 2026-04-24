import { Injectable, Logger } from "@nestjs/common";

export interface HcmApprovalRequest {
  requestId: string;
  employeeId: string;
  locationId: string;
  duration: number;
}

export interface HcmApprovalResponse {
  approved: boolean;
  reason: string;
}

/**
 * HcmService is the internal adapter that speaks to the external HCM system.
 * In production, replace the fetch() call with a proper HTTP client
 * (e.g. NestJS HttpModule / Axios) pointing at the real HCM base URL.
 *
 * For local development the mock controller at /mock-hcm/approve handles requests.
 */
@Injectable()
export class HcmService {
  private readonly logger = new Logger(HcmService.name);
  private readonly hcmBaseUrl =
    process.env.HCM_BASE_URL ?? "http://localhost:3000/mock-hcm";

  async requestApproval(
    payload: HcmApprovalRequest,
  ): Promise<HcmApprovalResponse> {
    this.logger.log(
      `Calling HCM for requestId=${payload.requestId} employee=${payload.employeeId}`,
    );

    try {
      const response = await fetch(`${this.hcmBaseUrl}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5_000), // 5-second hard timeout
      });

      if (!response.ok) {
        throw new Error(`HCM responded with HTTP ${response.status}`);
      }

      const data: HcmApprovalResponse = await response.json();
      this.logger.log(
        `HCM decision for ${payload.requestId}: approved=${data.approved} reason="${data.reason}"`,
      );
      return data;
    } catch (err) {
      this.logger.error(`HCM call failed: ${err.message}`);
      // Surface the error so the controller can handle it gracefully
      throw err;
    }
  }
}
