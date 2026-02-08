import { QueueEngine } from './engine.js';
import { init3D, buildLayout, update3D, renderScene, updateThemeColors as update3DTheme } from './renderer.js';
import { initRealtimeChart, updateRealtimeData, resetCharts, updateChartTheme, renderFinalChart } from './charts.js';
import { STATE, COST_PARAMS, SPEED_LEVELS, SPEED_LABELS } from './config.js';

let engine = null;
let animationId = null;

// --- INICIALIZACIÓN ---
function init() {
    // 1. Iniciar Escena 3D y Gráficas
    init3D('canvas-container');
    initRealtimeChart('realtimeChart');
    
    // 2. Configurar todos los botones
    setupEventListeners();
    
    // 3. Configurar el sistema de audio
    setupAudio();
}

// --- LÓGICA DE AUDIO ---
function setupAudio() {
    const audio = document.getElementById('bg-music');
    const btnMusic = document.getElementById('btn-music-toggle');
    const iconMusic = document.getElementById('icon-music');
    const slider = document.getElementById('vol-slider');

    if (!audio || !btnMusic) return;

    // Volumen inicial (coincide con el slider del HTML)
    audio.volume = 0.3;

    // Botón Mute/Play
    btnMusic.addEventListener('click', () => {
        if (audio.paused) {
            audio.play().then(() => {
                iconMusic.innerText = "volume_up";
                btnMusic.classList.add("text-blue-500");
                btnMusic.classList.remove("text-slate-600", "dark:text-slate-300");
            }).catch(e => console.log("Audio bloqueado por navegador:", e));
        } else {
            audio.pause();
            iconMusic.innerText = "volume_off";
            btnMusic.classList.remove("text-blue-500");
            btnMusic.classList.add("text-slate-600", "dark:text-slate-300");
        }
    });

    // Slider de Volumen
    slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        audio.volume = val;
        
        if (val === 0) iconMusic.innerText = "volume_mute";
        else if (val < 0.5) iconMusic.innerText = "volume_down";
        else iconMusic.innerText = "volume_up";

        // Si mueven el slider y estaba en pausa, intentar reproducir
        if (val > 0 && audio.paused) {
            audio.play().catch(()=>{});
            btnMusic.classList.add("text-blue-500");
        }
    });
}

// --- LÓGICA RESPONSIVA (MENÚ MÓVIL) ---
// Hacemos la función global para que el HTML onclick="toggleSidebar()" la encuentre
window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    
    if (sidebar.classList.contains('-translate-x-full')) {
        // Abrir
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
    } else {
        // Cerrar
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
};

function setupEventListeners() {
    // Controles Principales
    document.getElementById('btn-start').addEventListener('click', startSimulation);
    document.getElementById('btn-pause').addEventListener('click', togglePause);
    document.getElementById('btn-speed').addEventListener('click', toggleSpeed);
    document.getElementById('btn-theme').addEventListener('click', toggleTheme);
    document.getElementById('btn-pico').addEventListener('click', activatePico);

    // Modal Configuración (PC y Móvil)
    const openSettings = () => {
        document.getElementById('settings-modal').classList.remove('hidden');
        // Si estamos en móvil, cerrar el sidebar al abrir settings
        const sidebar = document.getElementById('sidebar');
        if (!sidebar.classList.contains('-translate-x-full')) window.toggleSidebar();
    };
    
    const closeSettings = () => document.getElementById('settings-modal').classList.add('hidden');

    document.getElementById('btn-settings-open').addEventListener('click', openSettings); // PC
    const btnMobileSettings = document.getElementById('btn-settings-mobile'); // Móvil
    if (btnMobileSettings) btnMobileSettings.addEventListener('click', openSettings);

    document.getElementById('btn-settings-cancel').addEventListener('click', closeSettings);
    const btnCancelX = document.getElementById('btn-settings-cancel-x'); // X en móvil
    if (btnCancelX) btnCancelX.addEventListener('click', closeSettings);
    
    document.getElementById('btn-settings-save').addEventListener('click', () => {
        saveSettings();
        closeSettings();
    });

    // Modal Reporte
    document.getElementById('btn-open-report').addEventListener('click', openReport);
    document.getElementById('btn-report-close').addEventListener('click', () => document.getElementById('report-modal').classList.add('hidden'));
}

// --- MOTOR DE SIMULACIÓN ---
function startSimulation() {
    // 1. Leer parámetros del DOM
    const p = {
        hours: COST_PARAMS.hours,
        lambda: parseFloat(document.getElementById('inp-lambda').value) || 25,
        mu: parseFloat(document.getElementById('inp-mu').value) || 12,
        servers: parseInt(document.getElementById('inp-servers').value) || 4,
        queues: parseInt(document.getElementById('inp-queues').value) || 3
    };

    // 2. Preparar UI
    document.getElementById('results-trigger').classList.add('hidden');
    const btnPico = document.getElementById('btn-pico');
    btnPico.disabled = false;
    btnPico.className = "px-3 py-1.5 border border-red-500 text-red-500 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition-colors flex items-center gap-2 cursor-pointer";
    btnPico.innerHTML = '🔥 HORA PICO';

    const btnPause = document.getElementById('btn-pause');
    btnPause.disabled = false;
    btnPause.className = "w-full bg-amber-500 hover:bg-amber-400 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 text-lg";
    btnPause.innerHTML = '<span class="material-icons-round">pause</span> PAUSAR';
    
    // 3. Resetear Estado
    STATE.isPaused = false;
    STATE.chartData = { labels: [], pref: [], gen: [] };
    resetCharts();

    // 4. Instanciar Motor y Layout
    engine = new QueueEngine(p);
    buildLayout(engine);
    
    // 5. Iniciar Loop
    if (animationId) cancelAnimationFrame(animationId);
    animate();

    // 6. Intento extra de play a la música si aún no suena
    const audio = document.getElementById('bg-music');
    if(audio.paused) {
        audio.play().then(() => {
            document.getElementById('icon-music').innerText = "volume_up";
            document.getElementById('btn-music-toggle').classList.add("text-blue-500");
        }).catch(() => {}); // Ignorar si falla, el usuario lo activará manual
    }
}

function animate() {
    animationId = requestAnimationFrame(animate);
    
    if (engine) {
        let active = true;
        
        if (!STATE.isPaused) {
            // Paso Matemático
            active = engine.step(STATE.currentSpeed);
            const stats = engine.getStats();
            
            // Actualizar Contadores
            document.getElementById('count-pref').innerText = stats.pref;
            document.getElementById('count-gen').innerText = stats.gen;
            
            // Actualizar Reloj
            const secs = engine.reloj * 3600;
            const h = Math.floor(secs / 3600).toString().padStart(2,'0');
            const m = Math.floor((secs % 3600) / 60).toString().padStart(2,'0');
            const clockEl = document.getElementById('clock-display');
            clockEl.innerText = `${h}:${m}`;

            // Indicador de Estado
            const ind = document.getElementById('status-indicator');
            if(engine.abierto) {
                ind.innerHTML = `<span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span><span class="text-[10px] md:text-xs font-bold text-green-500">ABIERTO</span>`;
                clockEl.classList.remove('text-orange-500');
            } else {
                ind.innerHTML = `<span class="w-2 h-2 bg-orange-500 rounded-full animate-ping"></span><span class="text-[10px] md:text-xs font-bold text-orange-500">CIERRE</span>`;
                clockEl.classList.add('text-orange-500');
            }

            // Actualizar Gráfica (Throttling para rendimiento)
            if(Math.floor(engine.reloj * 100) % 20 === 0) {
                STATE.chartData.labels.push(`${h}:${m}`);
                STATE.chartData.pref.push(stats.pref);
                STATE.chartData.gen.push(stats.gen);
                
                const viewLabels = [...STATE.chartData.labels];
                const viewPref = [...STATE.chartData.pref];
                const viewGen = [...STATE.chartData.gen];
                
                if (viewLabels.length > 50) {
                    const cut = viewLabels.length - 50;
                    updateRealtimeData({
                        labels: viewLabels.slice(cut),
                        pref: viewPref.slice(cut),
                        gen: viewGen.slice(cut)
                    });
                } else {
                    updateRealtimeData(STATE.chartData);
                }
            }
        } else {
            document.getElementById('status-indicator').innerHTML = `<span class="w-2 h-2 bg-amber-500 rounded-full"></span><span class="text-[10px] md:text-xs font-bold text-amber-500">PAUSA</span>`;
        }

        update3D(engine);
        if (!STATE.isPaused && !active) finishSimulation();
    }
    renderScene();
}

function finishSimulation() {
    cancelAnimationFrame(animationId);
    renderScene();
    document.getElementById('results-trigger').classList.remove('hidden');
    
    const btnPause = document.getElementById('btn-pause');
    btnPause.disabled = true;
    btnPause.className = "w-full bg-slate-300 dark:bg-slate-700 text-slate-400 p-4 rounded-xl font-bold flex items-center justify-center gap-2 cursor-not-allowed text-lg";
}

function togglePause() {
    if (!engine) return;
    STATE.isPaused = !STATE.isPaused;
    const btn = document.getElementById('btn-pause');
    if(STATE.isPaused) {
        btn.innerHTML = '<span class="material-icons-round">play_arrow</span> REANUDAR';
        btn.className = "w-full bg-emerald-500 hover:bg-emerald-400 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 text-lg";
    } else {
        btn.innerHTML = '<span class="material-icons-round">pause</span> PAUSAR';
        btn.className = "w-full bg-amber-500 hover:bg-amber-400 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 text-lg";
    }
}

function toggleSpeed() {
    STATE.speedIndex = (STATE.speedIndex + 1) % SPEED_LEVELS.length;
    STATE.currentSpeed = SPEED_LEVELS[STATE.speedIndex];
    document.getElementById('txt-speed').innerText = SPEED_LABELS[STATE.speedIndex];
}

function toggleTheme() {
    const html = document.documentElement;
    html.classList.toggle('dark');
    const isDark = html.classList.contains('dark');
    const icon = document.getElementById('icon-theme');
    
    if (isDark) {
        icon.innerText = "dark_mode";
        icon.classList.remove('text-orange-500');
    } else {
        icon.innerText = "light_mode";
        icon.classList.add('text-orange-500');
    }
    update3DTheme(isDark);
    updateChartTheme(isDark);
}

function activatePico(e) {
    if(engine && engine.abierto) {
        engine.lambda *= 3;
        e.currentTarget.disabled = true;
        e.currentTarget.className = "px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold cursor-not-allowed flex items-center gap-2 animate-pulse";
        e.currentTarget.innerHTML = '⚠️ ALTA DEMANDA';
    }
}

function saveSettings() {
    COST_PARAMS.hours = parseFloat(document.getElementById('inp-hours').value) || 8;
    COST_PARAMS.prefRate = parseFloat(document.getElementById('inp-pref').value) || 5;
    COST_PARAMS.salaryPerHour = parseFloat(document.getElementById('cost-salary').value) || 15;
    COST_PARAMS.variablePerClient = parseFloat(document.getElementById('cost-client').value) || 0.5;
    COST_PARAMS.revenuePerClient = parseFloat(document.getElementById('cost-revenue').value) || 20;
    COST_PARAMS.budget = parseFloat(document.getElementById('cost-budget').value) || 1000;
}

function openReport() {
    document.getElementById('report-modal').classList.remove('hidden');
    
    // Cálculo de reporte
    const total = engine.totalAtendidos;
    const hours = engine.limitHours;
    const servers = engine.s;
    const fixedCost = servers * hours * COST_PARAMS.salaryPerHour;
    const variableCost = total * COST_PARAMS.variablePerClient;
    const totalCost = fixedCost + variableCost;
    const totalRevenue = total * COST_PARAMS.revenuePerClient;
    const netProfit = totalRevenue - totalCost;
    
    document.getElementById('rep-total').innerText = total;
    document.getElementById('rep-cost').innerText = "$" + totalCost.toFixed(2);
    document.getElementById('rep-revenue').innerText = "$" + totalRevenue.toFixed(2);
    
    const profitEl = document.getElementById('rep-profit');
    const profitBg = document.getElementById('profit-bg');
    profitEl.innerText = (netProfit >= 0 ? "+$" : "-$") + Math.abs(netProfit).toFixed(2);
    
    if (netProfit >= 0) {
        profitEl.className = "text-2xl md:text-3xl font-mono font-bold relative z-10 text-emerald-500";
        profitBg.className = "absolute inset-0 opacity-10 bg-emerald-500";
    } else {
        profitEl.className = "text-2xl md:text-3xl font-mono font-bold relative z-10 text-red-500";
        profitBg.className = "absolute inset-0 opacity-20 bg-red-500 animate-pulse";
    }

    // Diagnóstico IA Básico
    const ratio = total > 0 ? (totalCost / total) : 0;
    let diagFin = (netProfit > 0) ? "Modelo Rentable." : "Déficit Operativo.";
    let diagOps = (ratio < 5) ? "Costos eficientes." : "Costos unitarios altos.";
    let rec = (netProfit > 0) ? "Expandir capacidad." : "Reducir servidores.";

    document.getElementById('ai-diag-finance').innerText = diagFin;
    document.getElementById('ai-diag-ops').innerText = diagOps;
    document.getElementById('ai-recommendation').innerText = rec;

    renderFinalChart('finalChart', STATE.chartData, document.documentElement.classList.contains('dark'));
}

// Iniciar aplicación
init();