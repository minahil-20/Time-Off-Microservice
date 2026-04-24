import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

export enum TimeOffStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

@Entity("time_off_requests")
export class TimeOffRequest {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "employee_id" })
  employeeId: string;

  @Column({ name: "location_id" })
  locationId: string;

  @Column({
    type: "varchar",
    default: TimeOffStatus.PENDING,
  })
  status: TimeOffStatus;

  /** Duration in business days */
  @Column({ type: "float" })
  duration: number;

  /** Optional rejection / approval reason echoed from HCM */
  @Column({ name: "hcm_reason", nullable: true, type: "varchar" })
  hcmReason: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
