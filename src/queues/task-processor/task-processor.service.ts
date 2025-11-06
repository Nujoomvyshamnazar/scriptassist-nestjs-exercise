import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';

@Injectable()
@Processor('task-processing')
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);

  constructor(private readonly tasksService: TasksService) {
    super();
  }

  async process(job: Job): Promise<any> {
    const attemptInfo = `(attempt ${job.attemptsMade + 1}/${job.opts.attempts || 1})`;
    this.logger.debug(`Processing job ${job.id} of type ${job.name} ${attemptInfo}`);

    try {
      let result;

      switch (job.name) {
        case 'task-status-update':
          result = await this.handleStatusUpdate(job);
          break;
        case 'overdue-tasks-notification':
          result = await this.handleOverdueTasks(job);
          break;
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          return { success: false, error: 'Unknown job type' };
      }

      this.logger.log(`Successfully processed job ${job.id} ${attemptInfo}`);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error processing job ${job.id} ${attemptInfo}: ${errorMessage}`);

      // Check if we should retry
      const attemptsLeft = (job.opts.attempts || 1) - (job.attemptsMade + 1);
      if (attemptsLeft > 0) {
        this.logger.warn(`Job ${job.id} will be retried. Attempts left: ${attemptsLeft}`);
      } else {
        this.logger.error(`Job ${job.id} failed after all retry attempts`);
      }

      throw error; // Re-throw to trigger retry mechanism
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed permanently: ${error.message}`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.debug(`Job ${job.id} is now active`);
  }

  private async handleStatusUpdate(job: Job) {
    const { taskId, status } = job.data;
    
    if (!taskId || !status) {
      return { success: false, error: 'Missing required data' };
    }
    
    // Inefficient: No validation of status values
    // No transaction handling
    // No retry mechanism
    const task = await this.tasksService.updateStatus(taskId, status);
    
    return { 
      success: true,
      taskId: task.id,
      newStatus: task.status
    };
  }

  private async handleOverdueTasks(job: Job) {
    // Inefficient implementation with no batching or chunking for large datasets
    this.logger.debug('Processing overdue tasks notification');
    
    // The implementation is deliberately basic and inefficient
    // It should be improved with proper batching and error handling
    return { success: true, message: 'Overdue tasks processed' };
  }
} 