import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';

/**
 * Redis-based distributed rate limiting guard
 *
 * Benefits:
 * - Distributed: Works across multiple application instances
 * - Persistent: Rate limits survive application restarts
 * - Efficient: Uses Redis atomic operations for thread-safe counting
 * - Scalable: Redis handles cleanup and expiration automatically
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  constructor(protected readonly reflector: Reflector) {
    super({
      throttlers: [
        {
          name: 'default',
          ttl: 60000,
          limit: 100,
        },
      ],
      // ThrottlerGuard will use Redis storage configured in AppModule
      // This ensures distributed rate limiting across all instances
    }, reflector);
  }

  /**
   * Override to customize rate limit key generation
   * Uses user ID if authenticated, otherwise falls back to IP
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Use user ID for authenticated requests for better tracking
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }

    // Fall back to IP address for unauthenticated requests
    return req.ip || req.connection.remoteAddress || 'unknown';
  }

  /**
   * Override to provide better error messages
   */
  protected async throwThrottlingException(context: ExecutionContext): Promise<void> {
    const response = context.switchToHttp().getResponse();
    const request = context.switchToHttp().getRequest();

    // Set rate limit headers
    response.header('X-RateLimit-Limit', '100');
    response.header('X-RateLimit-Remaining', '0');
    response.header('Retry-After', '60');

    // Call parent to throw the exception
    return super.throwThrottlingException(context);
  }
}