import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  UpdateDateColumn,
} from "typeorm";

@Entity("balances")
@Index(["employeeId", "locationId"], { unique: true })
export class Balance {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "employee_id" })
  employeeId: string;

  @Column({ name: "location_id" })
  locationId: string;

  /** Remaining approved days for this employee at this location */
  @Column({ name: "remaining_days", type: "float" })
  remainingDays: number;

  /** Timestamp of last HCM sync — useful for audit */
  @UpdateDateColumn({ name: "last_synced_at" })
  lastSyncedAt: Date;
}
