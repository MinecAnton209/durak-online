const prisma = require('../db/prisma');

let maintenanceMode = {
    enabled: false,
    message: "The site is undergoing maintenance. Please come back later.",
    timer: null,
    startTime: null,
    warningMessage: ""
};

let io;

function init(socketIo) {
    io = socketIo;
}

function getMaintenanceMode() {
    return maintenanceMode;
}

function setMaintenanceMode(data) {
    maintenanceMode = { ...maintenanceMode, ...data };
    if (io) {
        if (maintenanceMode.enabled) {
            io.emit('maintenance:started', maintenanceMode);
        } else {
            io.emit('maintenance:ended');
        }
    }
}

function scheduleMaintenance(message, startTime) {
    maintenanceMode.startTime = startTime;
    maintenanceMode.warningMessage = message;
    if (io) {
        io.emit('maintenance:warning', { message, startTime });
    }
}

function cancelMaintenance() {
    maintenanceMode.startTime = null;
    maintenanceMode.warningMessage = "";
    if (io) {
        io.emit('maintenance:cancelled');
    }
}

module.exports = {
    init,
    getMaintenanceMode,
    setMaintenanceMode,
    scheduleMaintenance,
    cancelMaintenance
};
