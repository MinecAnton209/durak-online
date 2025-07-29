const db = require('../db');

function logAdminAction(logData) {
    const {
        adminId,
        adminUsername,
        actionType,
        targetUserId = null,
        targetUsername = null,
        reason = null
    } = logData;

    if (!adminId || !adminUsername || !actionType) {
        console.error("[AuditLog] Недостатньо даних для запису в лог:", logData);
        return;
    }

    const sql = `
        INSERT INTO admin_audit_log 
        (admin_id, admin_username, action_type, target_user_id, target_username, reason) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    const params = [adminId, adminUsername, actionType, targetUserId, targetUsername, reason];

    db.run(sql, params, (err) => {
        if (err) {
            console.error(`[AuditLog] Помилка запису дії '${actionType}' в лог аудиту:`, err.message);
        } else {
            console.log(`[AuditLog] Дія '${actionType}' від адміна '${adminUsername}' успішно записана.`);
        }
    });
}

module.exports = {
    logAdminAction
};