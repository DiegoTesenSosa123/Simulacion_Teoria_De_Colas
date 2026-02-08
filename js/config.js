export const SPEED_LEVELS = [0.0008, 0.002, 0.005, 0.010, 0.025];
export const SPEED_LABELS = ["x1 (Demo)", "x2 (Lento)", "x3 (Normal)", "x4 (Rápido)", "x5 (Turbo)"];

export const STATE = {
    currentSpeed: SPEED_LEVELS[0],
    speedIndex: 0,
    isPaused: false,
    chartData: { labels: [], pref: [], gen: [] }
};

export const COST_PARAMS = {
    salaryPerHour: 15.00,
    variablePerClient: 0.50,
    revenuePerClient: 20.00,
    budget: 1000.00,
    hours: 8,
    prefRate: 5
};