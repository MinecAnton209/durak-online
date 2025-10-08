const request = require('supertest');
const db = require('../../../db');

// Mock the database module before any other modules are imported
jest.mock('../../../db', () => ({
    run: jest.fn((query, params, callback) => {
        if (callback) callback(null);
    }),
    get: jest.fn((query, params, callback) => {
        if (callback) callback(null, {});
    }),
    all: jest.fn((sql, params, callback) => {
        if (callback) callback(null, []);
    }),
    serialize: jest.fn(callback => callback()),
    close: jest.fn(callback => { if(callback) callback(null); }),
    pool: {
      end: jest.fn(callback => { if(callback) callback(null); }),
    }
}));

const { app, server } = require('../../../server');
const io = app.get('socketio');

// Use async/await and promises for a more robust teardown
afterAll(async () => {
    await new Promise(resolve => io.close(resolve));
    await new Promise(resolve => server.close(resolve));
});

describe('Public API Routes', () => {
    beforeEach(() => {
        db.all.mockClear();
    });

    describe('GET /api/public/leaderboard', () => {
        it('should return 200 and the leaderboard data', async () => {
            const mockLeaderboard = [
                { id: 1, username: 'player1', rating: 1600, wins: 50, losses: 10 },
                { id: 2, username: 'player2', rating: 1550, wins: 40, losses: 15 },
            ];
            db.all.mockImplementation((sql, params, callback) => {
                callback(null, mockLeaderboard);
            });

            const response = await request(app).get('/api/public/leaderboard');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockLeaderboard);
        });

        it('should return 500 if there is a database error', async () => {
            db.all.mockImplementation((sql, params, callback) => {
                callback(new Error('DB Error'), null);
            });

            const response = await request(app).get('/api/public/leaderboard');

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ error: 'Internal server error' });
        });

        it('should return 400 for an invalid leaderboard type', async () => {
            const response = await request(app).get('/api/public/leaderboard?type=invalid_type');
            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Invalid leaderboard type' });
        });
    });
});