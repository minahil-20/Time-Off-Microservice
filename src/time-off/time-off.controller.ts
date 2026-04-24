import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from "@nestjs/common";
import { TimeOffService } from "./time-off.service";
import { CreateTimeOffDto } from "./dto/create-time-off.dto";

@Controller("time-off")
export class TimeOffController {
  constructor(private readonly timeOffService: TimeOffService) {}

  /**
   * POST /time-off
   * Checks balance → saves PENDING → calls HCM → returns final status.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateTimeOffDto) {
    const request = await this.timeOffService.createRequest(dto);
    return {
      data: request,
      message: `Time-off request is ${request.status}.`,
    };
  }

  /** GET /time-off — list all requests */
  @Get()
  async findAll() {
    const requests = await this.timeOffService.findAll();
    return { data: requests, total: requests.length };
  }

  /** GET /time-off/:id — single request */
  @Get(":id")
  async findOne(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.timeOffService.findOne(id) };
  }
}
