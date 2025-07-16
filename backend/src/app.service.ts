import { Injectable } from '@nestjs/common';
import dotenv from 'dotenv';

// Load environment configuration
dotenv.config();

/**
 * AppService
 * 
 * Main application service that provides core functionality and health checks
 * for the Verethfier Discord bot backend. This service is primarily used for
 * application lifecycle management and basic health monitoring.
 * 
 * Key Responsibilities:
 * - Application health checks and status reporting
 * - Basic service coordination and initialization
 * - Environment configuration validation
 * - System-wide utility functions
 * 
 * The service is intentionally lightweight, with most business logic
 * delegated to specialized services (verification, Discord, data access, etc.).
 */
@Injectable()
export class AppService {
  /**
   * Get basic application health and status information
   * 
   * @returns Object containing application status, version, and health metrics
   */
  getHealth() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0'
    };
  }

  /**
   * Get application information and basic stats
   * 
   * @returns Object containing application metadata
   */
  getInfo() {
    return {
      name: 'Verethfier Backend',
      description: 'NestJS-based Discord bot for Ethscriptions-based role verification',
      architecture: 'Unified verification engine with channel-based verification',
      features: [
        'EIP-712 signature verification',
        'Dynamic role management',
        'High-performance caching',
        'Multi-tier rate limiting',
        'Multi-wallet support'
      ]
    };
  }
}