let realtimeChart;
let finalChartInstance;

export function initRealtimeChart(canvasId) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    realtimeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Preferencial', data: [], borderColor: '#d946ef', backgroundColor: 'rgba(217, 70, 239, 0.1)', fill: true, tension: 0.4, pointRadius: 0 },
                { label: 'General', data: [], borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.4, pointRadius: 0 }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            animation: false,
            scales: { x: { display: false }, y: { beginAtZero: true, grid: { color: '#334155' } } },
            plugins: { legend: { labels: { color: '#cbd5e1' } } }
        }
    });
    return realtimeChart;
}

export function updateChartTheme(isDark) {
    const gridColor = isDark ? '#334155' : '#e2e8f0';
    const textColor = isDark ? '#9ca3af' : '#64748b';
    
    if(realtimeChart) {
        realtimeChart.options.scales.y.grid.color = gridColor;
        realtimeChart.options.plugins.legend.labels.color = textColor;
        realtimeChart.update();
    }
}

export function updateRealtimeData(chartData) {
    if(realtimeChart) {
        realtimeChart.data.labels = chartData.labels;
        realtimeChart.data.datasets[0].data = chartData.pref;
        realtimeChart.data.datasets[1].data = chartData.gen;
        realtimeChart.update();
    }
}

export function resetCharts() {
    if(realtimeChart) {
        realtimeChart.data.labels = [];
        realtimeChart.data.datasets.forEach(d => d.data = []);
        realtimeChart.update();
    }
}

export function renderFinalChart(canvasId, chartData, isDark) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const gridColor = isDark ? '#334155' : '#e2e8f0';
    const textColor = isDark ? '#9ca3af' : '#64748b';

    if(finalChartInstance) finalChartInstance.destroy();

    finalChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [
                { label: 'Preferencial', data: chartData.pref, borderColor: '#d946ef', backgroundColor: 'rgba(217, 70, 239, 0.1)', fill: true },
                { label: 'General', data: chartData.gen, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true }
            ]
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            scales: { y: { beginAtZero: true, grid: { color: gridColor } }, x: { display: false } }, 
            plugins: { legend: { labels: { color: textColor } } } 
        }
    });
}