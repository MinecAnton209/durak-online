import type { Server as SocketIOServer } from 'socket.io';

interface MaintenanceMode {
    enabled: boolean;
    message: string;
    timer: NodeJS.Timeout | null;
    startTime: number | null;
    warningMessage: string;
}

let maintenanceMode: MaintenanceMode = {
    enabled: false,
    message: "The site is undergoing maintenance. Please come back later.",
    timer: null,
    startTime: null,
    warningMessage: ""
};

let io: SocketIOServer | null = null;

function init(socketIo: SocketIOServer): void {
    io = socketIo;
}

function getMaintenanceMode(): MaintenanceMode {
    return maintenanceMode;
}

function setMaintenanceMode(data: Partial<MaintenanceMode>): void {
    maintenanceMode = { ...maintenanceMode, ...data };
    if (io) {
        if (maintenanceMode.enabled) {
            io.emit('maintenance:started', maintenanceMode);
        } else {
            io.emit('maintenance:ended');
        }
    }
}

function scheduleMaintenance(message: string, startTime: number): void {
    maintenanceMode.startTime = startTime;
    maintenanceMode.warningMessage = message;
    if (io) {
        io.emit('maintenance:warning', { message, startTime });
    }
}

function cancelMaintenance(): void {
    maintenanceMode.startTime = null;
    maintenanceMode.warningMessage = "";
    if (io) {
        io.emit('maintenance:cancelled');
    }
}

export {
    init,
    getMaintenanceMode,
    setMaintenanceMode,
    scheduleMaintenance,
    cancelMaintenance
};

export default { init, getMaintenanceMode, setMaintenanceMode, scheduleMaintenance, cancelMaintenance };
