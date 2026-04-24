import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TimeOffModule } from "./time-off/time-off.module";
import { SyncModule } from "./sync/sync.module";
import { HcmMockModule } from "./hcm-mock/hcm-mock.module";
import { TimeOffRequest } from "./time-off/entities/time-off-request.entity";
import { Balance } from "./time-off/entities/balance.entity";

@Module({
  imports: [
    // SQLite database — file-based, zero config
    TypeOrmModule.forRoot({
      type: "sqlite",
      database: "time_off.sqlite",
      entities: [TimeOffRequest, Balance],
      synchronize: true, // auto-creates tables; disable in production
      logging: process.env.NODE_ENV === "development",
    }),
    TimeOffModule,
    SyncModule,
    HcmMockModule,
  ],
})
export class AppModule {}
