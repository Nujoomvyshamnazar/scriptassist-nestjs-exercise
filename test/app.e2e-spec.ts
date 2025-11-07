import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

jest.setTimeout(600000);

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply the same pipes used in the main application
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
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET) - should return 404 (no root route)', () => {
    return request(app.getHttpServer()).get('/').expect(404);
  });

  it('/health (GET) - should return health status', async () => {
    const response = await request(app.getHttpServer())
      .get('/health');

    // Health check might return 503 if memory thresholds are exceeded
    expect([200, 503]).toContain(response.status);
    expect(response.body).toHaveProperty('status');
  });
});
