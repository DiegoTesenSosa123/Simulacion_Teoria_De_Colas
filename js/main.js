import { QueueEngine } from './engine.js';
import { initScene, buildLayout, update3D, updateThemeColors, renderLoop } from './renderer.js';

// --- CONFIG ---
const SPEED_LEVELS = [0.0008, 0.002, 0.005, 0.010, 0.025];
const SPEED_LABELS = ["x1 (Demo)", "x2 (Lento)", "x3 (Normal)", "x4 (Rápido)", "x5 (Turbo)"];
let currentSpeed = SPEED_LEVELS[0];
let speedIndex = 0;
let chartData = { labels: [], pref: [], gen: [] }; 
let isPaused = false; 
let engine = null;
let animationId = null;
let realtimeChart = null;

// PARAMETROS FINANCIEROS (DEFAULTS)
let costParams = {
    salaryPerHour: 15.00,
    variablePerClient: 0.50,
    revenuePerClient: 20.00,
    budget: 1000.00
};

// --- CHART JS SETUP ---
function initRealtimeChart() {
    const ctx = document.getElementById('realtimeChart').getContext('2d');
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
            scales: { 
                x: { display: false }, 
                y: { beginAtZero: true, grid: { color: '#334155' } } 
            },
            plugins: { legend: { labels: { color: '#cbd5e1' } } }
        }
    });
}

function updateChartTheme(isDark) {
    if(!realtimeChart) return;
    const gridColor = isDark ? '#334155' : '#e2e8f0';
    const textColor = isDark ? '#9ca3af' : '#64748b';
    realtimeChart.options.scales.y.grid.color = gridColor;
    realtimeChart.options.plugins.legend.labels.color = textColor;
    realtimeChart.update();
}

// --- MAIN LOOP ---
function animate() {
    animationId = requestAnimationFrame(animate);
    if(engine) {
        let active = true;
        if (!isPaused) {
            active = engine.step(currentSpeed);
            const stats = engine.getStats();
            
            document.getElementById('count-pref').innerText = stats.pref;
            document.getElementById('count-gen').innerText = stats.gen;
            
            // RELOJ NORMAL (HH:MM)
            const secs = engine.reloj * 3600;
            const h = Math.floor(secs / 3600).toString().padStart(2,'0');
            const m = Math.floor((secs % 3600) / 60).toString().padStart(2,'0');
            const relojTexto = `${h}:${m}`;
            
            const ind = document.getElementById('status-indicator');
            const displayReloj = document.getElementById('clock-display');

            if(engine.abierto) {
                // ABIERTO
                ind.innerHTML = `<span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span><span class="text-xs font-bold text-green-500">ABIERTO</span>`;
                displayReloj.innerText = relojTexto;
                displayReloj.classList.remove('text-orange-500', 'text-slate-400');
                displayReloj.classList.add('text-blue-600', 'dark:text-blue-400');
            } 
            else if (engine.trabajando) {
                // CERRADO (OVERTIME)
                const otSecs = engine.tiempoExtra * 3600;
                const otH = Math.floor(otSecs / 3600).toString().padStart(2,'0');
                const otM = Math.floor((otSecs % 3600) / 60).toString().padStart(2,'0');
                
                ind.innerHTML = `<span class="w-2 h-2 bg-orange-500 rounded-full animate-ping"></span><span class="text-xs font-bold text-orange-500">CIERRE</span>`;
                displayReloj.innerHTML = `${relojTexto} <span class="text-sm text-red-500 font-bold ml-1">(+${otH}:${otM})</span>`;
                displayReloj.classList.remove('text-blue-600', 'dark:text-blue-400');
                displayReloj.classList.add('text-orange-500');
            } 
            else {
                // FINALIZADO
                ind.innerHTML = `<span class="w-2 h-2 bg-red-500 rounded-full"></span><span class="text-xs font-bold text-red-500">FIN</span>`;
                if (engine.tiempoExtra > 0) {
                     const otSecs = engine.tiempoExtra * 3600;
                     const otH = Math.floor(otSecs / 3600).toString().padStart(2,'0');
                     const otM = Math.floor((otSecs % 3600) / 60).toString().padStart(2,'0');
                     displayReloj.innerHTML = `${relojTexto} <span class="text-sm text-red-500 font-bold ml-1">(+${otH}:${otM})</span>`;
                } else {
                     displayReloj.innerText = relojTexto; 
                }
                displayReloj.classList.remove('text-orange-500', 'text-blue-600', 'dark:text-blue-400');
                displayReloj.classList.add('text-slate-400');
            }

            // Gráfica
            if(Math.floor((engine.reloj + engine.tiempoExtra) * 100) % 20 === 0) {
                let label = `${h}:${m}`;
                if (engine.tiempoExtra > 0) label += "+"; 
                
                chartData.labels.push(label);
                chartData.pref.push(stats.pref);
                chartData.gen.push(stats.gen);
                
                if(realtimeChart) {
                    realtimeChart.data.labels.push(label);
                    realtimeChart.data.datasets[0].data.push(stats.pref);
                    realtimeChart.data.datasets[1].data.push(stats.gen);
                    if(realtimeChart.data.labels.length > 50) {
                        realtimeChart.data.labels.shift();
                        realtimeChart.data.datasets[0].data.shift();
                        realtimeChart.data.datasets[1].data.shift();
                    }
                    realtimeChart.update();
                }
            }
        } else {
            document.getElementById('status-indicator').innerHTML = `<span class="w-2 h-2 bg-amber-500 rounded-full"></span><span class="text-xs font-bold text-amber-500">PAUSA</span>`;
        }

        update3D(engine);
        if(!isPaused && !active) finishSim();
    }
    renderLoop();
}

function finishSim() {
    cancelAnimationFrame(animationId);
    renderLoop();
    document.getElementById('results-trigger').classList.remove('hidden');
    
    // Desactivar controles
    const btnPause = document.getElementById('btn-pause');
    btnPause.disabled = true;
    btnPause.className = "w-full bg-slate-300 dark:bg-slate-700 text-slate-400 p-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all cursor-not-allowed";
    
    // Desactivar Hora Pico
    const btnPico = document.getElementById('btn-pico');
    btnPico.disabled = true;
    btnPico.className = "flex-1 lg:flex-none justify-center px-3 py-2 bg-red-900/10 text-red-800/50 border border-red-900/20 rounded-lg text-xs font-bold cursor-not-allowed flex items-center gap-2 transition-all";
}

// --- GLOBAL EXPORTS (Para usar desde HTML) ---
window.openSettings = () => { document.getElementById('settings-modal').classList.remove('hidden'); };

// FUNCION NUEVA: Toggle Sidebar para Móvil
window.toggleSidebar = () => {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('mobile-overlay');
    if(sb.classList.contains('-translate-x-full')) {
        sb.classList.remove('-translate-x-full');
        ov.classList.remove('hidden');
    } else {
        sb.classList.add('-translate-x-full');
        ov.classList.add('hidden');
    }
};

window.saveSettings = () => {
    costParams.salaryPerHour = parseFloat(document.getElementById('cost-salary').value) || 15;
    costParams.variablePerClient = parseFloat(document.getElementById('cost-client').value) || 0.5;
    costParams.revenuePerClient = parseFloat(document.getElementById('cost-revenue').value) || 20; 
    costParams.budget = parseFloat(document.getElementById('cost-budget').value) || 1000;
    document.getElementById('settings-modal').classList.add('hidden');
};

window.openReport = () => {
    const modal = document.getElementById('report-modal');
    modal.classList.remove('hidden');
    
    const stats = engine.getStats();
    
    // 1. CÁLCULOS BÁSICOS
    const total = engine.totalAtendidos;
    const regularHours = engine.limitHours;
    const overtimeHours = stats.overtime;
    const servers = engine.s;
    
    // 2. FINANZAS
    const normalLaborCost = servers * regularHours * costParams.salaryPerHour;
    const overtimeLaborCost = servers * overtimeHours * (costParams.salaryPerHour * 1.5);
    
    const variableCost = total * costParams.variablePerClient;
    const totalCost = normalLaborCost + overtimeLaborCost + variableCost;
    const totalRevenue = total * costParams.revenuePerClient;
    const netProfit = totalRevenue - totalCost;
    
    // 3. ACTUALIZAR UI PRINCIPAL
    document.getElementById('rep-total').innerText = total;
    document.getElementById('rep-cost').innerText = "$" + totalCost.toFixed(2);
    document.getElementById('rep-revenue').innerText = "$" + totalRevenue.toFixed(2);
    
    const profitEl = document.getElementById('rep-profit');
    const profitBg = document.getElementById('profit-bg');
    profitEl.innerText = (netProfit >= 0 ? "+$" : "-$") + Math.abs(netProfit).toFixed(2);
    
    if (netProfit >= 0) {
        profitEl.className = "text-2xl lg:text-3xl font-mono font-bold mt-1 relative z-10 text-emerald-500";
        profitBg.className = "absolute inset-0 opacity-10 bg-emerald-500";
    } else {
        profitEl.className = "text-2xl lg:text-3xl font-mono font-bold mt-1 relative z-10 text-red-500";
        profitBg.className = "absolute inset-0 opacity-20 bg-red-500 animate-pulse";
    }

    // 4. DATOS AVANZADOS
    const elUtil = document.getElementById('adv-utilization');
    if(elUtil) elUtil.innerText = (stats.utilization * 100).toFixed(1) + "%";
    
    const elWait = document.getElementById('adv-wait');
    if(elWait) elWait.innerText = stats.avgWait.toFixed(1) + " min";
    
    const elOver = document.getElementById('adv-overtime');
    if(elOver) elOver.innerText = Math.floor(overtimeHours*60) + " min";
    
    const elOverCost = document.getElementById('adv-overtime-cost');
    if(elOverCost) elOverCost.innerText = "$" + overtimeLaborCost.toFixed(2);

    // 5. CÁLCULO DE KPIS DE EFICIENCIA
    const kpiCUP = total > 0 ? (totalCost / total) : 0;
    const totalServiceHours = servers * (regularHours + overtimeHours);
    const kpiProd = totalServiceHours > 0 ? (total / totalServiceHours) : 0;
    const kpiIdle = Math.max(0, 1 - stats.utilization);

    document.getElementById('kpi-cost-unit').innerText = "$" + kpiCUP.toFixed(2);
    document.getElementById('kpi-productivity').innerText = kpiProd.toFixed(1);
    document.getElementById('kpi-idle').innerText = (kpiIdle * 100).toFixed(1) + "%";

    // 6. DIAGNÓSTICO INTELIGENTE
    let diagFin = "";
    let diagOps = "";
    
    const margen = totalRevenue - totalCost;
    const margenPorcentaje = totalRevenue > 0 ? ((margen / totalRevenue) * 100) : 0;

    if (margen > 0) {
        if (margenPorcentaje > 50) {
            diagFin = `✅ Excelente Salud Financiera. Ingresos ($${totalRevenue.toFixed(0)}) sólidos. Margen neto: ${margenPorcentaje.toFixed(0)}%.`;
        } else {
            diagFin = `⚠️ Rentable pero ajustado. Costos ($${totalCost.toFixed(0)}) altos. Revisa la productividad.`;
        }
    } else {
        diagFin = `🚨 Pérdida Operativa. Déficit de $${Math.abs(margen).toFixed(0)}. Revisa precios o reduce personal.`;
    }
    
    if (overtimeHours > 0.5) {
        diagOps = `🔥 SOBRECARGA: ${(overtimeHours*60).toFixed(0)} min extras. Pierdes dinero (x1.5).`;
    } else if (kpiIdle > 0.5) {
        diagOps = `💤 Subutilización Crítica: ${ (kpiIdle*100).toFixed(0) }% de tiempo ocioso.`;
    } else if (stats.avgWait > 15) {
        diagOps = `🐢 Cuello de Botella: Espera alta (${stats.avgWait.toFixed(1)} min).`;
    } else {
        diagOps = `✨ Operación Óptima.`;
    }

    document.getElementById('ai-diag-finance').innerText = diagFin;
    document.getElementById('ai-diag-ops').innerText = diagOps;

    // Report Chart
    const ctx = document.getElementById('finalChart').getContext('2d');
    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? '#334155' : '#e2e8f0';
    const textColor = isDark ? '#9ca3af' : '#64748b';

    if(window.finalChartInstance) window.finalChartInstance.destroy();

    window.finalChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [
                { label: 'Preferencial', data: chartData.pref, borderColor: '#d946ef', backgroundColor: 'rgba(217, 70, 239, 0.1)', fill: true, tension: 0.4, pointRadius: 0 },
                { label: 'General', data: chartData.gen, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.4, pointRadius: 0 }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            scales: { y: { beginAtZero: true, grid: { color: gridColor } }, x: { display: false } }, 
            plugins: { legend: { labels: { color: textColor } } } 
        }
    });
};

window.closeReport = () => { document.getElementById('report-modal').classList.add('hidden'); };

// --- EVENTS ---
document.addEventListener('DOMContentLoaded', () => {
    initScene();
    initRealtimeChart();

    document.getElementById('btn-start').addEventListener('click', () => {
        const p = {
            hours: parseFloat(document.getElementById('inp-hours').value),
            lambda: parseFloat(document.getElementById('inp-lambda').value),
            pref: parseFloat(document.getElementById('inp-pref').value),
            mu: parseFloat(document.getElementById('inp-mu').value),
            servers: parseInt(document.getElementById('inp-servers').value),
            queues: parseInt(document.getElementById('inp-queues').value),
            vipStep: parseInt(document.getElementById('inp-vip-step').value) || 3
        };
        
        // Cierre automático de sidebar en móvil
        if(window.innerWidth < 1024) {
            const sb = document.getElementById('sidebar');
            const ov = document.getElementById('mobile-overlay');
            sb.classList.add('-translate-x-full');
            ov.classList.add('hidden');
        }

        document.getElementById('results-trigger').classList.add('hidden');
        document.getElementById('clock-display').classList.remove('text-orange-500'); 
        
        const btnPico = document.getElementById('btn-pico');
        btnPico.disabled = false;
        btnPico.className = "flex-1 lg:flex-none justify-center px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg shadow-red-500/40 transition-all transform active:scale-95 cursor-pointer";
        btnPico.innerHTML = '<span class="material-icons-round text-sm">local_fire_department</span> <span class="hidden sm:inline">HORA PICO</span><span class="sm:hidden">PICO</span>';
        
        const btnPause = document.getElementById('btn-pause');
        btnPause.disabled = false;
        btnPause.classList.remove('bg-slate-300', 'dark:bg-slate-700', 'text-slate-400');
        btnPause.classList.add('bg-amber-500', 'hover:bg-amber-400', 'text-white');
        btnPause.innerHTML = '<span class="material-icons-round">pause</span> PAUSAR';
        isPaused = false;

        chartData = { labels: [], pref: [], gen: [] };
        
        if(realtimeChart) {
            realtimeChart.data.labels = [];
            realtimeChart.data.datasets.forEach((dataset) => { dataset.data = []; });
            realtimeChart.update();
        }

        engine = new QueueEngine(p);
        buildLayout(engine);
        if(animationId) cancelAnimationFrame(animationId);
        animate();
    });

    document.getElementById('btn-pause').addEventListener('click', () => {
        if(!engine) return;
        isPaused = !isPaused;
        const btn = document.getElementById('btn-pause');
        if(isPaused) {
            btn.innerHTML = '<span class="material-icons-round">play_arrow</span> REANUDAR';
            btn.classList.replace('bg-amber-500', 'bg-emerald-500');
            btn.classList.replace('hover:bg-amber-400', 'hover:bg-emerald-400');
        } else {
            btn.innerHTML = '<span class="material-icons-round">pause</span> PAUSAR';
            btn.classList.replace('bg-emerald-500', 'bg-amber-500');
            btn.classList.replace('hover:bg-emerald-400', 'hover:bg-amber-400');
        }
    });

    document.getElementById('btn-pico').addEventListener('click', (e) => {
        if(engine && engine.abierto) {
            engine.lambda *= 3;
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.className = "flex-1 lg:flex-none justify-center px-3 py-2 bg-red-800 text-white rounded-lg text-xs font-bold flex items-center gap-2 border-2 border-red-500 animate-pulse cursor-not-allowed";
            btn.innerHTML = '<span class="material-icons-round text-sm">warning</span> ¡ALTA DEMANDA!';
        }
    });

    document.getElementById('btn-speed').addEventListener('click', () => {
        speedIndex = (speedIndex + 1) % SPEED_LEVELS.length;
        currentSpeed = SPEED_LEVELS[speedIndex];
        const labels = ["x1", "x2", "x3", "x4", "x5"]; // Etiquetas cortas para móvil
        document.getElementById('txt-speed').innerText = labels[speedIndex];
    });

    document.getElementById('btn-theme').addEventListener('click', () => {
        const html = document.documentElement;
        const icon = document.getElementById('icon-theme');
        html.classList.toggle('dark');
        const isDark = html.classList.contains('dark');
        
        if (isDark) {
            icon.innerText = "dark_mode";
            icon.classList.remove('text-orange-500');
        } else {
            icon.innerText = "light_mode";
            icon.classList.add('text-orange-500');
        }
        updateThemeColors(isDark);
        updateChartTheme(isDark);
    });
});