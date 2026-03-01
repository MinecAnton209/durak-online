import { defineStore } from 'pinia';
import axios from 'axios';

export const useHistoryStore = defineStore('history', {
    state: () => ({
        matches: [],
        loading: false,
        error: null,
        hasMore: true,
        skip: 0,
        take: 15
    }),
    actions: {
        async fetchHistory(reset = false) {
            if (reset) {
                this.skip = 0;
                this.matches = [];
                this.hasMore = true;
            }
            if (!this.hasMore || this.loading) return;

            this.loading = true;
            try {
                const response = await axios.get(`/api/matches/history?skip=${this.skip}&take=${this.take}`);
                const data = response.data;
                if (data.length < this.take) {
                    this.hasMore = false;
                }
                this.matches = [...this.matches, ...data];
                this.skip += data.length;
                if (this.skip >= 50) this.hasMore = false;
            } catch (err) {
                this.error = err.message;
            } finally {
                this.loading = false;
            }
        },
        async getMatchDetails(id) {
            try {
                const response = await axios.get(`/api/matches/${id}`);
                return response.data;
            } catch (err) {
                throw err;
            }
        },
        async purchaseAnalysis(id) {
            try {
                const response = await axios.post(`/api/matches/${id}/analyze`);
                return response.data;
            } catch (err) {
                throw err;
            }
        }
    }
});
