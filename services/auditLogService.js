import db from '../db/drizzle.js';
import { adminAuditLog } from '../db/schema.ts';

async function logAdminAction(logData) {
  const {
    adminId,
    adminUsername,
    actionType,
    targetUserId = null,
    targetUsername = null,
    reason = null
  } = logData;

  if (!adminId || !adminUsername || !actionType) {
    console.error('[AuditLog] Insufficient data for logging:', logData);
    return;
  }

  try {
    await db.insert(adminAuditLog).values({
      admin_id: adminId,
      admin_username: adminUsername,
      action_type: actionType,
      target_user_id: targetUserId,
      target_username: targetUsername,
      reason: reason
    });
    console.log(`[AuditLog] Action '${actionType}' by admin '${adminUsername}' successfully recorded.`);
  } catch (err) {
    console.error(`[AuditLog] Error recording action '${actionType}' in audit log:`, err.message);
  }
}

export { logAdminAction };
