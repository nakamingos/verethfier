/**
 * Generic database operation result
 */
export interface DbResult<T = any> {
  data: T;
  error: any;
}

/**
 * Server record interface
 */
export interface ServerRecord {
  id: string;
  name: string;
  role_id: string;
}

/**
 * Legacy role record interface  
 */
export interface LegacyRoleRecord {
  role_id: string;
  name: string;
}
