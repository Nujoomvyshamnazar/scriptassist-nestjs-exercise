import { IsArray, IsEnum, IsNotEmpty, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum BatchAction {
  COMPLETE = 'COMPLETE',
  DELETE = 'DELETE',
}

export class BatchOperationDto {
  @ApiProperty({
    description: 'Array of task IDs to process',
    example: ['uuid1', 'uuid2', 'uuid3'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsNotEmpty({ each: true })
  tasks: string[];

  @ApiProperty({
    description: 'Action to perform on the tasks',
    enum: BatchAction,
    example: BatchAction.COMPLETE,
  })
  @IsEnum(BatchAction)
  action: BatchAction;
}

