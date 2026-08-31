import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { logAdminAction } from '../services/auditLogService.js';
import {
    createUser, deleteUsers, findAdminAuditLog, countAdminAuditLog
} from './dbHelpers.js';

const ts = Date.now();
let adminUser, targetUser;

beforeAll(async () => {
    adminUser = await createUser(`audit_admin_${ts}`, { is_admin: true });
    targetUser = await createUser(`audit_target_${ts}`);
});

afterAll(async () => {
    await deleteUsers([adminUser.id, targetUser.id]);
});

const wait = (ms) => new Promise(r => setTimeout(r, ms));

describe('logAdminAction', () => {
    it('creates an audit log entry', async () => {
        logAdminAction({
            adminId: adminUser.id,
            adminUsername: adminUser.username,
            actionType: 'BAN_USER',
            targetUserId: targetUser.id,
            targetUsername: targetUser.username,
            reason: 'cheating'
        });

        await wait(300);

        const log = await findAdminAuditLog(adminUser.id, 'BAN_USER');
        expect(log).not.toBeNull();
        expect(log.reason).toBe('cheating');
        expect(log.target_user_id).toBe(targetUser.id);
    });

    it('logs without a target user', async () => {
        logAdminAction({
            adminId: adminUser.id,
            adminUsername: adminUser.username,
            actionType: 'MAINTENANCE_ON',
        });
        await wait(300);

        const log = await findAdminAuditLog(adminUser.id, 'MAINTENANCE_ON');
        expect(log).not.toBeNull();
        expect(log.target_user_id).toBeNull();
    });

    it('does NOT create a log entry when required fields are missing', async () => {
        const before = await countAdminAuditLog(adminUser.id);
        logAdminAction({ adminId: adminUser.id });
        await wait(300);
        const after = await countAdminAuditLog(adminUser.id);
        expect(after).toBe(before);
    });
});
