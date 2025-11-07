import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.debug('Checking for overdue tasks...');

    const now = new Date();
    const overdueTasks = await this.tasksRepository.find({
      where: {
        dueDate: LessThan(now),
        status: TaskStatus.PENDING,
      },
    });
    
    this.logger.log(`Found ${overdueTasks.length} overdue tasks`);

    if (overdueTasks.length === 0) {
      this.logger.debug('No overdue tasks found');
      return;
    }

    let successCount = 0;
    let failureCount = 0;

    for (const task of overdueTasks) {
      try {
        await this.taskQueue.add(
          'overdue-tasks-notification',
          {
            taskId: task.id,
            userId: task.userId,
            title: task.title,
            dueDate: task.dueDate,
          },
          {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
            removeOnComplete: {
              age: 3600,
            },
            removeOnFail: {
              age: 86400,
            },
          },
        );
        successCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to queue task ${task.id}: ${errorMessage}`);
        failureCount++;
      }
    }

    this.logger.log(
      `Queued ${successCount} overdue tasks successfully, ${failureCount} failed`,
    );
  }
} 