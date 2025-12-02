import { defineStore } from 'pinia';
import { io } from 'socket.io-client';
import { getDeviceId } from "@/utils/deviceId.js";
import {useGameStore} from "@/stores/game.js";

export const useSocketStore = defineStore('socket', {
  state: () => ({
    socket: null,
    isConnected: false,
    socketId: null,
  }),
  actions: {
    connect() {
      return new Promise(async (resolve, reject) => {
        if (this.socket && this.socket.connected) {
          return resolve(this.socketId);
        }

        if (this.socket && this.socket.connecting) {
          this.socket.once('connect', () => resolve(this.socketId));
          return;
        }

        const serverUrl = import.meta.env.VITE_API_URL || window.location.origin;
        const deviceId = await getDeviceId();

        console.log('Connecting to socket...');

        this.socket = io(serverUrl, {
          withCredentials: true,
          transports: ['websocket', 'polling'],
          auth: {
            deviceId: deviceId,
          }
        });

        this.socket.on('connect', () => {
          this.isConnected = true;
          this.socketId = this.socket.id;
          console.log('✅ Socket connected:', this.socketId);
          const gameStore = useGameStore();
          gameStore.initListeners();
          if (gameStore.isReconnecting && gameStore.gameId) {
            gameStore.attemptReconnect(gameStore.gameId);
          }
          resolve(this.socketId);
        });

        this.socket.on('disconnect', () => {
          this.isConnected = false;
          this.socketId = null;
          console.log('❌ Socket disconnected');
          const gameStore = useGameStore();
          gameStore.isReconnecting = true;
        });

        this.socket.on('connect_error', (err) => {
          console.error('Socket connection error:', err.message);
          reject(err);

        });
      });
    },

    emit(event, payload) {
      if (this.socket && this.isConnected) {
        this.socket.emit(event, payload);
      } else {
        console.warn(`⚠️ Cannot emit, socket not connected: ${event}`);
      }
    },

    disconnect() {
      if (this.socket) {
        this.socket.disconnect();
      }
    }
  }
});
