import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { BatchOperationDto, BatchAction } from './dto/batch-operation.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { User } from '../users/entities/user.entity';
import { PaginatedResponse } from '../../common/interfaces/paginated-response.interface';
import { CacheService } from '../../common/cache/cache.service';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    private cacheService: CacheService,
    private dataSource: DataSource,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    const userExists = await this.usersRepository.findOne({
      where: { id: createTaskDto.userId },
    });

    if (!userExists) {
      throw new BadRequestException(`User with ID ${createTaskDto.userId} not found`);
    }

    const task = this.tasksRepository.create(createTaskDto);
    const savedTask = await this.tasksRepository.save(task);

    await this.taskQueue.add('task-status-update', {
      taskId: savedTask.id,
      status: savedTask.status,
    });

    // Invalidate cache for this user
    await this.cacheService.invalidateUserCache(createTaskDto.userId);

    return savedTask;
  }

  async findAll(filterDto?: TaskFilterDto): Promise<PaginatedResponse<Task>> {
    const { page = 1, limit = 10, status, priority } = filterDto || {};

    // Generate cache key based on filters
    const cacheKey = this.cacheService.generateCacheKey('tasks:list', {
      page,
      limit,
      status: status || 'all',
      priority: priority || 'all',
    });

    // Try to get from cache
    const cached = await this.cacheService.get<PaginatedResponse<Task>>(cacheKey);
    if (cached) {
      return cached;
    }

    // Build query with QueryBuilder for efficient database-level pagination
    const queryBuilder = this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user');

    // Apply filters
    if (status) {
      queryBuilder.andWhere('task.status = :status', { status });
    }

    if (priority) {
      queryBuilder.andWhere('task.priority = :priority', { priority });
    }

    // Apply pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Execute query with count
    const [data, total] = await queryBuilder.getManyAndCount();

    const result = {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    // Cache the result for 5 minutes
    await this.cacheService.set(cacheKey, result, 300);

    return result;
  }

  async findOne(id: string): Promise<Task> {
    // Try cache first
    const cacheKey = `tasks:${id}`;
    const cached = await this.cacheService.get<Task>(cacheKey);
    if (cached) {
      return cached;
    }

    const task = await this.tasksRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // Cache for 10 minutes
    await this.cacheService.set(cacheKey, task, 600);

    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOne(id);

    const originalStatus = task.status;

    if (updateTaskDto.title) task.title = updateTaskDto.title;
    if (updateTaskDto.description) task.description = updateTaskDto.description;
    if (updateTaskDto.status) task.status = updateTaskDto.status;
    if (updateTaskDto.priority) task.priority = updateTaskDto.priority;
    if (updateTaskDto.dueDate) task.dueDate = updateTaskDto.dueDate;

    const updatedTask = await this.tasksRepository.save(task);

    if (originalStatus !== updatedTask.status) {
      await this.taskQueue.add('task-status-update', {
        taskId: updatedTask.id,
        status: updatedTask.status,
      });
    }

    // Invalidate cache
    await this.cacheService.invalidateTaskCache(id, task.userId);

    return updatedTask;
  }

  async remove(id: string): Promise<void> {
    const task = await this.findOne(id);
    await this.tasksRepository.remove(task);

    // Invalidate cache
    await this.cacheService.invalidateTaskCache(id, task.userId);
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    // Inefficient implementation: doesn't use proper repository patterns
    const query = 'SELECT * FROM tasks WHERE status = $1';
    return this.tasksRepository.query(query, [status]);
  }

  async updateStatus(id: string, status: string): Promise<Task> {
    // This method will be called by the task processor
    const task = await this.findOne(id);
    task.status = status as any;
    return this.tasksRepository.save(task);
  }

  async getStats() {
    // Try cache first
    const cacheKey = 'tasks:stats';
    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    // Efficient implementation: Single SQL query with GROUP BY aggregation
    const statusStats = await this.tasksRepository
      .createQueryBuilder('task')
      .select('task.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('task.status')
      .getRawMany();

    const priorityStats = await this.tasksRepository
      .createQueryBuilder('task')
      .select('task.priority', 'priority')
      .addSelect('COUNT(*)', 'count')
      .groupBy('task.priority')
      .getRawMany();

    const total = await this.tasksRepository.count();

    const stats = {
      total,
      completed: 0,
      inProgress: 0,
      pending: 0,
      highPriority: 0,
    };

    statusStats.forEach((stat) => {
      const count = parseInt(stat.count, 10);
      if (stat.status === TaskStatus.COMPLETED) {
        stats.completed = count;
      } else if (stat.status === TaskStatus.IN_PROGRESS) {
        stats.inProgress = count;
      } else if (stat.status === TaskStatus.PENDING) {
        stats.pending = count;
      }
    });

    priorityStats.forEach((stat) => {
      const count = parseInt(stat.count, 10);
      if (stat.priority === 'HIGH') {
        stats.highPriority = count;
      }
    });

    // Cache for 2 minutes
    await this.cacheService.set(cacheKey, stats, 120);

    return stats;
  }

  async batchProcess(batchOperationDto: BatchOperationDto) {
    const { tasks: taskIds, action } = batchOperationDto;

    // Use transaction for atomicity
    return await this.dataSource.transaction(async (manager) => {
      const results = [];
      const userIds = new Set<string>();

      for (const taskId of taskIds) {
        try {
          let result;

          if (action === BatchAction.COMPLETE) {
            const task = await manager.findOne(Task, {
              where: { id: taskId },
              relations: ['user'],
            });

            if (!task) {
              throw new NotFoundException(`Task with ID ${taskId} not found`);
            }

            task.status = TaskStatus.COMPLETED;
            result = await manager.save(task);
            userIds.add(task.userId);

            await this.taskQueue.add('task-status-update', {
              taskId: task.id,
              status: task.status,
            });
          } else if (action === BatchAction.DELETE) {
            const task = await manager.findOne(Task, {
              where: { id: taskId },
            });

            if (!task) {
              throw new NotFoundException(`Task with ID ${taskId} not found`);
            }

            userIds.add(task.userId);
            await manager.remove(task);
            result = { id: taskId, deleted: true };
          }

          results.push({
            taskId,
            success: true,
            result,
          });
        } catch (error) {
          results.push({
            taskId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Invalidate cache for all affected users
      for (const userId of userIds) {
        await this.cacheService.invalidateUserCache(userId);
      }

      return {
        processed: taskIds.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
      };
    });
  }
}
