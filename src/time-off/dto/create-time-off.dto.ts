import { IsString, IsNumber, IsPositive, IsNotEmpty } from "class-validator";

export class CreateTimeOffDto {
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsString()
  @IsNotEmpty()
  locationId: string;

  /** Duration in business days (e.g. 0.5 for a half day, 5 for a full week) */
  @IsNumber()
  @IsPositive()
  duration: number;
}
