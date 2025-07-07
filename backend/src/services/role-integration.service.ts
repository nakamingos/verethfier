import { Injectable, Logger } from '@nestjs/common';
import { DbService } from './db.service';
import { DiscordVerificationService } from './discord-verification.service';
import { DynamicRoleService } from './dynamic-role.service';

/**
 * RoleIntegrationService
 * 
 * Integrates the enhanced role tracking system with the existing verification flow.
 * This service bridges the gap between the current "verify once" system and the new
 * dynamic role management system.
 * 
 * Key responsibilities:
 * - Track role assignments during verification
 * - Provide migration path from legacy to enhanced tracking
 * - Coordinate between different role management systems
 */
@Injectable()
export class RoleIntegrationService {
  constructor(
    private readonly dbSvc: DbService,
    private readonly discordVerificationSvc: DiscordVerificationService,
    private readonly dynamicRoleSvc: DynamicRoleService,
  ) {}

  /**
   * Enhanced role assignment that tracks in both legacy and new systems
   * Call this instead of the original addUserRole during verification
   */
  async assignRoleWithTracking(
    userId: string,
    serverId: string, 
    roleId: string,
    ruleId: string,
    address: string,
    nonce: string
  ): Promise<boolean> {
    try {
      // First, assign the role using the existing method
      await this.discordVerificationSvc.addUserRole(userId, roleId, serverId, address, nonce);

      // Get additional metadata for enhanced tracking
      const names = await this.discordVerificationSvc.getDiscordNames(userId, serverId);
      const roleName = await this.discordVerificationSvc.getRoleName(serverId, roleId);

      // Track in enhanced system
      await this.dbSvc.trackRoleAssignment({
        userId,
        serverId,
        roleId,
        ruleId,
        address,
        userName: names.userName,
        serverName: names.serverName,
        roleName,
        expiresInHours: 24 * 7 // Default to weekly re-verification
      });

      Logger.log(`✅ Role assignment tracked: ${names.userName || userId} -> ${roleName || roleId} in ${names.serverName || serverId}`);
      return true;

    } catch (error) {
      Logger.error('Failed to assign role with tracking:', error);
      return false;
    }
  }

  /**
   * Check if enhanced tracking is available and ready
   */
  async isEnhancedTrackingReady(): Promise<boolean> {
    try {
      return await this.dbSvc.checkEnhancedTrackingExists();
    } catch (error) {
      Logger.error('Error checking enhanced tracking availability:', error);
      return false;
    }
  }

  /**
   * Get comprehensive role assignment statistics
   */
  async getRoleStats(): Promise<any> {
    try {
      const enhancedStats = await this.dbSvc.getRoleAssignmentStats();
      
      return {
        enhancedTracking: enhancedStats,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      Logger.error('Error fetching role stats:', error);
      return null;
    }
  }

  /**
   * Manual trigger for re-verification of a specific user
   */
  async triggerUserReverification(userId: string): Promise<{success: boolean, details?: any}> {
    try {
      const isReady = await this.isEnhancedTrackingReady();
      if (!isReady) {
        return {
          success: false,
          details: { error: 'Enhanced tracking not available' }
        };
      }

      const result = await this.dynamicRoleSvc.reverifyUser(userId);
      
      return {
        success: true,
        details: result
      };
    } catch (error) {
      Logger.error(`Error during manual re-verification for user ${userId}:`, error);
      return {
        success: false,
        details: { error: error.message }
      };
    }
  }

  /**
   * Manual trigger for re-verification of a specific server
   * Note: This will get all active assignments for the server and reverify each user
   */
  async triggerServerReverification(serverId: string): Promise<{success: boolean, details?: any}> {
    try {
      const isReady = await this.isEnhancedTrackingReady();
      if (!isReady) {
        return {
          success: false,
          details: { error: 'Enhanced tracking not available' }
        };
      }

      // Get all active assignments for this server
      const serverAssignments = await this.dbSvc.getActiveRoleAssignments();
      const filteredAssignments = serverAssignments.filter(a => a.server_id === serverId);
      
      let verified = 0;
      let revoked = 0;
      
      // Reverify each unique user in this server
      const uniqueUsers = [...new Set(filteredAssignments.map(a => a.user_id))];
      
      for (const userId of uniqueUsers) {
        const result = await this.dynamicRoleSvc.reverifyUser(userId);
        verified += result.verified;
        revoked += result.revoked;
      }
      
      return {
        success: true,
        details: { verified, revoked, usersProcessed: uniqueUsers.length }
      };
    } catch (error) {
      Logger.error(`Error during manual re-verification for server ${serverId}:`, error);
      return {
        success: false,
        details: { error: error.message }
      };
    }
  }

  /**
   * Get all role assignments for a user (for admin/debugging)
   */
  async getUserRoleStatus(userId: string): Promise<any> {
    try {
      const assignments = await this.dbSvc.getUserRoleAssignments(userId);
      
      return {
        userId,
        totalAssignments: assignments.length,
        activeAssignments: assignments.filter(a => a.status === 'active').length,
        assignments: assignments.map(a => ({
          id: a.id,
          serverName: a.server_name,
          roleName: a.role_name,
          status: a.status,
          assignedAt: a.verified_at,
          lastVerified: a.last_checked,
          expiresAt: a.expires_at
        }))
      };
    } catch (error) {
      Logger.error(`Error fetching role status for user ${userId}:`, error);
      return null;
    }
  }
}
