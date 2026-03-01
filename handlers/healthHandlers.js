const systemService = require('../services/systemService');

module.exports = function registerHealthHandlers(io, socket, sharedContext) {
    const { onlineUsers, games } = sharedContext;

    socket.on('health:subscribe', () => {
        socket.join('health_status');
        console.log(`[Health] Socket ${socket.id} subscribed to health updates`);
    });

    socket.on('health:unsubscribe', () => {
        socket.leave('health_status');
        console.log(`[Health] Socket ${socket.id} unsubscribed from health updates`);
    });

    // Handle initial stats request if needed
    socket.on('health:getStats', async () => {
        const stats = await systemService.getSystemStats(onlineUsers, games);
        if (stats) socket.emit('health:update', stats);
    });
};
