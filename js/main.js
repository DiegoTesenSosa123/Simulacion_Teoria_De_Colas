import { QueueEngine } from './engine.js';
import { initScene, buildLayout, update3D, renderLoop } from './renderer.js';

const STATE = {
    engine: null,
    animationId: null,
    isPaused: true,
    speed: 0.01, 
    baseLambda: 0,
    isPeak: false,
    mode: 'standard'
};

const LABOR_RATE = 15.0; // Costo por hora por servidor

let finalChart;

function animate() {
    STATE.animationId = requestAnimationFrame(animate);
    
    if (STATE.engine && !STATE.isPaused) {
        const active = STATE.engine.step(STATE.speed);
        updateDashboard();
        if (!active) finishSimulation();
    }
    
    if(STATE.engine) update3D(STATE.engine);
    renderLoop();
}

// --- ACTUALIZACIÓN EN TIEMPO REAL (HUD LIMPIO) ---
function updateDashboard() {
    if(!STATE.engine) return;
    const stats = STATE.engine.getStats();
    
    // Contadores
    document.getElementById('count-pref').innerText = stats.prefQ;
    document.getElementById('count-gen').innerText = stats.genQ;
    
    if(STATE.mode === 'psych') {
        const totalLoss = stats.abandonos + stats.rechazos;
        document.getElementById('stat-abandon').classList.remove('hidden');
        document.getElementById('count-loss').innerText = totalLoss;
    }

    // Reloj
    const hours = Math.floor(STATE.engine.reloj);
    const mins = Math.floor((STATE.engine.reloj - hours) * 60);
    document.getElementById('clock-display').innerText = 
        `${hours.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}`;

    // --- PANEL EXTRA (SOLO TIEMPO) ---
    const overtimePanel = document.getElementById('panel-overtime');
    
    if(stats.overtime > 0) {
        overtimePanel.classList.remove('hidden');
        
        // Solo mostramos el cronómetro, el dolor financiero viene al final
        const otHours = Math.floor(stats.overtime);
        const otMins = Math.floor((stats.overtime - otHours) * 60);
        document.getElementById('overtime-timer').innerText = 
            `+${otHours.toString().padStart(2,'0')}:${otMins.toString().padStart(2,'0')}`;
    } else {
        overtimePanel.classList.add('hidden');
    }
}

function finishSimulation() {
    STATE.isPaused = true;
    document.getElementById('results-trigger').classList.remove('hidden');
    document.getElementById('btn-pico').disabled = true;
    document.getElementById('btn-pause').disabled = true;
    generateReportData();
}

// --- REPORTE CON ANÁLISIS FINANCIERO PROFUNDO ---
function generateReportData() {
    const stats = STATE.engine.getStats();
    
    // Cálculos
    const totalClients = stats.atendidos;
    const totalHours = STATE.engine.limitHours + stats.overtime;
    
    const baseLaborCost = STATE.engine.s * STATE.engine.limitHours * LABOR_RATE;
    const overtimeLaborCost = STATE.engine.s * stats.overtime * LABOR_RATE; // Costo HE
    
    const totalLaborCost = baseLaborCost + overtimeLaborCost;
    const supplyCost = totalClients * stats.cost; 
    const totalCost = totalLaborCost + supplyCost;
    
    const revenue = totalClients * stats.ticket; 
    const profit = revenue - totalCost;
    const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;

    // Actualizar Flip Cards
    document.getElementById('rep-total').innerText = totalClients;
    document.getElementById('rep-revenue').innerText = `$${revenue.toLocaleString(undefined, {maximumFractionDigits:0})}`;
    document.getElementById('rep-cost').innerText = `$${totalCost.toLocaleString(undefined, {maximumFractionDigits:0})}`;
    
    const profitEl = document.getElementById('rep-profit');
    profitEl.innerText = `${roi.toFixed(1)}%`;
    profitEl.className = `text-4xl font-mono font-bold ${roi >= 0 ? 'text-emerald-400' : 'text-red-500'}`;

    // Tabla de Métricas
    document.getElementById('rep-avg-wait').innerText = `${stats.avgWait.toFixed(1)} min`;
    document.getElementById('rep-max-q').innerText = stats.maxQueueLength || (stats.prefQ + stats.genQ);
    document.getElementById('rep-utilization').innerText = `${(stats.utilization * 100).toFixed(1)}%`;
    
    // Fila Sobrecosto (Tabla)
    const otRow = document.getElementById('rep-overtime-row');
    if(stats.overtime > 0.01) {
        otRow.classList.remove('hidden');
        const otH = Math.floor(stats.overtime);
        const otM = Math.floor((stats.overtime - otH) * 60);
        document.getElementById('rep-overtime-val').innerText = `${otH}h ${otM}m`;
        document.getElementById('rep-overtime-cost').innerText = `-$${overtimeLaborCost.toFixed(2)}`;
    } else {
        otRow.classList.add('hidden');
    }

    // Fila Fugas
    const lostRow = document.getElementById('rep-lost-row');
    if(STATE.mode === 'psych') {
        const lost = stats.abandonos + stats.rechazos;
        const lostMoney = lost * stats.ticket;
        document.getElementById('rep-lost-clients').innerText = lost;
        document.getElementById('rep-lost-money').innerText = `$${lostMoney.toLocaleString()}`;
        lostRow.classList.remove('hidden');
    } else {
        lostRow.classList.add('hidden');
    }

    // --- CONSTRUCCIÓN DEL DIAGNÓSTICO INTELIGENTE ---
    let diagnosis = `
        <p><b>Resumen Ejecutivo:</b> La operación cerró con un ROI del <b class="${roi >= 0 ? 'text-emerald-400' : 'text-red-400'}">${roi.toFixed(1)}%</b>. 
        Se procesaron ${totalClients} clientes generando ingresos por $${revenue.toLocaleString()}.</p>
        <p class="mt-2 text-slate-400">
            La espera promedio se mantuvo en <b>${stats.avgWait.toFixed(1)} min</b>.
            ${stats.utilization > 0.85 ? 'El personal operó cerca de su capacidad máxima (saturación).' : 'La carga de trabajo fue manejable.'}
        </p>
    `;

    // ANÁLISIS DE COSTO DE OPORTUNIDAD (HORAS EXTRA)
    if(stats.overtime > 0.01) {
        const costPercent = (overtimeLaborCost / totalCost) * 100;
        diagnosis += `
        <div class="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <h5 class="font-bold text-amber-500 flex items-center gap-2 mb-1">
                <span class="material-icons-round text-lg">warning</span> Impacto Financiero de Cierre Tardío
            </h5>
            <p class="text-xs text-slate-300 leading-relaxed">
                El sistema permaneció abierto fuera de horario para atender la cola remanente. 
                Esto generó un <b>sobrecosto de nómina de $${overtimeLaborCost.toFixed(2)}</b>, 
                lo cual representa el <b>${costPercent.toFixed(1)}%</b> de sus costos operativos totales hoy.
                ${ profit < overtimeLaborCost ? '<br><span class="text-red-400 font-bold">¡Cuidado! El costo de las horas extra consumió gran parte de su utilidad.</span>' : ''}
            </p>
        </div>`;
    }

    document.getElementById('ai-consultant-content').innerHTML = diagnosis;
    
    // Gráfica
    const ctx = document.getElementById('finalChart').getContext('2d');
    if(finalChart) finalChart.destroy();
    
    finalChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Atendidos', 'En Cola Final', 'Máx Cola Histórico'],
            datasets: [{
                label: 'Flujo de Personas',
                data: [totalClients, stats.prefQ + stats.genQ, stats.maxQueueLength || 0],
                backgroundColor: ['#3b82f6', '#d946ef', '#f59e0b'],
                borderRadius: 4
            }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: '#334155' } }, x: { grid: { display: false } } }
        }
    });
}

// --- GLOBALES Y LISTENERS (Sin cambios mayores) ---
window.enterApp = (mode) => {
    STATE.mode = mode;
    document.getElementById('landing-page').style.display = 'none';
    const psychCtrls = document.getElementById('psych-controls');
    if (mode === 'psych') psychCtrls.classList.remove('hidden');
    else psychCtrls.classList.add('hidden');
    initScene();
    renderLoop();
};

window.returnToMenu = () => location.reload();
window.openReport = () => document.getElementById('report-modal').classList.remove('hidden');
window.closeReport = () => {
    document.getElementById('report-modal').classList.add('hidden');
    document.getElementById('results-trigger').classList.add('hidden');
};
window.toggleSidebar = () => document.getElementById('sidebar').classList.toggle('-translate-x-full');

document.addEventListener('DOMContentLoaded', () => {
    const range = document.getElementById('inp-hours-range');
    range.addEventListener('input', (e) => document.getElementById('lbl-hours').innerText = e.target.value + "h");

    document.getElementById('btn-start').addEventListener('click', () => {
        if(STATE.engine) { cancelAnimationFrame(STATE.animationId); STATE.engine = null; }
        
        const params = {
            mode: STATE.mode,
            lambda: parseFloat(document.getElementById('inp-lambda').value),
            mu: parseFloat(document.getElementById('inp-mu').value),
            servers: parseInt(document.getElementById('inp-servers').value),
            queues: parseInt(document.getElementById('inp-queues').value),
            hours: parseInt(range.value),
            vipCount: parseInt(document.getElementById('inp-vip-servers').value),
            vipPercent: parseFloat(document.getElementById('inp-vip-percent').value),
            ticket: parseFloat(document.getElementById('inp-ticket').value),
            costInsumo: parseFloat(document.getElementById('inp-cost').value), // antes costClient
            patience: parseFloat(document.getElementById('inp-patience').value),
            tolerance: parseInt(document.getElementById('inp-tolerance').value)
        };
        
        STATE.baseLambda = params.lambda;
        STATE.engine = new QueueEngine(params);
        STATE.isPaused = false;
        
        buildLayout(STATE.engine);
        
        document.getElementById('results-trigger').classList.add('hidden');
        document.getElementById('btn-pause').disabled = false;
        document.getElementById('btn-pico').disabled = false;
        document.getElementById('panel-overtime').classList.add('hidden');
        
        if (window.innerWidth < 1024) window.toggleSidebar();
        
        animate();
    });

    document.getElementById('btn-pause').addEventListener('click', () => {
        STATE.isPaused = !STATE.isPaused;
        const btn = document.getElementById('btn-pause');
        btn.innerHTML = STATE.isPaused ? 
            '<span class="material-icons-round">play_arrow</span> REANUDAR' : 
            '<span class="material-icons-round">pause</span> PAUSA';
    });

    document.getElementById('btn-speed').addEventListener('click', () => {
        const speeds = [0.01, 0.05, 0.2]; 
        const labels = ["x1", "x5", "TURBO"];
        let currentIdx = speeds.findIndex(s => Math.abs(s - STATE.speed) < 0.001);
        if (currentIdx === -1) currentIdx = 0;
        const nextIdx = (currentIdx + 1) % speeds.length;
        STATE.speed = speeds[nextIdx];
        document.getElementById('txt-speed').innerText = labels[nextIdx];
    });

    document.getElementById('btn-pico').addEventListener('click', (e) => {
        if(!STATE.engine || !STATE.engine.abierto) return;
        STATE.isPeak = !STATE.isPeak;
        STATE.engine.setLambda(STATE.isPeak ? STATE.baseLambda * 3 : STATE.baseLambda);
        e.currentTarget.classList.toggle('ring-4');
    });

    const btnTheme = document.getElementById('btn-theme');
    btnTheme.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        const isDark = document.documentElement.classList.contains('dark');
        btnTheme.querySelector('span').innerText = isDark ? 'light_mode' : 'dark_mode';
    });
});