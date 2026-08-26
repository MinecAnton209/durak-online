import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    init,
    getMaintenanceMode,
    setMaintenanceMode,
    scheduleMaintenance,
    cancelMaintenance
} from '../services/maintenanceService';

function fakeIo() {
    return { emit: vi.fn() };
}

describe('maintenanceService: get/set', () => {
    let io;
    beforeEach(() => {
        io = fakeIo();
        init(io);
        // reset to a known baseline
        setMaintenanceMode({ enabled: false, message: '', startTime: null, warningMessage: '' });
    });

    it('starts disabled with a default message', () => {
        const mode = getMaintenanceMode();
        expect(mode.enabled).toBe(false);
        expect(typeof mode.message).toBe('string');
    });

    it('enables maintenance and emits maintenance:started', () => {
        setMaintenanceMode({ enabled: true, message: 'down' });
        expect(getMaintenanceMode().enabled).toBe(true);
        expect(getMaintenanceMode().message).toBe('down');
        expect(io.emit).toHaveBeenCalledWith('maintenance:started', expect.objectContaining({ enabled: true }));
    });

    it('disabling emits maintenance:ended', () => {
        setMaintenanceMode({ enabled: true });
        io.emit.mockClear();
        setMaintenanceMode({ enabled: false });
        expect(io.emit).toHaveBeenCalledWith('maintenance:ended');
    });

    it('merges partial updates', () => {
        setMaintenanceMode({ message: 'msg' });
        setMaintenanceMode({ enabled: true });
        const mode = getMaintenanceMode();
        expect(mode.message).toBe('msg');
        expect(mode.enabled).toBe(true);
    });
});

describe('maintenanceService: schedule/cancel', () => {
    let io;
    beforeEach(() => {
        io = fakeIo();
        init(io);
        setMaintenanceMode({ enabled: false, startTime: null, warningMessage: '' });
    });

    it('scheduleMaintenance emits a warning with message and start time', () => {
        const start = new Date().toISOString();
        scheduleMaintenance('soon', start);
        expect(io.emit).toHaveBeenCalledWith('maintenance:warning', { message: 'soon', startTime: start });
        expect(getMaintenanceMode().startTime).toBe(start);
        expect(getMaintenanceMode().warningMessage).toBe('soon');
    });

    it('cancelMaintenance clears the schedule and emits cancelled', () => {
        scheduleMaintenance('soon', new Date().toISOString());
        cancelMaintenance();
        expect(io.emit).toHaveBeenCalledWith('maintenance:cancelled');
        expect(getMaintenanceMode().startTime).toBeNull();
        expect(getMaintenanceMode().warningMessage).toBe('');
    });

    it('does not emit when io is not initialized', () => {
        init(null);
        setMaintenanceMode({ enabled: true, message: 'x' });
        // No throw; emit is a no-op with null io.
        expect(getMaintenanceMode().enabled).toBe(true);
    });
});
