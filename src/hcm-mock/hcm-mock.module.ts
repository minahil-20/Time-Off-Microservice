import { Module } from "@nestjs/common";
import { HcmMockController } from "./hcm-mock.controller";

@Module({
  controllers: [HcmMockController],
})
export class HcmMockModule {}
