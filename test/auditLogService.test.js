/**
 * Integration tests for services/auditLogService.js using real test SQLite DB.
 * logAdminAction is fire-and-forget (no await), so we wait a bit for completion.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from './prismaClient.js';
import { logAdminAction } from '../services/auditLogService.js';

const ts = Date.now();
let adminUser, targetUser;

beforeAll(async () => {
    adminUser = await prisma.user.create({ data: { username: `audit_admin_${ts}`, password: 'hashed', is_admin: true } });
    targetUser = await prisma.user.create({ data: { username: `audit_target_${ts}`, password: 'hashed' } });
});

afterAll(async () => {
    await prisma.adminAuditLog.deleteMany({ where: { admin_id: adminUser.id } });
    await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, targetUser.id] } } });
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

        await wait(300); // fire-and-forget: give the async promise time to resolve

        const log = await prisma.adminAuditLog.findFirst({
            where: { admin_id: adminUser.id, action_type: 'BAN_USER' }
        });
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

        const log = await prisma.adminAuditLog.findFirst({
            where: { admin_id: adminUser.id, action_type: 'MAINTENANCE_ON' }
        });
        expect(log).not.toBeNull();
        expect(log.target_user_id).toBeNull();
    });

    it('does NOT create a log entry when required fields are missing', async () => {
        const before = await prisma.adminAuditLog.count({ where: { admin_id: adminUser.id } });
        // Missing adminUsername and actionType → service returns early
        logAdminAction({ adminId: adminUser.id });
        await wait(300);
        const after = await prisma.adminAuditLog.count({ where: { admin_id: adminUser.id } });
        expect(after).toBe(before);
    });
});
