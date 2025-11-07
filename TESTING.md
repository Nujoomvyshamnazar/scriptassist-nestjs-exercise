# Testing Guide

## Running Tests

### Unit Tests

Run all unit tests:
```bash
bun test
```

Run tests in watch mode:
```bash
bun run test:watch
```

Run tests with coverage:
```bash
bun run test:cov
```

### E2E Tests

**Prerequisites:**
- Docker containers must be running (PostgreSQL and Redis)
- Application should NOT be running (E2E tests start their own instance)

Start Docker containers:
```bash
docker-compose up -d
```

Run E2E tests:
```bash
npm run test:e2e
```

**Note:** E2E tests use Jest instead of Bun due to better module resolution for NestJS testing.

## Test Results

### Unit Tests ✅
- **22 tests passing**
- **Coverage:**
  - Functions: 86.96%
  - Lines: 72.96%
- **Test File:** `src/modules/tasks/tasks.service.spec.ts`

### E2E Tests ⚠️
- **29 total tests**
- **9 passing, 20 failing**
- **Test Files:**
  - `test/app.e2e-spec.ts`
  - `test/auth.e2e-spec.ts`
  - `test/tasks.e2e-spec.ts`

**Known Issues:**
1. Response format changes (register returns `{user, token}` instead of just user)
2. Status code mismatches (login returns 201 instead of 200)
3. Test data format issues in beforeAll hooks

## Test Structure

### Unit Tests
- Located in `src/**/*.spec.ts`
- Use Jest/Bun test runner
- Mock all external dependencies (repositories, queues, cache)
- Focus on business logic testing

### E2E Tests
- Located in `test/**/*.e2e-spec.ts`
- Use Jest with ts-jest transformer
- Test full HTTP request/response cycle
- Use real database and Redis (via Docker)
- Test authentication, authorization, and API endpoints

## Debugging Tests

### View detailed E2E test output:
```bash
npm run test:e2e -- --verbose
```

### Run specific E2E test file:
```bash
npm run test:e2e -- test/auth.e2e-spec.ts
```

### Run with open handles detection:
```bash
npm run test:e2e -- --detectOpenHandles
```

## Test Configuration

### Unit Tests
- Uses Bun's built-in test runner
- Configuration in `package.json`

### E2E Tests
- Uses Jest with `jest-e2e.config.js`
- Timeout: 60 seconds per test
- Runs in band (sequential) to avoid database conflicts

## Continuous Integration

For CI/CD pipelines:

```bash
# Start services
docker-compose up -d

# Wait for services to be ready
sleep 5

# Run unit tests
bun test

# Run E2E tests
npm run test:e2e

# Cleanup
docker-compose down
```

## Test Coverage

Current coverage (unit tests):
- TasksService: 86.96% functions, 72.96% lines
- All critical paths covered
- Edge cases tested (not found, validation errors, etc.)

Areas not covered:
- Cache service (25% functions, 23.76% lines)
- Some error handling paths in batch operations
- Queue processor services

