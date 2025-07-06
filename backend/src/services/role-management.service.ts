import { Injectable, Logger } from '@nestjs/common';
import { Guild, Role } from 'discord.js';
import { AdminFeedback } from './utils/admin-feedback.util';

/**
 * RoleManagementService
 * 
 * Handles Discord role operations for verification rules.
 * Manages role finding, creation, validation, and hierarchy checks.
 * 
 * Key responsibilities:
 * - Find existing roles by name
 * - Create new roles with proper positioning
 * - Validate role hierarchy and permissions
 * - Handle role management errors gracefully
 */
@Injectable()
export class RoleManagementService {

  /**
   * Finds an existing role by name (case-insensitive) or returns null.
   * 
   * @param guild - Discord guild to search in
   * @param roleName - Name of the role to find
   * @returns Role | null - The found role or null if not found
   */
  findRoleByName(guild: Guild, roleName: string): Role | null {
    return guild.roles.cache.find(r => 
      r.name.toLowerCase() === roleName.toLowerCase()
    ) || null;
  }

  /**
   * Validates that the bot can manage an existing role.
   * 
   * @param role - The Discord role to validate
   * @returns {valid: boolean, errorResponse?: any} - Validation result
   */
  validateRoleManageable(role: Role): {valid: boolean, errorResponse?: any} {
    if (!role.editable) {
      return {
        valid: false,
        errorResponse: {
          embeds: [AdminFeedback.error(
            'Role Hierarchy Issue',
            `A role named "${role.name}" already exists but is positioned higher than the bot's role. The bot cannot manage this role.`,
            [
              'Use a different role name',
              'Move the bot\'s role higher in the server settings',
              `Ask an admin to move the "${role.name}" role below the bot's role`
            ]
          )]
        }
      };
    }

    return { valid: true };
  }

  /**
   * Checks if a role name conflicts with existing roles.
   * 
   * @param guild - Discord guild to check
   * @param roleName - Name to check for conflicts
   * @returns {hasConflict: boolean, errorResponse?: any} - Conflict check result
   */
  checkRoleNameConflict(guild: Guild, roleName: string): {hasConflict: boolean, errorResponse?: any} {
    const existingRoleWithName = guild.roles.cache.find(r => 
      r.name.toLowerCase() === roleName.toLowerCase()
    );
    
    if (existingRoleWithName) {
      return {
        hasConflict: true,
        errorResponse: {
          embeds: [AdminFeedback.error(
            'Duplicate Role Name',
            `A role named "${roleName}" already exists in this server.`,
            ['Choose a different name for the new role']
          )]
        }
      };
    }

    return { hasConflict: false };
  }

  /**
   * Creates a new role in the guild with proper positioning.
   * 
   * @param guild - Discord guild to create role in
   * @param roleName - Name of the role to create
   * @param creatorTag - Discord tag of the user creating the role
   * @returns Promise<{success: boolean, role?: Role, errorResponse?: any}> - Creation result
   */
  async createRole(
    guild: Guild, 
    roleName: string, 
    creatorTag: string
  ): Promise<{success: boolean, role?: Role, errorResponse?: any}> {
    try {
      // Get bot member to determine role position
      const botMember = guild.members.me;
      let position = undefined;
      
      if (botMember) {
        // Create role below bot's highest role
        const botHighestPosition = botMember.roles.highest.position;
        position = Math.max(1, botHighestPosition - 1);
      }

      const role = await guild.roles.create({
        name: roleName,
        color: 'Blue', // Default color
        position: position,
        reason: `Auto-created for verification rule by ${creatorTag}`
      });
      
      return {
        success: true,
        role
      };
    } catch (error) {
      Logger.error(`Failed to create role "${roleName}":`, error);
      return {
        success: false,
        errorResponse: {
          embeds: [AdminFeedback.error(
            'Role Creation Failed',
            `Failed to create role "${roleName}": ${error.message}`,
            ['Try again with a different role name']
          )]
        }
      };
    }
  }

  /**
   * Finds an existing role or creates a new one if it doesn't exist.
   * Handles all validation and error cases.
   * 
   * @param guild - Discord guild
   * @param roleName - Name of the role
   * @param creatorTag - Discord tag of the user requesting the role
   * @returns Promise<{success: boolean, role?: Role, errorResponse?: any, wasCreated?: boolean}> - Operation result
   */
  async findOrCreateRole(
    guild: Guild, 
    roleName: string, 
    creatorTag: string
  ): Promise<{success: boolean, role?: Role, errorResponse?: any, wasCreated?: boolean}> {
    // Try to find existing role first
    let role = this.findRoleByName(guild, roleName);

    if (role) {
      // Role exists - validate we can manage it
      const validation = this.validateRoleManageable(role);
      if (!validation.valid) {
        return {
          success: false,
          errorResponse: validation.errorResponse
        };
      }

      return {
        success: true,
        role,
        wasCreated: false
      };
    }

    // Role doesn't exist - check for name conflicts and create
    const conflictCheck = this.checkRoleNameConflict(guild, roleName);
    if (conflictCheck.hasConflict) {
      return {
        success: false,
        errorResponse: conflictCheck.errorResponse
      };
    }

    // Create the new role
    const createResult = await this.createRole(guild, roleName, creatorTag);
    if (!createResult.success) {
      return {
        success: false,
        errorResponse: createResult.errorResponse
      };
    }

    return {
      success: true,
      role: createResult.role,
      wasCreated: true
    };
  }
}
