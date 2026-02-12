// state.js - Gerenciamento de estado compartilhado

const state = {
    automationRunning: false,
    currentEditingPresetId: null, // Rastreia qual preset está sendo editado
    currentFixedTimes: [] // Horários fixos para agendamento
};

const listeners = [];

export const State = {
    get(key) {
        return state[key];
    },

    set(key, value) {
        state[key] = value;
        notifyListeners(key, value);
    },

    // Atalhos para propriedades comuns
    get isRunning() { return state.automationRunning; },
    set isRunning(val) { this.set('automationRunning', val); },

    get editingPresetId() { return state.currentEditingPresetId; },
    set editingPresetId(val) { this.set('currentEditingPresetId', val); },

    get fixedTimes() { return state.currentFixedTimes; },
    set fixedTimes(val) { this.set('currentFixedTimes', val); },

    onChange(callback) {
        listeners.push(callback);
    }
};

function notifyListeners(key, value) {
    listeners.forEach(cb => cb(key, value));
}
