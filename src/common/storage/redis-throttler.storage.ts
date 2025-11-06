import { ThrottlerStorage } from '@nestjs/throttler';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

/**
 * Redis-based storage for distributed rate limiting
 * 
 * Benefits:
 * - Distributed: Works across multiple application instances
 * - Persistent: Rate limits survive application restarts
 * - Atomic: Uses Redis INCR for thread-safe counting
 * - Auto-cleanup: Redis TTL handles expiration automatically
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private redis: Redis;
  private readonly prefix = 'throttle:';

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST') || 'localhost',
      port: this.configService.get('REDIS_PORT') || 6379,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  /**
   * Increment the request count for a given key
   * Returns the current count and TTL
   */
  async increment(key: string, ttl: number): Promise<{ totalHits: number; timeToExpire: number }> {
    const redisKey = `${this.prefix}${key}`;
    
    // Use Redis pipeline for atomic operations
    const pipeline = this.redis.pipeline();
    pipeline.incr(redisKey);
    pipeline.pttl(redisKey);
    
    const results = await pipeline.exec();
    
    if (!results) {
      throw new Error('Redis pipeline failed');
    }
    
    const totalHits = results[0][1] as number;
    let timeToExpire = results[1][1] as number;
    
    // If key is new (no TTL), set the TTL
    if (timeToExpire === -1) {
      await this.redis.pexpire(redisKey, ttl);
      timeToExpire = ttl;
    }
    
    return {
      totalHits,
      timeToExpire: Math.max(timeToExpire, 0),
    };
  }
}

