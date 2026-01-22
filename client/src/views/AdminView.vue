<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useAdminStore } from '@/stores/admin';
import { useI18n } from 'vue-i18n';

const { t, d } = useI18n();

const router = useRouter();
const authStore = useAuthStore();
const adminStore = useAdminStore();

// Custom Notification System
const notifications = ref([]);
const showToast = (message, type = 'success') => {
    const id = Date.now();
    notifications.value.push({ id, message, type });
    setTimeout(() => {
        notifications.value = notifications.value.filter(n => n.id !== id);
    }, 4000);
};

// Custom Confirm/Prompt State
const confirmModal = ref({ open: false, title: '', message: '', resolve: null });
const promptModal = ref({ open: false, title: '', label: '', value: '', type: 'text', resolve: null });

const askConfirm = (title, message) => {
    return new Promise(resolve => {
        confirmModal.value = { open: true, title, message, resolve };
    });
};

const askPrompt = (title, label, defaultValue = '', type = 'text') => {
    return new Promise(resolve => {
        promptModal.value = { open: true, title, label, value: defaultValue, type, resolve };
    });
};

const currentTab = ref('dashboard');

const navItems = [
    { id: 'dashboard', label: t('admin_nav_dashboard'), icon: '📊' },
    { id: 'users', label: t('admin_nav_users'), icon: '👥' },
    { id: 'games', label: t('admin_nav_games'), icon: '🎲' },
    { id: 'donations', label: t('admin_nav_donations'), icon: '⭐️' },
    { id: 'system', label: t('admin_nav_system'), icon: '⚙️' },
    { id: 'audit', label: t('admin_nav_audit'), icon: '📜' },
    { id: 'maintenance', label: t('admin_nav_maintenance'), icon: '🛠️' },
    { id: 'inbox', label: t('admin_nav_inbox'), icon: '📨' },
    { id: 'devices', label: t('admin_nav_devices'), icon: '📱' },
];

const statCards = computed(() => {
    const total = adminStore.stats.totalUsers || 1;
    const newReg = adminStore.stats.newRegistrationsToday || 0;
    // Avoid division by zero and handle initial state
    const previousTotal = total - newReg;
    const growth = previousTotal > 0 ? ((newReg / previousTotal) * 100).toFixed(1) : 0;

    return [
        {
            label: t('admin_stat_total_users'),
            value: adminStore.stats.totalUsers,
            icon: '👤',
            color: 'primary',
            growth: newReg > 0 ? `+${growth}%` : null
        },
        { label: t('admin_stat_active_games'), value: adminStore.stats.activeGames, icon: '🎮', color: 'secondary' },
        { label: t('admin_stat_online_users'), value: adminStore.stats.onlineUsers, icon: '🌍', color: 'success' },
        { label: t('admin_stat_games_today'), value: adminStore.stats.gamesPlayedToday, icon: '📈', color: 'info' },
    ];
});

const activityData = ref([]);
const activityPeriod = ref(7);

const loadActivityData = async () => {
    const registrations = await adminStore.fetchRegistrationsByDay(activityPeriod.value);
    if (registrations && registrations.length > 0) {
        const max = Math.max(...registrations.map(r => r.count), 1);

        // Initial state for animation
        activityData.value = registrations.map(r => ({
            label: r.date.split('-').slice(1).join('/'),
            value: r.count,
            height: 0
        }));

        // Animation trigger
        setTimeout(() => {
            activityData.value = registrations.map(r => ({
                label: r.date.split('-').slice(1).join('/'),
                value: r.count,
                height: (r.count / max) * 100
            }));
        }, 50);
    }
};

watch(activityPeriod, loadActivityData);

const isMaintenanceEnabled = ref(false);
const maintenanceMessage = ref('');
const currentMaintenanceMessage = ref('');
const maintenanceStartTime = ref(null);
const maintenanceMinutes = ref(0);
const processingMaintenance = ref(false);

const broadcastText = ref('');
const broadcastType = ref('info');

const displayedMaintenanceMessage = computed(() => currentMaintenanceMessage.value || t('ban_reason_not_specified'));

const checkMaintenanceStatus = async () => {
    const status = await adminStore.fetchMaintenanceStatus();
    if (status) {
        isMaintenanceEnabled.value = status.enabled;
        currentMaintenanceMessage.value = status.message;
        maintenanceStartTime.value = status.startTime;
    }
};

const handleEnableMaintenance = async () => {
    if (!await askConfirm(t('modal_confirm_action'), t('modal_are_you_sure_maint'))) return;

    processingMaintenance.value = true;
    try {
        await adminStore.enableMaintenance(maintenanceMessage.value, maintenanceMinutes.value);
        await checkMaintenanceStatus();
        maintenanceMessage.value = '';
        maintenanceMinutes.value = 0;
        showToast(t('admin_toast_maint_enabled'));
    } catch (e) {
        showToast(t('admin_toast_maint_fail'), 'error');
    } finally {
        processingMaintenance.value = false;
    }
};

const handleDisableMaintenance = async () => {
    if (!await askConfirm(t('modal_confirm_action'), t('modal_turn_off_maint'))) return;

    processingMaintenance.value = true;
    try {
        await adminStore.disableMaintenance();
        await checkMaintenanceStatus();
        showToast(t('admin_toast_access_restored'));
    } catch (e) {
        showToast(t('admin_toast_maint_off_fail'), 'error');
    } finally {
        processingMaintenance.value = false;
    }
};

const handleBroadcast = async () => {
    if (!broadcastText.value.trim()) return;

    try {
        await adminStore.broadcastMessage(broadcastText.value, broadcastType.value);
        broadcastText.value = '';
        showToast(t('admin_toast_broadcast_sent'), 'success');
    } catch (e) {
        showToast(t('admin_toast_broadcast_fail'), 'error');
    }
};

const inboxMessage = ref('');
const inboxTargetUserId = ref('');
const inboxTargetUsername = ref('');
const inboxIsBroadcast = ref(false);
const showUserSelector = ref(false);
const inboxSearchQuery = ref('');
const inboxSearchResults = ref([]);

const searchUsersForInbox = async () => {
    if (!inboxSearchQuery.value || inboxSearchQuery.value.length < 2) return;
    inboxSearchResults.value = await adminStore.fetchUsers(inboxSearchQuery.value);
};

const selectUserForInbox = (user) => {
    inboxTargetUserId.value = user.id;
    inboxTargetUsername.value = user.username;
    showUserSelector.value = false;
    inboxSearchQuery.value = '';
    inboxSearchResults.value = [];
};

const goToInboxWithUser = (user) => {
    inboxTargetUserId.value = user.id;
    inboxTargetUsername.value = user.username;
    inboxIsBroadcast.value = false;
    currentTab.value = 'inbox';
};

const sendMessage = async () => {
    if (!inboxMessage.value.trim()) {
        showToast(t('admin_inbox_error_message_required'), 'error');
        return;
    }

    if (!inboxIsBroadcast.value && !inboxTargetUserId.value) {
        showToast(t('admin_inbox_error_user_required'), 'error');
        return;
    }

    try {
        const res = await fetch('/api/admin/inbox/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: inboxIsBroadcast.value ? null : parseInt(inboxTargetUserId.value),
                message: inboxMessage.value,
                isBroadcast: inboxIsBroadcast.value
            })
        });

        if (res.ok) {
            showToast(t('admin_inbox_success_sent'));
            inboxMessage.value = '';
            // keep user id if repeated sending
        } else {
            const err = await res.json();
            showToast(err.error || t('admin_inbox_error_failed'), 'error');
        }
    } catch (e) {
        showToast(t('admin_inbox_error_failed'), 'error');
    }
};

const users = ref([]);
const userSearchQuery = ref('');
const auditLogs = ref({ rows: [], rowCount: 0 });
const auditPage = ref(0);
const activeGames = ref([]);
const gameHistory = ref({ rows: [], rowCount: 0 });
const gamePage = ref(0);

const loadUsers = async () => {
    users.value = await adminStore.fetchUsers(userSearchQuery.value);
};

const loadAuditLogs = async () => {
    const data = await adminStore.fetchAuditLog(auditPage.value);
    auditLogs.value = data;
};

const loadGames = async () => {
    activeGames.value = await adminStore.fetchActiveGames();
    gameHistory.value = await adminStore.fetchGameHistory(gamePage.value);
};

const systemSockets = ref({ totalConnections: 0, connections: [] });

const loadSystemSockets = async () => {
    systemSockets.value = await adminStore.fetchSockets();
};

const disconnectSocket = async (socketId) => {
    if (!await askConfirm(t('modal_force_disconnect'), t('modal_kick_client_confirm'))) return;
    const reason = await askPrompt(t('modal_kick_reason'), t('modal_enter_kick_reason'), t('modal_admin_decision'));
    if (reason === null) return;

    try {
        const response = await fetch(`/api/admin/system/sockets/${socketId}/disconnect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });
        if (response.ok) {
            showToast(t('admin_toast_socket_disconnected'));
            loadSystemSockets();
        }
    } catch (e) {
        showToast(t('admin_toast_socket_fail'), 'error');
    }
};

const donations = ref({ rows: [], rowCount: 0, totalAmount: 0 });
const donationPage = ref(0);

const loadDonations = async () => {
    donations.value = await adminStore.fetchDonations(donationPage.value);
};

watch(currentTab, (newTab) => {
    switch (newTab) {
        case 'dashboard':
            adminStore.fetchDashboardOverview();
            loadActivityData();
            break;
        case 'users':
            loadUsers();
            break;
        case 'audit':
            loadAuditLogs();
            break;
        case 'games':
            loadGames();
            break;
        case 'system':
            loadSystemSockets();
            break;
        case 'donations':
            loadDonations();
            break;
        case 'maintenance':
            checkMaintenanceStatus();
            break;
    }
});

watch(userSearchQuery, () => {
    const timer = setTimeout(loadUsers, 500);
    return () => clearTimeout(timer);
});

const handleUserAction = async (userId, action, data = {}) => {
    try {
        let finalData = { ...data };

        // If action is ban or mute, prompt for reason
        if (action === 'ban' || action === 'mute' || action === 'tempban' || action === 'tempmute') {
            const reason = await askPrompt(t('admin_modal_action_reason'), t('admin_modal_enter_reason_for', { action }));
            if (reason === null) return; // User cancelled
            finalData.reason = reason;

            if (action === 'tempban' || action === 'tempmute') {
                const duration = await askPrompt(t('modal_duration'), t('modal_enter_mins'), '60', 'number');
                if (duration === null) return;
                finalData.durationMinutes = parseInt(duration) || 60;
            }
        }

        let endpoint = `/api/admin/users/${userId}/${action}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(finalData)
        });
        if (response.ok) {
            showToast(t('admin_toast_action_success'));
            loadUsers();
        } else {
            const err = await response.json();
            showToast(`${t('error_generic')}: ${err.error || t('toast_action_fail')}`, 'error');
        }
    } catch (e) {
        showToast(t('admin_toast_action_fail'), 'error');
    }
};

const spectateGame = (gameId) => {
    router.push(`/game/${gameId}?spectate=true`);
};

const terminateGame = async (gameId) => {
    if (!await askConfirm(t('modal_terminate_game'), t('modal_terminate_confirm'))) return;
    const reason = await askPrompt(t('modal_term_reason'), t('modal_enter_term_reason'), t('modal_admin_intervention'));
    if (reason === null) return;

    try {
        const response = await fetch(`/api/admin/games/${gameId}/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });
        if (response.ok) {
            showToast(t('admin_toast_game_terminated'));
            loadGames();
        }
    } catch (e) {
        showToast(t('admin_toast_game_term_fail'), 'error');
    }
};

const isUserModalOpen = ref(false);
const selectedUser = ref(null);
const editUserData = ref({});

const openUserEdit = (user) => {
    selectedUser.value = user;
    // Ensure all fields exist to avoid reactive issues
    editUserData.value = {
        ...user,
        ban_reason: user.ban_reason || ''
    };
    isUserModalOpen.value = true;
};

const userSessions = ref([]);
const isSessionsModalOpen = ref(false);

const openUserSessions = async (userId) => {
    userSessions.value = await adminStore.fetchUserSessions(userId);
    isSessionsModalOpen.value = true;
};

const terminateSession = async (sessionId) => {
    if (!await askConfirm(t('admin_modal_title'), t('admin_terminate_session_confirm'))) return;
    try {
        await adminStore.terminateSession(sessionId);
        showToast(t('admin_toast_session_terminated'));
        userSessions.value = userSessions.value.filter(s => s.id !== sessionId);
    } catch (e) {
        showToast(e.message, 'error');
    }
};

const selectedDevice = ref(null);
const deviceBanInfo = ref({ banned: false, info: null });
const isDeviceModalOpen = ref(false);

const openDeviceDetails = async (deviceId) => {
    if (!deviceId) {
        showToast('Device ID is missing', 'error');
        return;
    }
    try {
        const [deviceData, banInfo] = await Promise.all([
            adminStore.fetchDeviceDetails(deviceId),
            adminStore.fetchDeviceBanInfo(deviceId)
        ]);

        if (!deviceData || !deviceData.device) {
            showToast('Device not found or data is incomplete', 'error');
            return;
        }
        selectedDevice.value = deviceData;
        deviceBanInfo.value = banInfo;
        isDeviceModalOpen.value = true;
    } catch (e) {
        console.error('Error loading device details:', e);
        showToast('Failed to load device details', 'error');
    }
};

const handleDeviceBanToggle = async () => {
    const deviceId = selectedDevice.value.device.id;
    try {
        if (deviceBanInfo.value.banned) {
            await adminStore.unbanDevice(deviceBanInfo.value.info.id);
            showToast(t('admin_unban_device_success'), 'success');
        } else {
            const confirmed = confirm(t('admin_ban_device_confirm'));
            if (!confirmed) return;
            const reason = prompt(t('admin_modal_action_reason'), 'Hardware ban');
            if (reason === null) return;
            await adminStore.banDevice(deviceId, reason);
            showToast(t('admin_ban_device_success'), 'success');
        }
        // Refresh ban info
        deviceBanInfo.value = await adminStore.fetchDeviceBanInfo(deviceId);
    } catch (e) {
        showToast(e.message, 'error');
    }
};

const saveUserChanges = async () => {
    try {
        await adminStore.updateUser(selectedUser.value.id, editUserData.value);
        showToast(t('admin_toast_user_updated'));
        isUserModalOpen.value = false;
        loadUsers();
    } catch (err) {
        showToast(`${t('error_generic')}: ${err.message}`, 'error');
    }
};

const clones = ref([]);
const loadClones = async () => {
    try {
        const response = await fetch('/api/admin/users/clones');
        if (response.ok) clones.value = await response.json();
    } catch (e) {
        console.error(e);
    }
};

watch(currentTab, (tab) => {
    if (tab === 'users') loadUsers();
    if (tab === 'games') loadGames();
    if (tab === 'donations') loadDonations();
    if (tab === 'audit') loadAuditLog();
    if (tab === 'dashboard') loadActivityData();
    if (tab === 'devices') loadClones();
});

onMounted(async () => {
    await adminStore.fetchDashboardOverview();
    await checkMaintenanceStatus();
    await loadActivityData();
});
</script>

<template>
    <div class="admin-layout min-h-screen bg-[#0a0f1a] text-on-surface flex overflow-hidden font-sans">
        <!-- Sidebar -->
        <aside class="w-72 bg-surface/30 backdrop-blur-2xl border-r border-white/5 flex flex-col shrink-0 z-20">
            <div class="p-8">
                <div class="flex items-center gap-3 mb-2">
                    <div
                        class="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-xl shadow-lg shadow-primary/20">
                        🃏
                    </div>
                    <div>
                        <h2 class="text-xl font-bold text-white leading-tight">Admin</h2>
                        <p class="text-primary text-[10px] font-bold uppercase tracking-widest">{{
                            t('admin_dashboard_title') }}</p>
                    </div>
                </div>
            </div>

            <nav class="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
                <button v-for="item in navItems" :key="item.id" @click="currentTab = item.id" :class="currentTab === item.id
                    ? 'bg-primary/15 text-primary border-primary/20 shadow-sm'
                    : 'text-on-surface-variant hover:bg-white/5 hover:text-white border-transparent'"
                    class="w-full text-left px-5 py-3.5 rounded-2xl transition-all duration-300 flex items-center gap-4 border group">
                    <span class="text-2xl transition-transform group-hover:scale-110">{{ item.icon }}</span>
                    <span class="font-semibold tracking-wide">{{ item.label }}</span>
                    <div v-if="currentTab === item.id" class="ml-auto w-1.5 h-1.5 rounded-full bg-primary shadow-glow">
                    </div>
                </button>
            </nav>

            <div class="p-6 mt-auto border-t border-white/5 bg-black/10">
                <div class="flex items-center gap-3 mb-6 p-3 rounded-2xl bg-white/5 border border-white/5">
                    <div
                        class="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-lg border border-primary/20">
                        👤
                    </div>
                    <div class="min-w-0">
                        <p class="text-sm font-bold text-white truncate">{{ authStore.user?.username }}</p>
                        <p class="text-[10px] text-primary font-bold uppercase">{{ t('admin_role_administrator') }}</p>
                    </div>
                </div>
                <button @click="router.push('/')"
                    class="w-full px-5 py-3.5 rounded-2xl text-on-surface-variant hover:text-white hover:bg-white/5 transition-all flex items-center gap-3 font-semibold">
                    <span class="text-xl">🏠</span> {{ t('admin_nav_back_to_game') }}
                </button>
            </div>
        </aside>

        <!-- Main Content -->
        <main class="flex-1 overflow-y-auto bg-gradient-to-br from-transparent to-primary/5 relative">
            <!-- Background Decoration -->
            <div
                class="fixed top-[-10%] right-[-10%] w-[60%] h-[60%] bg-primary/10 blur-[150px] rounded-full pointer-events-none z-0">
            </div>
            <div
                class="fixed bottom-[-5%] left-[20%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none z-0">
            </div>

            <div class="relative z-10 p-8 lg:p-12 max-w-7xl mx-auto w-full">
                <!-- Tab: Dashboard -->
                <div v-if="currentTab === 'dashboard'" class="space-y-10 animate-fade-in">
                    <header class="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <div class="flex items-center gap-2 mb-2">
                                <span class="w-8 h-[2px] bg-primary"></span>
                                <span class="text-primary text-xs font-bold uppercase tracking-[0.2em]">{{
                                    t('admin_live_overview') }}</span>
                            </div>
                            <h1 class="text-4xl md:text-5xl font-extrabold text-white tracking-tight">{{
                                t('admin_nav_dashboard') }}</h1>
                        </div>
                        <div class="flex items-center gap-3 text-sm font-medium">
                            <span class="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                            <span class="text-on-surface-variant">{{ t('admin_system_status') }}</span>
                            <span class="text-green-500 font-bold uppercase tracking-wider">{{ t('admin_operational')
                            }}</span>
                        </div>
                    </header>

                    <!-- Stat Cards -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div v-for="stat in statCards" :key="stat.label"
                            class="group bg-surface/40 backdrop-blur-xl border border-white/5 p-7 rounded-[2rem] hover:border-primary/40 transition-all duration-500 hover:-translate-y-1 flex flex-col relative overflow-hidden">
                            <div class="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                <span class="text-8xl">{{ stat.icon }}</span>
                            </div>
                            <div class="flex items-center justify-between mb-6 relative">
                                <div
                                    class="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform duration-500">
                                    {{ stat.icon }}
                                </div>
                            </div>
                            <h3 class="text-on-surface-variant text-sm font-bold uppercase tracking-widest">{{
                                stat.label }}</h3>
                            <div class="flex items-end gap-2 mt-2">
                                <p class="text-4xl font-black text-white leading-none">{{ stat.value || 0 }}</p>
                                <span class="text-xs font-bold text-green-500 mb-1 flex items-center gap-0.5"
                                    v-if="stat.growth">
                                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path
                                            d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" />
                                    </svg>
                                    {{ stat.growth }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Main Stats Section -->
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <!-- Activity Chart -->
                        <div
                            class="lg:col-span-2 bg-surface/30 backdrop-blur-xl border border-white/5 p-8 rounded-[2.5rem] flex flex-col min-h-[400px]">
                            <div class="flex items-center justify-between mb-8">
                                <div>
                                    <h3 class="text-xl font-bold text-white tracking-wide">{{
                                        t('admin_chart_reg_traffic') }}</h3>
                                    <p class="text-on-surface-variant text-sm mt-1">{{ t('admin_chart_daily_users') }}
                                    </p>
                                </div>
                                <select v-model="activityPeriod"
                                    class="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-on-surface outline-none cursor-pointer hover:bg-white/10 transition-colors">
                                    <option :value="7">{{ t('admin_period_7d') }}</option>
                                    <option :value="30">{{ t('admin_period_30d') }}</option>
                                </select>
                            </div>

                            <div class="flex-1 flex items-end justify-between gap-3 px-2">
                                <div v-for="(day, idx) in activityData" :key="idx"
                                    class="flex-1 group relative transition-all duration-500"
                                    :style="{ height: (day.height || 5) + '%' }">
                                    <div
                                        class="w-full h-full bg-primary/20 rounded-2xl group-hover:bg-primary/40 transition-all border border-primary/20 shadow-[0_0_20px_rgba(0,191,165,0.1)]">
                                    </div>

                                    <!-- Tooltip -->
                                    <div
                                        class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-surface border border-white/10 px-3 py-1.5 rounded-xl text-xs font-bold shadow-2xl opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100 pointer-events-none z-30 whitespace-nowrap">
                                        {{ day.value }} {{ t('admin_chart_users') }}
                                    </div>
                                </div>
                            </div>

                            <!-- X-Axis Labels -->
                            <div class="flex justify-between mt-6 px-2">
                                <span v-for="(day, idx) in activityData" :key="idx"
                                    class="text-[10px] text-on-surface-variant font-bold uppercase tracking-tighter w-8 text-center">{{
                                        day.label }}</span>
                            </div>
                        </div>

                        <!-- Side Info -->
                        <div class="space-y-6">
                            <div
                                class="bg-gradient-to-br from-primary/20 to-transparent border border-primary/30 p-8 rounded-[2.5rem] relative overflow-hidden group">
                                <div class="relative z-10">
                                    <h3 class="text-xl font-black text-white mb-2 italic">DURAK ONLINE</h3>
                                    <p class="text-on-surface/80 text-sm leading-relaxed mb-6">{{
                                        t('admin_welcome_text') }}</p>
                                    <button @click="currentTab = 'maintenance'"
                                        class="w-full bg-white text-black font-black py-4 rounded-2xl hover:bg-primary hover:text-white transition-all duration-300">
                                        {{ t('admin_nav_maintenance').toUpperCase() }}
                                    </button>
                                </div>
                                <div
                                    class="absolute -right-10 -bottom-10 opacity-10 group-hover:scale-110 transition-transform duration-500">
                                    <span class="text-[200px]">🛠️</span>
                                </div>
                            </div>

                            <div class="bg-surface/30 backdrop-blur-xl border border-white/5 p-8 rounded-[2.5rem]">
                                <h3 class="text-sm font-bold text-white uppercase tracking-widest mb-6">{{
                                    t('admin_quick_actions') }}</h3>
                                <div class="grid grid-cols-2 gap-4">
                                    <button @click="currentTab = 'users'"
                                        class="aspect-square bg-white/5 rounded-2xl border border-white/5 flex flex-col items-center justify-center gap-3 hover:bg-primary/10 hover:border-primary/30 transition-all group">
                                        <span class="text-3xl group-hover:scale-110 transition-transform">🔍</span>
                                        <span class="text-xs font-bold opacity-60">{{ t('admin_quick_find_user')
                                            }}</span>
                                    </button>
                                    <button @click="currentTab = 'maintenance'"
                                        class="aspect-square bg-white/5 rounded-2xl border border-white/5 flex flex-col items-center justify-center gap-3 hover:bg-primary/10 hover:border-primary/30 transition-all group">
                                        <span class="text-3xl group-hover:scale-110 transition-transform">📢</span>
                                        <span class="text-xs font-bold opacity-60">{{ t('admin_quick_broadcast')
                                            }}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tab: Inbox -->
                <div v-else-if="currentTab === 'inbox'" class="space-y-10 animate-fade-in">
                    <header class="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <div class="flex items-center gap-2 mb-2">
                                <span class="w-8 h-[2px] bg-primary"></span>
                                <span class="text-primary text-xs font-bold uppercase tracking-[0.2em]">MESSAGING</span>
                            </div>
                            <h1 class="text-4xl md:text-5xl font-extrabold text-white tracking-tight">{{
                                t('admin_inbox_send_title') }}</h1>
                        </div>
                    </header>

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div class="bg-surface/30 backdrop-blur-xl border border-white/5 p-8 rounded-[2.5rem]">
                            <h3 class="text-xl font-bold text-white mb-6">{{ t('admin_inbox_send_title') }}</h3>

                            <div class="space-y-6">
                                <div class="flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/5">
                                    <label class="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" v-model="inboxIsBroadcast"
                                            class="w-5 h-5 rounded border-white/10 bg-black/20 text-primary">
                                        <span class="font-bold">{{ t('admin_inbox_broadcast_label') }}</span>
                                    </label>
                                </div>

                                <div v-if="!inboxIsBroadcast" class="relative">
                                    <label
                                        class="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">{{
                                        t('admin_inbox_target_label') }}</label>

                                    <div class="flex gap-2">
                                        <div class="relative flex-1">
                                            <input v-model="inboxTargetUserId" type="number"
                                                :placeholder="t('admin_inbox_placeholder_user_id')"
                                                class="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all">
                                            <div v-if="inboxTargetUsername"
                                                class="absolute right-4 top-1/2 -translate-y-1/2 text-primary font-bold text-xs uppercase">
                                                @{{ inboxTargetUsername }}
                                            </div>
                                        </div>
                                        <button @click="showUserSelector = !showUserSelector"
                                            class="bg-white/5 hover:bg-white/10 border border-white/10 px-4 rounded-xl transition-all">
                                            🔍
                                        </button>
                                    </div>

                                    <!-- User Search Dropdown -->
                                    <div v-if="showUserSelector"
                                        class="absolute z-30 left-0 right-0 mt-2 bg-surface/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
                                        <div class="p-3 border-b border-white/5">
                                            <input v-model="inboxSearchQuery" @input="searchUsersForInbox" type="text"
                                                autoFocus :placeholder="t('admin_inbox_search_user_placeholder')"
                                                class="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none">
                                        </div>
                                        <div class="max-h-60 overflow-y-auto">
                                            <div v-if="inboxSearchResults.length === 0"
                                                class="p-4 text-center text-xs text-on-surface-variant">
                                                {{ t('leaderboard_empty') }}
                                            </div>
                                            <button v-for="user in inboxSearchResults" :key="user.id"
                                                @click="selectUserForInbox(user)"
                                                class="w-full text-left px-4 py-3 hover:bg-primary/20 flex items-center justify-between border-b border-white/5 last:border-0">
                                                <div>
                                                    <span class="font-bold text-white text-sm">{{ user.username
                                                        }}</span>
                                                    <span class="ml-2 text-[10px] text-on-surface-variant">ID: {{
                                                        user.id }}</span>
                                                </div>
                                                <span class="text-xs text-primary font-bold">SELECT</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label
                                        class="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">{{
                                        t('admin_inbox_content_label') }}</label>
                                    <textarea v-model="inboxMessage" rows="5"
                                        :placeholder="t('admin_inbox_placeholder_content')"
                                        class="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all"></textarea>
                                </div>

                                <button @click="sendMessage"
                                    class="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95">
                                    {{ t('admin_inbox_send_btn') }}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tab: Users -->
                <div v-else-if="currentTab === 'users'" class="space-y-10 animate-fade-in">
                    <header class="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <div class="flex items-center gap-2 mb-2">
                                <span class="w-8 h-[2px] bg-primary"></span>
                                <span class="text-primary text-xs font-bold uppercase tracking-[0.2em]">{{
                                    t('admin_nav_users') }}</span>
                            </div>
                            <h1 class="text-4xl md:text-5xl font-extrabold text-white tracking-tight">{{
                                t('admin_user_management') }}</h1>
                        </div>
                        <div class="relative max-w-md w-full">
                            <input v-model="userSearchQuery" type="text" :placeholder="t('admin_search_placeholder')"
                                class="w-full bg-surface/40 border border-white/5 rounded-2xl px-5 py-4 text-sm text-white focus:border-primary outline-none backdrop-blur-xl transition-all">
                            <span class="absolute right-5 top-1/2 -translate-y-1/2 opacity-30 text-xl">🔍</span>
                        </div>
                    </header>

                    <div class="bg-surface/30 backdrop-blur-xl border border-white/5 rounded-[2.5rem] overflow-hidden">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left">
                                <thead>
                                    <tr class="border-b border-white/5 bg-black/5">
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_table_user') }}</th>
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_table_stats') }}</th>
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_table_status') }}</th>
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_table_actions') }}</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-white/5">
                                    <tr v-for="user in users" :key="user.id" class="hover:bg-white/5 transition-colors">
                                        <td class="px-8 py-6">
                                            <div class="flex items-center gap-4">
                                                <div
                                                    class="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary">
                                                    {{ user.username ? user.username[0].toUpperCase() : '?' }}
                                                </div>
                                                <div>
                                                    <div class="flex items-center gap-1.5">
                                                        <p class="font-bold text-white tracking-wide">{{ user.username
                                                            }}</p>
                                                        <span v-if="user.is_verified" class="text-blue-400"
                                                            :title="t('admin_status_verified')">✅</span>
                                                        <span v-if="user.is_admin"
                                                            class="text-orange-400 text-[10px] font-black uppercase bg-orange-400/10 px-1.5 py-0.5 rounded border border-orange-400/20">{{
                                                                t('admin_status_admin') }}</span>
                                                    </div>
                                                    <p
                                                        class="text-[10px] text-on-surface-variant font-mono uppercase tracking-tighter mt-0.5">
                                                        ID: {{ user.id }} • {{ t('admin_user_rating') }}: {{ user.rating
                                                        }}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-8 py-6">
                                            <div class="flex items-center gap-6">
                                                <div class="text-center">
                                                    <p class="text-xs font-bold text-on-surface-variant uppercase mb-1">
                                                        {{ t('admin_user_wins') }}</p>
                                                    <p class="text-green-500 font-black text-lg">{{ user.wins }}</p>
                                                </div>
                                                <div class="text-center">
                                                    <p class="text-xs font-bold text-on-surface-variant uppercase mb-1">
                                                        {{ t('admin_user_losses') }}</p>
                                                    <p class="text-red-500 font-black text-lg">{{ user.losses }}</p>
                                                </div>
                                                <div class="text-center">
                                                    <p class="text-xs font-bold text-on-surface-variant uppercase mb-1">
                                                        {{ t('admin_user_coins') }}</p>
                                                    <p class="text-yellow-500 font-black text-lg">💰{{ user.coins }}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-8 py-6">
                                            <div class="space-y-1.5">
                                                <div v-if="user.is_banned"
                                                    class="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-black uppercase">
                                                    <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span> {{
                                                        t('admin_status_banned') }}
                                                </div>
                                                <div v-else-if="user.is_muted"
                                                    class="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-500 text-[10px] font-black uppercase">
                                                    <span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span> {{
                                                        t('admin_status_muted') }}
                                                </div>
                                                <div v-else
                                                    class="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/30 text-green-500 text-[10px] font-black uppercase">
                                                    <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span> {{
                                                        t('admin_status_active') }}
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-8 py-6">
                                            <div class="flex items-center gap-2">
                                                <button v-if="!user.is_verified"
                                                    @click="handleUserAction(user.id, 'verify')"
                                                    class="p-2.5 hover:bg-blue-500/10 text-blue-400 rounded-xl transition-all"
                                                    :title="t('admin_verify_user')">✅</button>
                                                <button v-else @click="handleUserAction(user.id, 'unverify')"
                                                    class="p-2.5 hover:bg-gray-500/10 text-gray-400 rounded-xl transition-all"
                                                    :title="t('admin_unverify_user')">❌</button>

                                                <button @click="goToInboxWithUser(user)"
                                                    class="p-2.5 hover:bg-primary/10 text-primary rounded-xl transition-all"
                                                    :title="t('admin_inbox_send_title')">📨</button>

                                                <button v-if="!user.is_banned"
                                                    @click="handleUserAction(user.id, 'tempban')"
                                                    class="p-2.5 hover:bg-red-500/10 text-red-400 rounded-xl transition-all"
                                                    :title="t('admin_temp_ban_user')">⏳🚫</button>
                                                <button v-if="!user.is_banned" @click="handleUserAction(user.id, 'ban')"
                                                    class="p-2.5 hover:bg-red-500/10 text-red-500 rounded-xl transition-all"
                                                    :title="t('admin_perm_ban_user')">🚫</button>
                                                <button v-else @click="handleUserAction(user.id, 'unban')"
                                                    class="p-2.5 hover:bg-green-500/10 text-green-500 rounded-xl transition-all"
                                                    :title="t('admin_unban_user')">🔓</button>

                                                <button v-if="!user.is_muted"
                                                    @click="handleUserAction(user.id, 'tempmute')"
                                                    class="p-2.5 hover:bg-orange-500/10 text-orange-300 rounded-xl transition-all"
                                                    :title="t('admin_temp_mute_user')">⏳🔇</button>
                                                <button v-if="!user.is_muted" @click="handleUserAction(user.id, 'mute')"
                                                    class="p-2.5 hover:bg-orange-500/10 text-orange-400 rounded-xl transition-all"
                                                    :title="t('admin_perm_mute_user')">🔇</button>
                                                <button v-else @click="handleUserAction(user.id, 'unmute')"
                                                    class="p-2.5 hover:bg-green-500/10 text-green-500 rounded-xl transition-all"
                                                    :title="t('admin_unmute_user')">🔊</button>

                                                <div class="w-px h-6 bg-white/5 mx-2"></div>

                                                <button @click="openUserEdit(user)"
                                                    class="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                                                    {{ t('admin_btn_edit') }}
                                                </button>
                                                <button @click="openUserSessions(user.id)"
                                                    class="p-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all"
                                                    :title="t('admin_view_sessions')">🛡️</button>
                                                <button @click="openDeviceDetails(user.device_id)"
                                                    class="p-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all"
                                                    :title="t('admin_view_device')">📱</button>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Tab: Audit Log -->
                <div v-else-if="currentTab === 'audit'" class="space-y-10 animate-fade-in">
                    <header class="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <div class="flex items-center gap-2 mb-2">
                                <span class="w-8 h-[2px] bg-primary"></span>
                                <span class="text-primary text-xs font-bold uppercase tracking-[0.2em]">{{
                                    t('admin_nav_audit') }}</span>
                            </div>
                            <h1 class="text-4xl md:text-5xl font-extrabold text-white tracking-tight">{{
                                t('admin_nav_audit') }}</h1>
                        </div>
                    </header>

                    <div class="bg-surface/30 backdrop-blur-xl border border-white/5 rounded-[2.5rem] overflow-hidden">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left">
                                <thead>
                                    <tr class="border-b border-white/5 bg-black/5">
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_audit_time') }}</th>
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_audit_admin') }}</th>
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_audit_action') }}</th>
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_audit_target') }}</th>
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_audit_details') }}</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-white/5">
                                    <tr v-for="log in auditLogs.rows" :key="log.id"
                                        class="hover:bg-white/5 transition-colors">
                                        <td class="px-8 py-6">
                                            <p class="text-xs font-mono text-on-surface-variant whitespace-nowrap">{{
                                                new Date(log.timestamp).toLocaleString() }}</p>
                                        </td>
                                        <td class="px-8 py-6">
                                            <div class="flex items-center gap-2">
                                                <span class="w-2 h-2 rounded-full bg-primary shadow-glow"></span>
                                                <p class="text-sm font-bold text-white">{{ log.admin_username }}</p>
                                            </div>
                                        </td>
                                        <td class="px-8 py-6">
                                            <span
                                                class="px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-wider">
                                                {{ log.action_type }}
                                            </span>
                                        </td>
                                        <td class="px-8 py-6">
                                            <p class="text-sm text-on-surface-variant" v-if="log.target_username">{{
                                                log.target_username }} <span class="text-[10px] opacity-20">#{{
                                                    log.target_user_id }}</span></p>
                                            <p class="text-sm opacity-20" v-else>-</p>
                                        </td>
                                        <td class="px-8 py-6 max-w-xs">
                                            <p class="text-xs text-on-surface-variant leading-relaxed break-words">{{
                                                log.reason || '-' }}</p>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <!-- Pagination -->
                        <div class="px-8 py-6 flex items-center justify-between bg-black/5 border-t border-white/5">
                            <p class="text-xs font-bold text-on-surface-variant uppercase">{{ t('admin_audit_total', {
                                count: auditLogs.rowCount
                            }) }}</p>
                            <div class="flex gap-2">
                                <button @click="auditPage--; loadAuditLogs()" :disabled="auditPage === 0"
                                    class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold uppercase transition-all hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none">{{
                                        t('btn_prev') }}</button>
                                <div
                                    class="px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-bold flex items-center">
                                    {{ auditPage + 1 }}</div>
                                <button @click="auditPage++; loadAuditLogs()"
                                    :disabled="(auditPage + 1) * 25 >= auditLogs.rowCount"
                                    class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold uppercase transition-all hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none">{{
                                        t('btn_next') }}</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tab: Games -->
                <div v-else-if="currentTab === 'games'" class="space-y-10 animate-fade-in">
                    <header class="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <div class="flex items-center gap-2 mb-2">
                                <span class="w-8 h-[2px] bg-primary"></span>
                                <span class="text-primary text-xs font-bold uppercase tracking-[0.2em]">{{
                                    t('admin_nav_games') }}</span>
                            </div>
                            <h1 class="text-4xl md:text-5xl font-extrabold text-white tracking-tight">{{
                                t('admin_games_active_title') }}</h1>
                        </div>
                        <button @click="loadGames"
                            class="px-6 py-3 bg-primary text-on-primary font-black rounded-2xl flex items-center gap-3 active:scale-95 transition-all">
                            <span>🔄</span> {{ t('refresh_list') }}
                        </button>
                    </header>

                    <!-- Active Games Grid -->
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div v-for="game in activeGames" :key="game.id"
                            class="bg-surface/30 backdrop-blur-xl border border-white/5 p-8 rounded-[2.5rem] flex flex-col group relative overflow-hidden">
                            <div class="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                <span class="text-8xl">🎲</span>
                            </div>
                            <div class="flex items-center justify-between mb-6">
                                <div
                                    class="px-3 py-1 rounded-lg bg-primary/10 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-wider">
                                    {{ game.status }}
                                </div>
                                <p class="text-[10px] font-mono text-on-surface-variant">#{{ game.id }}</p>
                            </div>

                            <h3 class="text-xl font-bold text-white mb-2">{{ t('admin_games_lobby', {
                                name:
                                    game.hostName
                            }) }}</h3>
                            <p class="text-sm text-on-surface-variant mb-6">{{ t('admin_games_players') }} <span
                                    class="text-white font-bold">{{ game.playerCount }} / {{ game.maxPlayers }}</span>
                            </p>

                            <div class="space-y-2 mb-8">
                                <div v-for="p in game.players" :key="p.id"
                                    class="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-white/5 border border-white/5">
                                    <span class="font-bold text-white/80">{{ p.name }}</span>
                                    <span v-if="p.isGuest"
                                        class="text-[9px] uppercase font-black opacity-30 tracking-tight">{{
                                            t('admin_status_guest') }}</span>
                                    <span v-else class="text-[9px] uppercase font-black text-primary tracking-tight">{{
                                        t('admin_status_user') }}</span>
                                </div>
                            </div>

                            <div class="mt-auto pt-4 flex gap-3">
                                <button @click="spectateGame(game.id)"
                                    class="flex-1 py-4 bg-primary text-on-primary font-black rounded-2xl hover:bg-primary/80 transition-all flex items-center justify-center gap-2">
                                    <span>👁️</span> {{ t('admin_btn_spectate') }}
                                </button>
                                <button @click="terminateGame(game.id)"
                                    class="px-4 py-4 bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 border border-red-500/30 rounded-2xl transition-all">
                                    <span>🗑️</span>
                                </button>
                            </div>
                        </div>
                        <div v-if="activeGames.length === 0"
                            class="col-span-full py-20 bg-white/5 rounded-[2.5rem] border border-white/5 border-dashed flex flex-col items-center justify-center">
                            <span class="text-6xl mb-4 opacity-20">📭</span>
                            <p class="text-lg font-bold text-white/30 uppercase tracking-widest">{{
                                t('admin_games_no_active') }}</p>
                        </div>
                    </div>

                    <!-- Recent Games Table -->
                    <div class="mt-16 space-y-6">
                        <h2 class="text-2xl font-bold text-white tracking-tight">{{ t('admin_games_recent') }}</h2>
                        <div
                            class="bg-surface/30 backdrop-blur-xl border border-white/5 rounded-[2.5rem] overflow-hidden">
                            <div class="overflow-x-auto">
                                <table class="w-full text-left">
                                    <thead>
                                        <tr class="border-b border-white/5 bg-black/5">
                                            <th
                                                class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                                {{ t('admin_table_id_type') }}</th>
                                            <th
                                                class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                                {{ t('admin_table_duration') }}</th>
                                            <th
                                                class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                                {{ t('admin_games_players') }}</th>
                                            <th
                                                class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                                {{ t('admin_table_result') }}</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-white/5">
                                        <tr v-for="game in gameHistory.rows" :key="game.id"
                                            class="hover:bg-white/5 transition-colors">
                                            <td class="px-8 py-6">
                                                <p class="text-sm font-bold text-white">#{{ game.id }}</p>
                                                <p
                                                    class="text-[10px] text-primary font-black uppercase tracking-widest mt-0.5">
                                                    {{ game.game_type }}</p>
                                            </td>
                                            <td class="px-8 py-6">
                                                <p class="text-sm text-on-surface-variant">{{
                                                    Math.floor(game.duration_seconds / 60) }}m {{ game.duration_seconds
                                                        % 60 }}s</p>
                                                <p class="text-[10px] opacity-40">{{ new
                                                    Date(game.end_time).toLocaleString() }}</p>
                                            </td>
                                            <td class="px-8 py-6">
                                                <p class="text-sm text-on-surface-variant">{{ t('admin_game_winner', {
                                                    name: game.winner_username || t('admin_game_draw')
                                                }) }}</p>
                                                <p class="text-xs text-on-surface-variant/60">{{ t('admin_game_loser', {
                                                    name: game.loser_username || '-'
                                                }) }}</p>
                                            </td>
                                            <td class="px-8 py-6">
                                                <div class="flex items-center gap-2">
                                                    <span class="w-2 h-2 rounded-full bg-green-500"></span>
                                                    <span class="text-xs font-bold text-white/50 uppercase">{{
                                                        t('admin_status_finished') }}</span>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr v-if="gameHistory.rows.length === 0">
                                            <td colspan="4"
                                                class="px-8 py-10 text-center text-on-surface-variant/30 font-bold uppercase tracking-widest">
                                                {{ t('admin_no_game_history') }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <!-- Pagination -->
                            <div class="px-8 py-6 flex items-center justify-between bg-black/5 border-t border-white/5">
                                <p class="text-xs font-bold text-on-surface-variant uppercase">{{ t('admin_total_games',
                                    { count: gameHistory.rowCount }) }}</p>
                                <div class="flex gap-2">
                                    <button @click="gamePage--; loadGames()" :disabled="gamePage === 0"
                                        class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold uppercase transition-all hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none">{{
                                            t('btn_prev') }}</button>
                                    <div
                                        class="px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-bold flex items-center">
                                        {{ gamePage + 1 }}</div>
                                    <button @click="gamePage++; loadGames()"
                                        :disabled="(gamePage + 1) * 25 >= gameHistory.rowCount"
                                        class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold uppercase transition-all hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none">{{
                                            t('btn_next') }}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tab: System -->
                <div v-else-if="currentTab === 'system'" class="space-y-10 animate-fade-in">
                    <header class="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <div class="flex items-center gap-2 mb-2">
                                <span class="w-8 h-[2px] bg-primary"></span>
                                <span class="text-primary text-xs font-bold uppercase tracking-[0.2em]">{{
                                    t('admin_system_infrastructure') }}</span>
                            </div>
                            <h1 class="text-4xl md:text-5xl font-extrabold text-white tracking-tight">{{
                                t('admin_nav_system') }}</h1>
                        </div>
                        <button @click="loadSystemSockets"
                            class="px-6 py-3 bg-white/5 border border-white/10 text-white font-black rounded-2xl flex items-center gap-3 hover:bg-white/10 transition-all">
                            <span>🔄</span> {{ t('refresh_list') }}
                        </button>
                    </header>

                    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        <div
                            class="bg-surface/30 backdrop-blur-xl border border-white/5 p-8 rounded-[2rem] flex flex-col items-center justify-center text-center">
                            <p class="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">{{
                                t('admin_system_active_sockets') }}</p>
                            <p class="text-5xl font-black text-white">{{ systemSockets.totalConnections }}</p>
                        </div>
                        <div
                            class="bg-surface/30 backdrop-blur-xl border border-white/5 p-8 rounded-[2rem] flex flex-col items-center justify-center text-center">
                            <p class="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                                {{ t('admin_system_authenticated') }}</p>
                            <p class="text-5xl font-black text-primary">{{systemSockets.connections.filter(c =>
                                c.userId).length}}</p>
                        </div>
                    </div>

                    <div class="bg-surface/30 backdrop-blur-xl border border-white/5 rounded-[2.5rem] overflow-hidden">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left">
                                <thead>
                                    <tr class="border-b border-white/5 bg-black/5">
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_table_user') }}</th>
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_table_socket_id') }}</th>
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_table_ip') }}</th>
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_table_device') }}</th>
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_table_actions') }}</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-white/5">
                                    <tr v-for="conn in systemSockets.connections" :key="conn.socketId"
                                        class="hover:bg-white/5 transition-colors">
                                        <td class="px-8 py-6">
                                            <div class="flex items-center gap-3">
                                                <span
                                                    :class="conn.userId ? 'text-primary' : 'text-on-surface-variant/40'"
                                                    class="text-xl">
                                                    {{ conn.userId ? '👤' : '👻' }}
                                                </span>
                                                <div>
                                                    <p class="text-sm font-bold text-white">{{ conn.username }}</p>
                                                    <p v-if="conn.userId"
                                                        class="text-[10px] text-primary font-mono uppercase">ID: {{
                                                            conn.userId }}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-8 py-6 font-mono text-[10px] text-on-surface-variant opacity-60">
                                            {{ conn.socketId }}
                                        </td>
                                        <td class="px-8 py-6 font-mono text-xs text-on-surface-variant">
                                            {{ conn.ip === '::1' ? '127.0.0.1' : conn.ip.replace('::ffff:', '') }}
                                        </td>
                                        <td class="px-8 py-6 max-w-[200px]">
                                            <p class="text-[10px] text-on-surface-variant truncate"
                                                :title="conn.userAgent">
                                                {{ conn.userAgent }}</p>
                                        </td>
                                        <td class="px-8 py-6">
                                            <button @click="disconnectSocket(conn.socketId)"
                                                class="px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 rounded-xl text-[10px] font-black uppercase transition-all">
                                                {{ t('admin_btn_kick') }}
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Tab: Donations -->
                <div v-else-if="currentTab === 'donations'" class="space-y-10 animate-fade-in">
                    <header class="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <div class="flex items-center gap-2 mb-2">
                                <span class="w-8 h-[2px] bg-primary"></span>
                                <span class="text-primary text-xs font-bold uppercase tracking-[0.2em]">{{
                                    t('admin_finances_title') }}</span>
                            </div>
                            <h1 class="text-4xl md:text-5xl font-extrabold text-white tracking-tight">{{
                                t('admin_nav_donations') }}
                            </h1>
                        </div>
                        <div class="bg-primary/10 border border-primary/30 px-6 py-4 rounded-2xl">
                            <p class="text-[10px] font-black uppercase text-primary tracking-widest mb-1">{{
                                t('admin_total_stars') }}
                            </p>
                            <p class="text-3xl font-black text-white">⭐️ {{ donations.totalAmount?.toFixed(0) }}</p>
                        </div>
                    </header>

                    <div class="bg-surface/30 backdrop-blur-xl border border-white/5 rounded-[2.5rem] overflow-hidden">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left">
                                <thead>
                                    <tr class="border-b border-white/5 bg-black/5">
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_audit_time') }}</th>
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_table_user') }}</th>
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('bet_amount_label') }}</th>
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_table_tx_id') }}</th>
                                        <th
                                            class="px-8 py-6 text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                                            {{ t('admin_table_reward') }}</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-white/5">
                                    <tr v-for="donate in donations.rows" :key="donate.id"
                                        class="hover:bg-white/5 transition-colors">
                                        <td class="px-8 py-6">
                                            <p class="text-xs font-mono text-on-surface-variant">{{ new
                                                Date(donate.timestamp).toLocaleString() }}</p>
                                        </td>
                                        <td class="px-8 py-6">
                                            <div class="flex items-center gap-2">
                                                <p class="text-sm font-bold text-white">{{ donate.username }}</p>
                                                <span class="text-[10px] opacity-20 font-mono">#{{ donate.user_id
                                                    }}</span>
                                            </div>
                                        </td>
                                        <td class="px-8 py-6">
                                            <p class="text-lg font-black text-yellow-500">⭐️ {{ donate.amount.toFixed(0)
                                                }}</p>
                                        </td>
                                        <td class="px-8 py-6">
                                            <p class="text-[10px] font-mono text-on-surface-variant opacity-60">{{
                                                donate.transaction_id }}</p>
                                        </td>
                                        <td class="px-8 py-6">
                                            <p class="text-xs text-primary font-bold">{{ donate.reward_description ||
                                                t('admin_stars_purchase') }}</p>
                                        </td>
                                    </tr>
                                    <tr v-if="donations.rows.length === 0">
                                        <td colspan="5"
                                            class="px-8 py-10 text-center text-on-surface-variant/30 font-bold uppercase tracking-widest">
                                            {{ t('admin_no_donations_found') }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <!-- Pagination -->
                        <div class="px-8 py-6 flex items-center justify-between bg-black/5 border-t border-white/5">
                            <p class="text-xs font-bold text-on-surface-variant uppercase">{{ t('admin_total_records', {
                                count: donations.rowCount
                            }) }}</p>
                            <div class="flex gap-2">
                                <button @click="donationPage--; loadDonations()" :disabled="donationPage === 0"
                                    class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold uppercase transition-all hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none">{{
                                        t('btn_prev') }}</button>
                                <div
                                    class="px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-bold flex items-center">
                                    {{ donationPage + 1 }}</div>
                                <button @click="donationPage++; loadDonations()"
                                    :disabled="(donationPage + 1) * 25 >= donations.rowCount"
                                    class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold uppercase transition-all hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none">{{
                                        t('btn_next') }}</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tab: Maintenance -->
                <div v-else-if="currentTab === 'maintenance'" class="space-y-10 animate-fade-in">
                    <header>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="w-8 h-[2px] bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></span>
                            <span class="text-red-500 text-xs font-black uppercase tracking-[0.2em]">{{
                                t('admin_maint_priority') }}</span>
                        </div>
                        <h1 class="text-4xl md:text-5xl font-extrabold text-white tracking-tight">{{
                            t('admin_nav_maintenance') }}</h1>
                    </header>
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div
                            class="bg-surface/30 backdrop-blur-xl border border-white/5 p-8 rounded-[2.5rem] space-y-8 relative overflow-hidden group">
                            <div class="flex items-center justify-between relative z-10">
                                <h3 class="text-xl font-bold text-white">{{ t('admin_maint_mode') }}</h3>
                                <div :class="isMaintenanceEnabled ? 'bg-red-500/20 text-red-500 border-red-500/30' : 'bg-green-500/20 text-green-500 border-green-500/30'"
                                    class="px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest animate-pulse">
                                    {{ isMaintenanceEnabled ? t('admin_status_active') : t('admin_status_banned') }}
                                </div>
                            </div>
                            <p class="text-on-surface-variant text-sm leading-relaxed relative z-10">
                                {{ t('admin_maint_desc') }}
                            </p>
                            <div v-if="!isMaintenanceEnabled" class="space-y-5 relative z-10">
                                <div class="space-y-2">
                                    <label
                                        class="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] px-1">{{
                                            t('admin_label_display_msg') }}</label>
                                    <input v-model="maintenanceMessage" type="text"
                                        :placeholder="t('admin_modal_enter_reason_for', { action: 'maintenance' })"
                                        class="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-sm text-white focus:border-primary outline-none transition-all placeholder:opacity-20">
                                </div>
                                <div class="space-y-2">
                                    <label
                                        class="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] px-1">{{
                                            t('admin_label_mins_lock') }}</label>
                                    <input v-model="maintenanceMinutes" type="number"
                                        class="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-sm text-white focus:border-primary outline-none transition-all">
                                </div>
                                <button @click="handleEnableMaintenance" :disabled="processingMaintenance"
                                    class="w-full py-5 bg-red-500 text-white font-black rounded-3xl hover:bg-red-600 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-red-500/20">
                                    {{ processingMaintenance ? t('admin_processing') : t('admin_btn_initiate_lockdown')
                                    }}
                                </button>
                            </div>
                            <div v-else class="space-y-6 relative z-10">
                                <div class="p-6 bg-white/5 rounded-2xl border border-white/5 backdrop-blur-md">
                                    <p
                                        class="text-[10px] text-on-surface-variant mb-2 uppercase font-black tracking-widest">
                                        {{ t('admin_active_notice') }}</p>
                                    <p class="text-lg text-white font-medium">"{{ currentMaintenanceMessage }}"</p>
                                </div>
                                <button @click="handleDisableMaintenance" :disabled="processingMaintenance"
                                    class="w-full py-5 bg-green-500 text-white font-black rounded-3xl hover:bg-green-600 active:scale-[0.98] transition-all disabled:opacity-50">
                                    {{ processingMaintenance ? t('admin_processing') : t('admin_btn_restore_access') }}
                                </button>
                            </div>
                            <div
                                class="absolute -right-20 -bottom-20 text-[240px] opacity-[0.02] pointer-events-none group-hover:scale-110 transition-transform duration-1000">
                                🛡️</div>
                        </div>
                        <div
                            class="bg-surface/30 backdrop-blur-xl border border-white/5 p-8 rounded-[2.5rem] space-y-8 relative overflow-hidden group">
                            <h3 class="text-xl font-bold text-white relative z-10">{{ t('admin_global_broadcast') }}
                            </h3>
                            <p class="text-on-surface-variant text-sm leading-relaxed relative z-10">
                                {{ t('admin_broadcast_desc') }}
                            </p>
                            <div class="space-y-6 relative z-10">
                                <div class="space-y-2">
                                    <label
                                        class="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] px-1">{{
                                            t('admin_label_announcement') }}</label>
                                    <textarea v-model="broadcastText" rows="4"
                                        :placeholder="t('admin_placeholder_citizens')"
                                        class="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-sm text-white focus:border-primary outline-none transition-all resize-none placeholder:opacity-20"></textarea>
                                </div>
                                <div class="grid grid-cols-4 gap-3">
                                    <button v-for="type in ['info', 'success', 'warning', 'error']" :key="type"
                                        @click="broadcastType = type"
                                        :class="broadcastType === type ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'bg-white/5 text-on-surface-variant border border-white/5'"
                                        class="py-3 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all hover:bg-white/10">
                                        {{ t('admin_broadcast_type_' + type) }}
                                    </button>
                                </div>
                                <button @click="handleBroadcast"
                                    class="w-full py-5 bg-white text-black font-black rounded-3xl hover:bg-primary hover:text-white active:scale-[0.98] transition-all shadow-xl">
                                    {{ t('admin_btn_send_signal') }}
                                </button>
                            </div>
                            <div
                                class="absolute -right-20 -bottom-20 text-[240px] opacity-[0.02] pointer-events-none group-hover:scale-110 transition-transform duration-1000">
                                📡</div>
                        </div>
                    </div>
                </div>

                <!-- Tab: Devices (Multi-accounts) -->
                <div v-else-if="currentTab === 'devices'" class="space-y-10 animate-fade-in">
                    <header>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="w-8 h-[2px] bg-primary"></span>
                            <span class="text-primary text-xs font-bold uppercase tracking-[0.2em]">{{
                                t('admin_nav_devices') }}</span>
                        </div>
                        <h1 class="text-4xl md:text-5xl font-extrabold text-white tracking-tight">{{
                            t('admin_clones_title') }}</h1>
                        <p class="text-on-surface-variant mt-2">{{ t('admin_clones_subtitle') }}</p>
                    </header>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div v-for="device in clones" :key="device.deviceId"
                            class="bg-surface/30 backdrop-blur-xl border border-white/5 p-6 rounded-3xl hover:border-primary/30 transition-all group relative overflow-hidden">
                            <div class="flex items-start justify-between mb-4">
                                <div class="flex items-center gap-4">
                                    <div
                                        class="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                                        📱
                                    </div>
                                    <div>
                                        <p class="text-xs font-black text-primary uppercase tracking-widest">{{
                                            device.deviceId ? device.deviceId.slice(0, 12) : '???' }}...</p>
                                        <h4 class="text-xl font-bold text-white">{{ t('admin_clones_count', {
                                            count:
                                                device.count
                                        }) }}</h4>
                                    </div>
                                </div>
                                <button @click="openDeviceDetails(device.deviceId)"
                                    class="px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl text-xs font-bold hover:bg-primary hover:text-white transition-all">
                                    {{ t('admin_btn_details') }}
                                </button>
                            </div>

                            <div class="space-y-2">
                                <div v-for="(username, index) in device.usernames" :key="index"
                                    class="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                                    <span class="text-sm font-medium text-white">{{ username }}</span>
                                    <button @click="currentTab = 'users'; userSearchQuery = username"
                                        class="text-[10px] text-on-surface-variant hover:text-primary transition-colors">{{
                                            t('admin_btn_go_to_user') }}
                                        🔍</button>
                                </div>
                            </div>
                        </div>

                        <div v-if="clones.length === 0" class="col-span-full py-20 text-center">
                            <div class="text-6xl mb-4 opacity-10">🕵️‍♂️</div>
                            <p class="text-on-surface-variant font-bold uppercase tracking-widest">{{
                                t('admin_clones_not_found') }}</p>
                        </div>
                    </div>
                </div>

                <!-- Placeholder for other tabs -->
                <div v-else class="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
                    <div class="text-[120px] mb-8 animate-bounce opacity-20">🪄</div>
                    <h2 class="text-2xl font-black text-white mb-2">{{ t('admin_mismatch_title') || "Wait, what's this?"
                        }}</h2>
                    <p class="text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                        {{ t('admin_mismatch_desc', { tab: currentTab }) }}
                    </p>
                    <button @click="currentTab = 'dashboard'"
                        class="mt-8 px-8 py-3 bg-primary/10 border border-primary/20 text-primary font-bold rounded-xl hover:bg-primary hover:text-on-primary transition-all">
                        {{ t('admin_btn_take_home') || "Take me home" }}
                    </button>
                </div>
            </div>
        </main>

        <!-- User Edit Modal -->
        <div v-if="isUserModalOpen" class="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/80 backdrop-blur-md" @click="isUserModalOpen = false"></div>
            <div
                class="relative w-full max-w-2xl bg-[#1A1C1B] border border-white/5 shadow-2xl rounded-[3rem] overflow-hidden animate-pop-in">
                <header class="p-8 border-b border-white/5 flex items-center justify-between">
                    <div>
                        <h2 class="text-2xl font-extrabold text-white">{{ t('admin_modal_edit_user') }}</h2>
                        <p class="text-xs text-on-surface-variant font-mono uppercase tracking-widest mt-1">ID: {{
                            selectedUser?.id }}</p>
                    </div>
                    <button @click="isUserModalOpen = false"
                        class="p-3 hover:bg-white/5 rounded-2xl transition-all">✕</button>
                </header>

                <div class="p-8 max-h-[70vh] overflow-y-auto space-y-8 no-scrollbar">
                    <div class="grid grid-cols-2 gap-6">
                        <div class="space-y-2">
                            <label
                                class="text-[10px] font-black uppercase text-on-surface-variant tracking-widest px-1">{{
                                    t('admin_table_user') }}</label>
                            <input v-model="editUserData.username" type="text"
                                class="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-white focus:border-primary outline-none transition-all">
                        </div>
                        <div class="space-y-2">
                            <label
                                class="text-[10px] font-black uppercase text-on-surface-variant tracking-widest px-1">{{
                                    t('admin_user_coins') }}</label>
                            <input v-model="editUserData.coins" type="number"
                                class="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-white focus:border-primary outline-none transition-all">
                        </div>
                        <div class="space-y-2">
                            <label
                                class="text-[10px] font-black uppercase text-on-surface-variant tracking-widest px-1">{{
                                    t('admin_user_rating') }}</label>
                            <input v-model="editUserData.rating" type="number"
                                class="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-white focus:border-primary outline-none transition-all">
                        </div>
                        <div class="space-y-2">
                            <label
                                class="text-[10px] font-black uppercase text-on-surface-variant tracking-widest px-1">{{
                                    t('admin_user_wins') }}</label>
                            <input v-model="editUserData.wins" type="number"
                                class="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-white focus:border-primary outline-none transition-all">
                        </div>
                    </div>

                    <div class="grid grid-cols-4 gap-4 h-full">
                        <button @click="editUserData.is_verified = !editUserData.is_verified"
                            :class="editUserData.is_verified ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-white/5 text-on-surface-variant border-white/5'"
                            class="flex flex-col items-center justify-center p-6 border rounded-3xl transition-all gap-2">
                            <span class="text-2xl">{{ editUserData.is_verified ? '✅' : '⚪' }}</span>
                            <span class="text-[10px] font-black uppercase tracking-widest">{{ t('admin_status_verified')
                                }}</span>
                        </button>
                        <button @click="editUserData.is_admin = !editUserData.is_admin"
                            :class="editUserData.is_admin ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-white/5 text-on-surface-variant border-white/5'"
                            class="flex flex-col items-center justify-center p-6 border rounded-3xl transition-all gap-2">
                            <span class="text-2xl">{{ editUserData.is_admin ? '👑' : '⚪' }}</span>
                            <span class="text-[10px] font-black uppercase tracking-widest">{{ t('admin_status_admin')
                                }}</span>
                        </button>
                        <button @click="editUserData.is_muted = !editUserData.is_muted"
                            :class="editUserData.is_muted ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-white/5 text-on-surface-variant border-white/5'"
                            class="flex flex-col items-center justify-center p-6 border rounded-3xl transition-all gap-2">
                            <span class="text-2xl">{{ editUserData.is_muted ? '🔇' : '⚪' }}</span>
                            <span class="text-[10px] font-black uppercase tracking-widest">{{ t('admin_status_muted')
                                }}</span>
                        </button>
                        <button @click="editUserData.is_banned = !editUserData.is_banned"
                            :class="editUserData.is_banned ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-white/5 text-on-surface-variant border-white/5'"
                            class="flex flex-col items-center justify-center p-6 border rounded-3xl transition-all gap-2">
                            <span class="text-2xl">{{ editUserData.is_banned ? '🚫' : '⚪' }}</span>
                            <span class="text-[10px] font-black uppercase tracking-widest">{{ t('admin_status_banned')
                                }}</span>
                        </button>
                    </div>

                    <div v-if="editUserData.is_banned || editUserData.is_muted" class="space-y-2 animate-fade-in">
                        <label class="text-[10px] font-black uppercase text-on-surface-variant tracking-widest px-1">{{
                            t('admin_label_action_reason') }}</label>
                        <textarea v-model="editUserData.ban_reason" rows="2"
                            :placeholder="t('admin_modal_enter_reason_for', { action: t('admin_status_banned') })"
                            class="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-white focus:border-red-500/50 outline-none transition-all resize-none"></textarea>
                    </div>
                </div>

                <footer class="p-8 border-t border-white/5 bg-black/20 flex gap-4">
                    <button @click="isUserModalOpen = false"
                        class="flex-1 py-4 bg-white/5 text-white font-black rounded-2xl hover:bg-white/10 transition-all">{{
                            t('btn_cancel').toUpperCase() }}</button>
                    <button @click="saveUserChanges"
                        class="flex-1 py-4 bg-primary text-on-primary font-black rounded-2xl hover:bg-primary/80 active:scale-95 transition-all">{{
                            t('admin_btn_save_changes') }}</button>
                </footer>
            </div>
        </div>
        <!-- Confirm Modal -->
        <div v-if="confirmModal.open" class="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"
                @click="confirmModal.resolve(false); confirmModal.open = false"></div>
            <div
                class="relative w-full max-w-md bg-surface border border-white/5 shadow-2xl rounded-3xl p-8 animate-pop-in">
                <h3 class="text-xl font-bold text-white mb-2">{{ confirmModal.title }}</h3>
                <p class="text-on-surface-variant mb-8">{{ confirmModal.message }}</p>
                <div class="flex gap-4">
                    <button @click="confirmModal.resolve(false); confirmModal.open = false"
                        class="flex-1 py-3 bg-white/5 text-white font-bold rounded-xl hover:bg-white/10 transition-all">{{
                            t('btn_cancel') }}</button>
                    <button @click="confirmModal.resolve(true); confirmModal.open = false"
                        class="flex-1 py-3 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary/80 transition-all">{{
                            t('btn_confirm') }}</button>
                </div>
            </div>
        </div>

        <!-- Prompt Modal -->
        <div v-if="promptModal.open" class="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"
                @click="promptModal.resolve(null); promptModal.open = false"></div>
            <div
                class="relative w-full max-w-md bg-surface border border-white/5 shadow-2xl rounded-3xl p-8 animate-pop-in">
                <h3 class="text-xl font-bold text-white mb-2">{{ promptModal.title }}</h3>
                <div class="space-y-4">
                    <div class="space-y-2">
                        <label class="text-xs font-bold text-on-surface-variant uppercase tracking-widest">{{
                            promptModal.label }}</label>
                        <input v-model="promptModal.value" :type="promptModal.type" autofocus
                            @keyup.enter="promptModal.resolve(promptModal.value); promptModal.open = false"
                            class="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all">
                    </div>
                    <div class="flex gap-4 pt-4">
                        <button @click="promptModal.resolve(null); promptModal.open = false"
                            class="flex-1 py-3 bg-white/5 text-white font-bold rounded-xl hover:bg-white/10 transition-all">{{
                                t('btn_cancel') }}</button>
                        <button @click="promptModal.resolve(promptModal.value); promptModal.open = false"
                            class="flex-1 py-3 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary/80 transition-all">{{
                                t('btn_continue') }}</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Sessions Modal -->
        <div v-if="isSessionsModalOpen" class="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/80 backdrop-blur-md" @click="isSessionsModalOpen = false"></div>
            <div
                class="relative w-full max-w-2xl bg-[#1A1C1B] border border-white/5 shadow-2xl rounded-[3rem] overflow-hidden animate-pop-in">
                <header class="p-8 border-b border-white/5 flex items-center justify-between">
                    <h2 class="text-2xl font-extrabold text-white">{{ t('admin_user_sessions') }}</h2>
                    <button @click="isSessionsModalOpen = false"
                        class="p-3 hover:bg-white/5 rounded-2xl transition-all">✕</button>
                </header>
                <div class="p-8 max-h-[60vh] overflow-y-auto space-y-4 no-scrollbar">
                    <div v-for="session in userSessions" :key="session.id"
                        class="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
                        <div class="space-y-1">
                            <p class="text-sm font-bold text-white">{{ session.device_info }}</p>
                            <p class="text-[10px] text-on-surface-variant uppercase font-mono">{{ session.ip_address }}
                                • {{ session.location }}</p>
                            <p class="text-[10px] text-primary uppercase font-black">{{ t('admin_last_seen') }}: {{
                                d(new Date(session.last_active), 'long') }}</p>
                        </div>
                        <button @click="terminateSession(session.id)"
                            class="px-4 py-2 bg-red-500/20 text-red-500 text-xs font-black rounded-xl hover:bg-red-500 hover:text-white transition-all">
                            {{ t('session_terminate').toUpperCase() }}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Device Details Modal -->
        <div v-if="isDeviceModalOpen" class="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/80 backdrop-blur-md" @click="isDeviceModalOpen = false"></div>
            <div
                class="relative w-full max-w-3xl bg-[#1A1C1B] border border-white/5 shadow-2xl rounded-[3rem] overflow-hidden animate-pop-in">
                <header class="p-8 border-b border-white/5 flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <h2 class="text-2xl font-extrabold text-white">{{ t('admin_device_details') }}</h2>
                        <span v-if="deviceBanInfo.banned"
                            class="px-3 py-1 bg-red-500/20 text-red-500 text-[10px] font-black rounded-full border border-red-500/20">
                            {{ t('admin_device_banned_badge') }}
                        </span>
                    </div>
                    <div class="flex items-center gap-3">
                        <button @click="handleDeviceBanToggle"
                            :class="deviceBanInfo.banned ? 'bg-primary text-black' : 'bg-red-500 text-white'"
                            class="px-4 py-2 rounded-xl text-xs font-black transition-all hover:scale-105 active:scale-95">
                            {{ deviceBanInfo.banned ? t('admin_unban_device') : t('admin_ban_device') }}
                        </button>
                        <button @click="isDeviceModalOpen = false"
                            class="p-3 hover:bg-white/5 rounded-2xl transition-all">✕</button>
                    </div>
                </header>
                <div v-if="selectedDevice && selectedDevice.device"
                    class="p-8 max-h-[70vh] overflow-y-auto space-y-8 no-scrollbar">
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="p-4 rounded-2xl bg-white/5 border border-white/5">
                            <p class="text-[10px] font-black uppercase text-on-surface-variant mb-1">{{
                                t('admin_device_model') }}</p>
                            <p class="text-sm font-bold text-white">{{ selectedDevice.device?.device_model || 'Unknown'
                                }}</p>
                        </div>
                        <div class="p-4 rounded-2xl bg-white/5 border border-white/5">
                            <p class="text-[10px] font-black uppercase text-on-surface-variant mb-1">{{
                                t('admin_platform_version') }}</p>
                            <p class="text-sm font-bold text-white">{{ selectedDevice.device?.platform_version ||
                                'Unknown' }}</p>
                        </div>
                        <div class="p-4 rounded-2xl bg-white/5 border border-white/5">
                            <p class="text-[10px] font-black uppercase text-on-surface-variant mb-1">{{
                                t('admin_login_count') }}</p>
                            <p class="text-sm font-bold text-white">{{ selectedDevice.device?.login_count || 0 }}</p>
                        </div>
                        <div class="p-4 rounded-2xl bg-white/5 border border-white/5">
                            <p class="text-[10px] font-black uppercase text-on-surface-variant mb-1">{{
                                t('admin_is_mobile') }}</p>
                            <p class="text-sm font-bold text-white">{{ selectedDevice.device?.is_mobile ? '✅' : '❌' }}
                            </p>
                        </div>
                    </div>

                    <div class="space-y-4">
                        <h3 class="text-xs font-black uppercase text-primary tracking-widest">{{
                            t('admin_associated_users') }}</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div v-for="user in selectedDevice.users" :key="user.id"
                                class="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
                                <div>
                                    <p class="font-bold text-white">{{ user.username }}</p>
                                    <p class="text-[10px] text-on-surface-variant uppercase">{{ t('admin_last_seen') }}:
                                        {{ d(new Date(user.last_used), 'short') }}</p>
                                </div>
                                <button
                                    @click="isDeviceModalOpen = false; currentTab = 'users'; userSearchQuery = user.username"
                                    class="p-2 bg-primary/10 text-primary rounded-lg">🔍</button>
                            </div>
                        </div>
                    </div>

                    <div class="p-6 rounded-3xl bg-black/40 border border-white/5">
                        <p class="text-[10px] font-black uppercase text-on-surface-variant mb-2">{{
                            t('admin_raw_user_agent') }}</p>
                        <p class="text-[11px] font-mono text-white/40 break-all">{{ selectedDevice.device?.user_agent ||
                            'N/A' }}
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Toasts -->
        <div class="fixed bottom-8 right-8 z-[400] flex flex-col gap-3 pointer-events-none">
            <TransitionGroup name="toast">
                <div v-for="toast in notifications" :key="toast.id"
                    :class="toast.type === 'success' ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-red-500/20 border-red-500/40 text-red-400'"
                    class="min-w-[300px] p-5 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-center gap-3 pointer-events-auto">
                    <span class="text-xl">{{ toast.type === 'success' ? '✅' : '❌' }}</span>
                    <p class="text-sm font-bold tracking-wide break-words overflow-hidden">{{ toast.message }}</p>
                </div>
            </TransitionGroup>
        </div>
    </div>
</template>

<style>
.animate-fade-in {
    animation: fadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(15px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.animate-pop-in {
    animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes popIn {
    from {
        opacity: 0;
        transform: scale(0.9) translateY(20px);
    }

    to {
        opacity: 1;
        transform: scale(1) translateY(0);
    }
}

/* Toast Transitions */
.toast-enter-active,
.toast-leave-active {
    transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.toast-enter-from {
    opacity: 0;
    transform: translateX(50px) scale(0.9);
}

.toast-leave-to {
    opacity: 0;
    transform: scale(0.9);
}

.shadow-glow {
    box-shadow: 0 0 15px rgba(0, 191, 165, 0.6);
}

/* Base styles to ensure consistency with main theme */
.bg-surface {
    background-color: #2E312F;
}

.text-on-surface {
    color: #E1E3E1;
}

.text-on-surface-variant {
    color: #BFC9C5;
}

.text-primary {
    color: #00BFA5;
}

.bg-primary {
    background-color: #00BFA5;
}

.border-primary {
    border-color: #00BFA5;
}

.text-on-primary {
    color: #00382D;
}

@media (max-width: 1024px) {
    .admin-layout {
        flex-direction: column;
    }

    aside {
        width: 100%;
        height: auto;
        border-right: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
}
</style>
