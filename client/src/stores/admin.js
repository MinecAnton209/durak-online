import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAdminStore = defineStore('admin', () => {
    const stats = ref({
        totalUsers: 0,
        activeGames: 0,
        onlineUsers: 0,
        gamesPlayedToday: 0,
        newRegistrationsToday: 0
    });

    const loading = ref(false);
    const error = ref(null);

    async function fetchDashboardOverview() {
        loading.value = true;
        error.value = null;
        try {
            const response = await fetch('/api/admin/stats/dashboard-overview');
            if (!response.ok) {
                if (response.status === 403) throw new Error('Forbidden: Admin access only');
                throw new Error('Failed to fetch dashboard overview');
            }
            const data = await response.json();
            stats.value = data;
        } catch (err) {
            console.error('Error fetching admin stats:', err);
            error.value = err.message;
        } finally {
            loading.value = false;
        }
    }

    async function fetchRegistrationsByDay(days = 7) {
        try {
            const response = await fetch(`/api/admin/stats/registrations-by-day?days=${days}`);
            if (response.ok) return await response.json();
        } catch (err) {
            console.error('Error fetching registrations stats:', err);
        }
        return [];
    }

    async function fetchGamesByDay() {
        try {
            const response = await fetch('/api/admin/stats/games-by-day');
            if (response.ok) return await response.json();
        } catch (err) {
            console.error('Error fetching games stats:', err);
        }
        return [];
    }

    async function fetchMaintenanceStatus() {
        try {
            const response = await fetch('/api/admin/maintenance/status');
            if (response.ok) return await response.json();
        } catch (err) {
            console.error('Error fetching maintenance status:', err);
        }
        return null;
    }

    async function enableMaintenance(message, minutes) {
        try {
            const response = await fetch('/api/admin/maintenance/enable', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, minutesUntilStart: minutes })
            });
            if (!response.ok) throw new Error('Failed to enable maintenance');
            return await response.json();
        } catch (err) {
            console.error('Error enabling maintenance:', err);
            throw err;
        }
    }

    async function disableMaintenance() {
        try {
            const response = await fetch('/api/admin/maintenance/disable', {
                method: 'POST'
            });
            if (!response.ok) throw new Error('Failed to disable maintenance');
            return await response.json();
        } catch (err) {
            console.error('Error disabling maintenance:', err);
            throw err;
        }
    }

    async function broadcastMessage(message, type = 'info') {
        try {
            const response = await fetch('/api/admin/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, type })
            });
            if (!response.ok) throw new Error('Failed to broadcast message');
            return await response.json();
        } catch (err) {
            console.error('Error broadcasting message:', err);
            throw err;
        }
    }

    async function fetchUsers(query = '', page = 0, limit = 20) {
        try {
            let endpoint;
            if (query) {
                endpoint = `/api/admin/users/search?query=${query}`;
            } else {
                endpoint = `/api/admin/users?page=${page}&limit=${limit}`;
            }
            const response = await fetch(endpoint);
            if (response.ok) {
                const data = await response.json();
                // Handle both old format (array) and new format (object with pagination)
                if (Array.isArray(data)) {
                    return data;
                }
                return data.users || [];
            }
        } catch (err) {
            console.error('Error fetching users:', err);
        }
        return [];
    }

    async function fetchUserDetails(userId) {
        try {
            const response = await fetch(`/api/admin/users/${userId}/details`);
            if (response.ok) return await response.json();
        } catch (err) {
            console.error('Error fetching user details:', err);
        }
        return null;
    }

    async function updateUser(userId, data) {
        try {
            const response = await fetch(`/api/admin/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error('Failed to update user');
            return await response.json();
        } catch (err) {
            console.error('Error updating user:', err);
            throw err;
        }
    }

    async function fetchActiveGames() {
        try {
            const response = await fetch('/api/admin/games/active');
            if (response.ok) return await response.json();
        } catch (err) {
            console.error('Error fetching active games:', err);
        }
        return [];
    }

    async function fetchGameHistory(page = 0, pageSize = 25) {
        try {
            const response = await fetch(`/api/admin/games/history?page=${page}&pageSize=${pageSize}`);
            if (response.ok) return await response.json();
        } catch (err) {
            console.error('Error fetching game history:', err);
        }
        return { rows: [], rowCount: 0 };
    }

    async function fetchAuditLog(page = 0, pageSize = 25) {
        try {
            const response = await fetch(`/api/admin/audit-log?page=${page}&pageSize=${pageSize}`);
            if (response.ok) return await response.json();
        } catch (err) {
            console.error('Error fetching audit log:', err);
        }
        return { rows: [], rowCount: 0 };
    }

    async function fetchDonations(page = 0, pageSize = 50) {
        try {
            const response = await fetch(`/api/admin/donations?page=${page}&pageSize=${pageSize}`);
            if (response.ok) return await response.json();
        } catch (err) {
            console.error('Error fetching donations:', err);
        }
        return { rows: [], rowCount: 0, totalAmount: 0 };
    }

    async function fetchSockets() {
        try {
            const response = await fetch('/api/admin/system/sockets');
            if (response.ok) return await response.json();
        } catch (err) {
            console.error('Error fetching sockets:', err);
        }
        return { totalConnections: 0, connections: [] };
    }

    async function fetchUserSessions(userId) {
        try {
            const response = await fetch(`/api/admin/users/${userId}/active-sessions`);
            if (response.ok) return await response.json();
        } catch (err) {
            console.error('Error fetching user sessions (admin):', err);
        }
        return [];
    }

    async function terminateSession(sessionId) {
        try {
            const response = await fetch(`/api/admin/sessions/${sessionId}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to terminate session');
            return await response.json();
        } catch (err) {
            console.error('Error terminating session (admin):', err);
            throw err;
        }
    }

    async function fetchDeviceDetails(deviceId) {
        try {
            const response = await fetch(`/api/admin/devices/${deviceId}`);
            if (response.ok) return await response.json();
        } catch (err) {
            console.error('Error fetching device details (admin):', err);
        }
        return null;
    }

    async function banDevice(deviceId, reason, until) {
        try {
            const response = await fetch(`/api/admin/devices/${deviceId}/ban`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason, until })
            });
            if (!response.ok) throw new Error('Failed to ban device');
            return await response.json();
        } catch (err) {
            console.error('Error banning device (admin):', err);
            throw err;
        }
    }

    async function unbanDevice(bannedId) {
        try {
            const response = await fetch(`/api/admin/banned-devices/${bannedId}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to unban device');
            return await response.json();
        } catch (err) {
            console.error('Error unbanning device (admin):', err);
            throw err;
        }
    }

    async function fetchDeviceBanInfo(deviceId) {
        try {
            const response = await fetch(`/api/admin/devices/${deviceId}/ban-info`);
            if (response.ok) return await response.json();
        } catch (err) {
            console.error('Error fetching device ban info (admin):', err);
        }
        return { banned: false };
    }

    return {
        stats,
        loading,
        error,
        fetchDashboardOverview,
        fetchRegistrationsByDay,
        fetchGamesByDay,
        fetchMaintenanceStatus,
        enableMaintenance,
        disableMaintenance,
        broadcastMessage,
        fetchUsers,
        fetchUserDetails,
        updateUser,
        fetchActiveGames,
        fetchGameHistory,
        fetchAuditLog,
        fetchDonations,
        fetchSockets,
        fetchUserSessions,
        terminateSession,
        fetchDeviceDetails,
        banDevice,
        unbanDevice,
        fetchDeviceBanInfo
    };
});
