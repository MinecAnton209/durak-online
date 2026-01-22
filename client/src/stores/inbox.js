import { defineStore } from 'pinia';
import axios from 'axios';

export const useInboxStore = defineStore('inbox', {
    state: () => ({
        messages: [],
        unreadCount: 0,
        currentSessionId: null, // To manage session aware actions
        pagination: { page: 1, totalPages: 1 },
        loading: false
    }),
    actions: {
        async fetchMessages(page = 1) {
            this.loading = true;
            try {
                const res = await axios.get(`/api/inbox?page=${page}&limit=10`);
                this.messages = res.data.messages;
                this.pagination = res.data.pagination;
                // Update count after fetching messages to keep in sync
                await this.fetchUnreadCount();
            } catch (err) {
                console.error('Failed to fetch messages:', err);
            } finally {
                this.loading = false;
            }
        },

        async fetchUnreadCount() {
            try {
                const res = await axios.get('/api/inbox/unread/count');
                this.unreadCount = res.data.count;
            } catch (err) {
                console.warn('Failed to fetch unread count', err);
            }
        },

        incrementUnreadCount() {
            this.unreadCount++;
        },

        decrementUnreadCount() {
            if (this.unreadCount > 0) this.unreadCount--;
        },

        async markAsRead(msgId) {
            const msg = this.messages.find(m => m.id === msgId);
            if (msg && !msg.is_read) {
                try {
                    await axios.post(`/api/inbox/${msgId}/read`);
                    msg.is_read = true;
                    this.decrementUnreadCount();
                } catch (err) {
                    console.error('Failed to mark read', err);
                }
            }
        },

        async markAllAsRead() {
            // Client-side iterate for now
            for (const msg of this.messages) {
                if (!msg.is_read) {
                    await this.markAsRead(msg.id);
                }
            }
        },

        handleNewMessage(data) {
            this.unreadCount++;
            // If we are on first page, just refetch to get everything perfect (ordering, etc)
            if (this.pagination.page === 1) {
                this.fetchMessages(1);
            }
        }
    }
});
