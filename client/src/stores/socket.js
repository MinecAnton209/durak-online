import { defineStore } from 'pinia';
import { io } from 'socket.io-client';

export const useSocketStore = defineStore('socket', {
    state: () => ({
        socket: null,
        isConnected: false,
    }),
    actions: {
        connect() {
            if (this.socket) return;

            console.log('Connecting to socket...');
            const tokenMatch = document.cookie.match(/(?:^|; )durak_token=([^;]+)/)
            const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null
            this.socket = io({
                transports: ['websocket'],
                autoConnect: true,
                withCredentials: true,
                auth: token ? { token } : {},
            });

            this.socket.on('connect', () => {
                this.isConnected = true;
                console.log('✅ Socket connected:', this.socket.id);
            });

            this.socket.on('disconnect', () => {
                this.isConnected = false;
                console.log('❌ Socket disconnected');
            });

            this.socket.on('connect_error', (err) => {
                console.error('Socket connection error:', err);
            });
        },

        emit(event, payload) {
            if (this.socket) {
                this.socket.emit(event, payload);
            } else {
                console.warn('⚠️ Cannot emit, socket not connected:', event);
            }
        }
    }
});
