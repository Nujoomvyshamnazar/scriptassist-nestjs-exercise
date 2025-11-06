import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { Task } from './entities/task.entity';
import { User } from '../users/entities/user.entity';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('TasksService', () => {
  let service: TasksService;
  let tasksRepository: jest.Mocked<Repository<Task>>;
  let usersRepository: jest.Mocked<Repository<User>>;
  let taskQueue: jest.Mocked<Queue>;

  const mockTask: Task = {
    id: '1',
    title: 'Test Task',
    description: 'Test Description',
    status: TaskStatus.PENDING,
    priority: TaskPriority.MEDIUM,
    dueDate: new Date('2025-12-31'),
    userId: 'user1',
    user: undefined as any,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUser: User = {
    id: 'user1',
    email: 'test@example.com',
    name: 'Test User',
    password: 'hashedpassword',
    role: 'user',
    tasks: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: getRepositoryToken(Task),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            count: jest.fn(),
            remove: jest.fn(),
            query: jest.fn(),
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getQueueToken('task-processing'),
          useValue: {
            add: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    tasksRepository = module.get(getRepositoryToken(Task));
    usersRepository = module.get(getRepositoryToken(User));
    taskQueue = module.get(getQueueToken('task-processing'));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a task successfully', async () => {
      const createTaskDto = {
        title: 'Test Task',
        description: 'Test Description',
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date('2025-12-31'),
        userId: 'user1',
      };

      usersRepository.findOne.mockResolvedValue(mockUser);
      tasksRepository.create.mockReturnValue(mockTask);
      tasksRepository.save.mockResolvedValue(mockTask);
      taskQueue.add.mockResolvedValue({} as any);

      const result = await service.create(createTaskDto);

      expect(result).toEqual(mockTask);
      expect(usersRepository.findOne).toHaveBeenCalledWith({ where: { id: 'user1' } });
      expect(tasksRepository.create).toHaveBeenCalledWith(createTaskDto);
      expect(tasksRepository.save).toHaveBeenCalledWith(mockTask);
      expect(taskQueue.add).toHaveBeenCalled();
    });

    it('should throw BadRequestException if user does not exist', async () => {
      const createTaskDto = {
        title: 'Test Task',
        description: 'Test Description',
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date('2025-12-31'),
        userId: 'nonexistent',
      };

      usersRepository.findOne.mockResolvedValue(null);

      await expect(service.create(createTaskDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(createTaskDto)).rejects.toThrow('User with ID nonexistent not found');
    });
  });

  describe('findAll', () => {
    it('should return paginated tasks', async () => {
      const filterDto = { page: 1, limit: 10 };
      const tasks = [mockTask];

      mockQueryBuilder.getManyAndCount.mockResolvedValue([tasks, 1]);

      const result = await service.findAll(filterDto);

      expect(result).toEqual({
        data: tasks,
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      });
      expect(tasksRepository.createQueryBuilder).toHaveBeenCalledWith('task');
    });

    it('should filter by status', async () => {
      const filterDto = { page: 1, limit: 10, status: TaskStatus.COMPLETED };
      const tasks = [{ ...mockTask, status: TaskStatus.COMPLETED }];

      mockQueryBuilder.getManyAndCount.mockResolvedValue([tasks, 1]);

      await service.findAll(filterDto);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('task.status = :status', { status: TaskStatus.COMPLETED });
    });

    it('should filter by priority', async () => {
      const filterDto = { page: 1, limit: 10, priority: TaskPriority.HIGH };
      const tasks = [{ ...mockTask, priority: TaskPriority.HIGH }];

      mockQueryBuilder.getManyAndCount.mockResolvedValue([tasks, 1]);

      await service.findAll(filterDto);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('task.priority = :priority', { priority: TaskPriority.HIGH });
    });
  });

  describe('findOne', () => {
    it('should return a task by id', async () => {
      tasksRepository.count.mockResolvedValue(1);
      tasksRepository.findOne.mockResolvedValue(mockTask);

      const result = await service.findOne('1');

      expect(result).toEqual(mockTask);
      expect(tasksRepository.count).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(tasksRepository.findOne).toHaveBeenCalledWith({ where: { id: '1' }, relations: ['user'] });
    });

    it('should throw NotFoundException if task not found', async () => {
      tasksRepository.count.mockResolvedValue(0);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('nonexistent')).rejects.toThrow('Task with ID nonexistent not found');
    });
  });

  describe('update', () => {
    it('should update a task successfully', async () => {
      const updateTaskDto = { title: 'Updated Title' };
      const updatedTask = { ...mockTask, title: 'Updated Title' };

      tasksRepository.count.mockResolvedValue(1);
      tasksRepository.findOne.mockResolvedValue(mockTask);
      tasksRepository.save.mockResolvedValue(updatedTask);

      const result = await service.update('1', updateTaskDto);

      expect(result.title).toBe('Updated Title');
      expect(tasksRepository.save).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove a task successfully', async () => {
      tasksRepository.count.mockResolvedValue(1);
      tasksRepository.findOne.mockResolvedValue(mockTask);
      tasksRepository.remove.mockResolvedValue(mockTask);

      await service.remove('1');

      expect(tasksRepository.remove).toHaveBeenCalledWith(mockTask);
    });
  });

  describe('getStats', () => {
    it('should return task statistics', async () => {
      const statusStats = [
        { status: TaskStatus.COMPLETED, count: '5' },
        { status: TaskStatus.IN_PROGRESS, count: '3' },
        { status: TaskStatus.PENDING, count: '2' },
      ];
      const priorityStats = [
        { priority: 'HIGH', count: '4' },
      ];

      mockQueryBuilder.getRawMany.mockResolvedValueOnce(statusStats).mockResolvedValueOnce(priorityStats);
      tasksRepository.count.mockResolvedValue(10);

      const result = await service.getStats();

      expect(result).toEqual({
        total: 10,
        completed: 5,
        inProgress: 3,
        pending: 2,
        highPriority: 4,
      });
    });
  });
});
