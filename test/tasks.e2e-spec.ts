import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TaskStatus } from '../src/modules/tasks/enums/task-status.enum';
import { TaskPriority } from '../src/modules/tasks/enums/task-priority.enum';

jest.setTimeout(60000);

describe('Tasks API (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let userId: string;
  let createdTaskId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    await app.init();

    // Register and login a test user
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `test-${Date.now()}@example.com`,
        password: 'Test123!@#',
        name: 'Test User',
      })
      .expect(201);

    userId = registerResponse.body.id;

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: registerResponse.body.email,
        password: 'Test123!@#',
      })
      .expect(200);

    authToken = loginResponse.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /tasks', () => {
    it('should create a new task', async () => {
      const response = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Task',
          description: 'Test Description',
          status: TaskStatus.PENDING,
          priority: TaskPriority.MEDIUM,
          dueDate: new Date(Date.now() + 86400000).toISOString(),
          userId: userId,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe('Test Task');
      expect(response.body.status).toBe(TaskStatus.PENDING);
      createdTaskId = response.body.id;
    });

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .send({
          title: 'Test Task',
          description: 'Test Description',
          status: TaskStatus.PENDING,
          priority: TaskPriority.MEDIUM,
          userId: userId,
        })
        .expect(401);
    });

    it('should fail with invalid data', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: '', // Empty title
          status: 'INVALID_STATUS',
          priority: TaskPriority.MEDIUM,
          userId: userId,
        })
        .expect(400);
    });

    it('should fail with invalid userId', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Task',
          description: 'Test Description',
          status: TaskStatus.PENDING,
          priority: TaskPriority.MEDIUM,
          userId: 99999, // Non-existent user
        })
        .expect(404);
    });
  });

  describe('GET /tasks', () => {
    it('should return paginated tasks', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toHaveProperty('total');
      expect(response.body.meta).toHaveProperty('page');
      expect(response.body.meta).toHaveProperty('limit');
    });

    it('should filter tasks by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: TaskStatus.PENDING })
        .expect(200);

      expect(response.body.data.every((task: any) => task.status === TaskStatus.PENDING)).toBe(true);
    });

    it('should filter tasks by priority', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ priority: TaskPriority.HIGH })
        .expect(200);

      expect(response.body.data.every((task: any) => task.priority === TaskPriority.HIGH || task.priority === undefined)).toBe(true);
    });

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .get('/tasks')
        .expect(401);
    });
  });

  describe('GET /tasks/:id', () => {
    it('should return a single task', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(createdTaskId);
      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('status');
    });

    it('should return 404 for non-existent task', async () => {
      await request(app.getHttpServer())
        .get('/tasks/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('PATCH /tasks/:id', () => {
    it('should update a task', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated Task Title',
          status: TaskStatus.IN_PROGRESS,
        })
        .expect(200);

      expect(response.body.title).toBe('Updated Task Title');
      expect(response.body.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('should fail with invalid data', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'INVALID_STATUS',
        })
        .expect(400);
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('should delete a task', async () => {
      await request(app.getHttpServer())
        .delete(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify task is deleted
      await request(app.getHttpServer())
        .get(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('GET /tasks/stats', () => {
    it('should return task statistics', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('status');
        expect(response.body[0]).toHaveProperty('count');
      }
    });
  });

  describe('POST /tasks/batch', () => {
    let batchTaskIds: string[];

    beforeAll(async () => {
      // Create multiple tasks for batch operations
      const tasks = [];
      for (let i = 0; i < 3; i++) {
        const response = await request(app.getHttpServer())
          .post('/tasks')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Batch Task ${i}`,
            description: 'Batch test',
            status: TaskStatus.PENDING,
            priority: TaskPriority.LOW,
            userId: userId,
          });
        tasks.push(response.body.id);
      }
      batchTaskIds = tasks;
    });

    it('should update multiple tasks', async () => {
      const response = await request(app.getHttpServer())
        .post('/tasks/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taskIds: batchTaskIds,
          action: 'update_status',
          data: { status: TaskStatus.COMPLETED },
        })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(batchTaskIds.length);
      expect(response.body.every((result: any) => result.success === true)).toBe(true);
    });

    it('should delete multiple tasks', async () => {
      const response = await request(app.getHttpServer())
        .post('/tasks/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taskIds: batchTaskIds,
          action: 'delete',
        })
        .expect(200);

      expect(response.body.every((result: any) => result.success === true)).toBe(true);
    });
  });
});


