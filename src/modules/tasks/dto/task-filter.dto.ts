import { IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class TaskFilterDto extends PaginationDto {
  @ApiProperty({
    enum: TaskStatus,
    required: false,
    description: 'Filter by task status',
  })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiProperty({
    enum: TaskPriority,
    required: false,
    description: 'Filter by task priority',
  })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
}