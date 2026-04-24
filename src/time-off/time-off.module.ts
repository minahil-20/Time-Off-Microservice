import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TimeOffRequest } from "./entities/time-off-request.entity";
import { Balance } from "./entities/balance.entity";
import { TimeOffController } from "./time-off.controller";
import { TimeOffService } from "./time-off.service";
import { HcmService } from "./hcm.service";

@Module({
  imports: [TypeOrmModule.forFeature([TimeOffRequest, Balance])],
  controllers: [TimeOffController],
  providers: [TimeOffService, HcmService],
  // Export Balance repository access so SyncModule can reuse it
  exports: [TypeOrmModule],
})
export class TimeOffModule {}
