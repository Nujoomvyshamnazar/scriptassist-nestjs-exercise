import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
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
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
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
}