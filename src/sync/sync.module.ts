import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Balance } from "../time-off/entities/balance.entity";
import { SyncController } from "./sync.controller";
import { SyncService } from "./sync.service";

@Module({
  imports: [TypeOrmModule.forFeature([Balance])],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
