import { QueueEngine } from './engine.js';
import { initScene, loadEngine, cycleView } from './renderer.js';

const LABOR_RATE = 15.0; // costo por hora por servidor
// Velocidad = horas simuladas por segundo real (independiente de los FPS del monitor)
const SPEEDS = [{ rate: 0.6, label: 'x1' }, { rate: 3, label: 'x5' }, { rate: 12, label: 'TURBO' }];
const MODES = { standard: 'MODELO INGENIERÍA', psych: 'MODELO CONDUCTUAL' };

const STATE = { engine: null, raf: 0, last: 0, paused: true, running: false, speedIdx: 0, baseLambda: 0, peak: false, mode: 'standard' };
let finalChart = null;

// Acceso de solo lectura desde la consola (ver pages/api.html)
Object.defineProperty(window, 'MMM', { value: Object.freeze({ get engine() { return STATE.engine; }, get stats() { return STATE.engine ? STATE.engine.getStats() : null; } }) });

const $ = (id) => document.getElementById(id);
const setText = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
const pad = (n) => String(n).padStart(2, '0');
const clockStr = (h) => { const t = Math.floor(h * 60 + 1e-9); return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; };
const money = (n) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

function toggleParamsLock(locked) {
    const sidebar = $('sidebar');
    if (!sidebar) return;
    
    if (locked) sidebar.setAttribute('data-locked', 'true');
    else sidebar.removeAttribute('data-locked');
    
    sidebar.querySelectorAll('input, button[data-preset], #btn-start').forEach(el => {
        el.disabled = locked;
        if (locked) {
            el.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            el.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });
}

function loop(now) {
    STATE.raf = requestAnimationFrame(loop);
    const dtReal = Math.min((now - STATE.last) / 1000, 0.1); 
    STATE.last = now;
    if (!STATE.engine || STATE.paused) return;

    const alive = STATE.engine.advance(dtReal * SPEEDS[STATE.speedIdx].rate);
    updateDashboard();
    if (!alive) finishSimulation();
}

function updateDashboard() {
    const e = STATE.engine;
    if (!e) return;
    const s = e.getStats();

    setText('count-pref', s.prefQ);
    setText('count-gen', s.genQ);
    if (STATE.mode === 'psych') setText('count-loss', s.abandonos + s.rechazos);
    setText('clock-display', clockStr(e.reloj));
    const pr = $('hud-progress');
    pr.style.width = `${Math.min(1, e.reloj / e.limitHours) * 100}%`;
    pr.className = `h-full transition-[width] duration-200 ${s.overtime > 0 ? 'bg-red-500 animate-pulse' : 'bg-blue-500'}`;
    setText('hud-wait', `${s.avgWait.toFixed(1)}m`);
    setText('hud-util', `${Math.round(s.utilization * 100)}%`);

    const panel = $('panel-overtime');
    if (s.overtime > 0) {
        panel.classList.remove('hidden');
        setText('overtime-timer', `+${clockStr(s.overtime)}`);
    } else {
        panel.classList.add('hidden');
    }
}

function setPauseLabel() {
    $('btn-pause').innerHTML = STATE.paused
        ? '<span class="material-icons-round">play_arrow</span> REANUDAR'
        : '<span class="material-icons-round">pause</span> PAUSA';
}

function finishSimulation() {
    STATE.paused = true;
    STATE.running = false;
    cancelAnimationFrame(STATE.raf);
    $('results-trigger').classList.remove('hidden');$('btn-pico').disabled = true;
    $('btn-pause').disabled = true;
    
    toggleParamsLock(false);
    
    generateReportData();
}

function generateReportData() {
    const e = STATE.engine;
    const s = e.getStats();

    const clients = s.atendidos;
    const baseLabor = e.s * e.limitHours * LABOR_RATE;
    const overtimeLabor = e.s * s.overtime * LABOR_RATE;
    const totalCost = baseLabor + overtimeLabor + clients * s.cost;
    const revenue = clients * s.ticket;
    const profit = revenue - totalCost;
    const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
    const rho = e.lambda > 0 ? STATE.baseLambda / (e.s * e.mu) : 0;
    const lost = s.abandonos + s.rechazos;

    setText('rep-total', clients);
    setText('rep-revenue', money(revenue));
    setText('rep-cost', money(totalCost));
    const profitEl = $('rep-profit');
    profitEl.textContent = `${roi.toFixed(1)}%`;
    profitEl.className = `text-4xl font-mono font-bold ${roi >= 0 ? 'text-emerald-400' : 'text-red-500'}`;

    setText('rep-avg-wait', `${s.avgWait.toFixed(1)} min`);
    setText('rep-max-q', s.maxQueueLength);
    setText('rep-utilization', `${(s.utilization * 100).toFixed(1)}%`);

    const otRow = $('rep-overtime-row');
    otRow.classList.toggle('hidden', !(s.overtime > 0.01));
    if (s.overtime > 0.01) {
        setText('rep-overtime-val', `${Math.floor(s.overtime)}h ${Math.floor((s.overtime % 1) * 60)}m`);
        setText('rep-overtime-cost', `-$${overtimeLabor.toFixed(2)}`);
    }

    const lostRow = $('rep-lost-row');
    lostRow.classList.toggle('hidden', STATE.mode !== 'psych');
    if (STATE.mode === 'psych') {
        setText('rep-lost-clients', lost);
        setText('rep-lost-money', money(lost * s.ticket));
    }

    let html = `
        <p><b>Resumen Ejecutivo:</b> La operación cerró con un ROI del
        <b class="${roi >= 0 ? 'text-emerald-400' : 'text-red-400'}">${roi.toFixed(1)}%</b>.
        Se procesaron ${clients} clientes generando ingresos por ${money(revenue)}.</p>
        <p class="mt-2 text-slate-400">
            La espera promedio fue de <b>${s.avgWait.toFixed(1)} min</b>. Intensidad de tráfico ρ = <b>${rho.toFixed(2)}</b>.
            ${rho >= 1 ? '<span class="text-red-400 font-bold">Demanda mayor que la capacidad: la cola tiende a crecer sin control.</span>'
                : s.utilization > 0.85 ? 'El personal operó cerca de su capacidad máxima (saturación).' : 'La carga de trabajo fue manejable.'}
        </p>`;

    if (s.overtime > 0.01 && totalCost > 0) {
        html += `
        <div class="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <h5 class="font-bold text-amber-500 flex items-center gap-2 mb-1">
                <span class="material-icons-round text-lg">warning</span> Impacto Financiero de Cierre Tardío
            </h5>
            <p class="text-xs text-slate-300 leading-relaxed">
                El sistema permaneció abierto fuera de horario para atender la cola remanente.
                Sobrecosto de nómina: <b>$${overtimeLabor.toFixed(2)}</b>
                (<b>${((overtimeLabor / totalCost) * 100).toFixed(1)}%</b> de los costos operativos).
                ${profit < overtimeLabor ? '<br><span class="text-red-400 font-bold">¡Cuidado! Las horas extra consumieron gran parte de la utilidad.</span>' : ''}
            </p>
        </div>`;
    }
    $('ai-consultant-content').innerHTML = html;

    const canvas = $('finalChart');
    if (!canvas) return;
    if (typeof Chart === 'undefined') {
        canvas.parentElement.textContent = 'No se pudo cargar Chart.js (revisa tu conexión o el hash SRI).';
        return;
    }
    if (finalChart) finalChart.destroy();
    const hist = e.history;
    const axis = { ticks: { color: '#94a3b8' } };
    finalChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: hist.map((p) => clockStr(p.t)),
            datasets: [
                { label: 'En cola', data: hist.map((p) => p.q), borderColor: '#d946ef', backgroundColor: 'rgba(217,70,239,.15)', fill: true, pointRadius: 0, tension: 0.3, borderWidth: 2 },
                { label: 'Servidores ocupados', data: hist.map((p) => p.busy), borderColor: '#3b82f6', pointRadius: 0, stepped: true, borderWidth: 2 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { labels: { color: '#94a3b8', boxWidth: 10 } } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { ...axis.ticks, precision: 0 } },
                x: { grid: { display: false }, ticks: { ...axis.ticks, maxTicksLimit: 6, maxRotation: 0 } }
            }
        }
    });
}

function enterApp(mode) {
    if (!(mode in MODES)) return;
    STATE.mode = mode;
    if (!initScene()) return; 
    
    if (!history.state || !history.state.appOpen) {
        history.pushState({ appOpen: true }, '', '#simulator');
    }
    
    $('landing-page').style.display = 'none';$('psych-controls').classList.toggle('hidden', mode !== 'psych');
    setText('mode-badge', MODES[mode]);
    preview();
    if (window.innerWidth < 1024) $('sidebar').classList.remove('-translate-x-full'); 
}

const ACTIONS = {
    'open-report': () => { $('report-modal').classList.remove('hidden');$('report-modal').querySelector('[data-action="close-report"]')?.focus(); },
    'close-report': () => { $('report-modal').classList.add('hidden');$('results-trigger').classList.add('hidden'); },
    
    // Dispara el modal personalizado
    'return-menu': () => {
        if (STATE.running) {
            $('exit-modal').classList.remove('hidden');
        } else {
            location.href = location.pathname;
        }
    },
    
    'toggle-sidebar': () => $('sidebar').classList.toggle('-translate-x-full'),
    'toggle-menu': () => setMenu($('mobile-menu').classList.contains('hidden'))
};

function setMenu(open) {
    $('mobile-menu').classList.toggle('hidden', !open);
    const b = document.querySelector('[data-action="toggle-menu"]');
    b.setAttribute('aria-expanded', String(open));
    b.querySelector('span').textContent = open ? 'close' : 'menu';
}

function scrollToSection(id) {
    const root = $('landing-page');
    const t = id === '#top' ? null : root.querySelector(id);
    let y = 0;
    if (t) {
        const headerH = root.querySelector('header').offsetHeight;
        const avail = root.clientHeight - headerH;
        const top = t.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
        const h = t.offsetHeight;
        y = h < avail ? top - headerH - (avail - h) / 2 : top - headerH;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
}

const PRESETS = {
    banco:   { 'inp-lambda': 52, 'inp-mu': 15, 'inp-servers': 4, 'inp-queues': 2, 'inp-vip-servers': 1, 'inp-vip-percent': 20, 'inp-ticket': 12, 'inp-cost': 0.8, 'inp-hours-range': 8 },
    clinica: { 'inp-lambda': 18, 'inp-mu': 6, 'inp-servers': 4, 'inp-queues': 1, 'inp-vip-servers': 0, 'inp-vip-percent': 0, 'inp-ticket': 40, 'inp-cost': 6, 'inp-hours-range': 10 },
    retail:  { 'inp-lambda': 100, 'inp-mu': 20, 'inp-servers': 6, 'inp-queues': 3, 'inp-vip-servers': 1, 'inp-vip-percent': 15, 'inp-ticket': 30, 'inp-cost': 9, 'inp-hours-range': 8 }
};

function updateRho() {
    const rho = parseFloat($('inp-lambda').value) / (parseFloat($('inp-servers').value) * parseFloat($('inp-mu').value));
    const ok = Number.isFinite(rho) && rho >= 0;
    const [color, msg] = !ok ? ['bg-slate-500', 'Completa λ, μ y servidores.']
        : rho < 0.7 ? ['bg-emerald-500', 'Holgado: se esperan pocas esperas.']
        : rho < 0.9 ? ['bg-amber-500', 'Carga alta pero estable.']
        : rho < 1 ? ['bg-orange-500', 'Al límite: esperas largas probables.']
        : ['bg-red-500', 'Inestable: la cola crecerá sin control.'];
    setText('rho-val', ok ? rho.toFixed(2) : '--');
    setText('rho-msg', msg);
    $('rho-bar').className = `h-full transition-all ${color}`;
    $('rho-bar').style.width = `${ok ? Math.min(rho, 1) * 100 : 0}%`;
}

let restartTimer = 0, toastTimer = 0;

function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('opacity-0');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('opacity-0'), 2200);
}

function applyChanges(structural) {
    if (structural) {
        if (!STATE.running) return preview();
        clearTimeout(restartTimer);
        restartTimer = setTimeout(() => { startSimulation(); toast('Simulación reiniciada con tus nuevos valores'); }, 500);
        return;
    }
    if (!STATE.running) return;
    const p = readParams();
    STATE.engine.updateLive(p);
    if (Number.isFinite(p.lambda) && p.lambda >= 0) {
        STATE.baseLambda = p.lambda;
        STATE.engine.setLambda(STATE.peak ? p.lambda * 3 : p.lambda);
    }
}

function normalizeInputs() {
    const e = new QueueEngine(readParams());
    const set = (id, v) => { $(id).value = v; };
    set('inp-lambda', e.lambda); set('inp-mu', e.mu);
    set('inp-servers', e.s); set('inp-queues', e.m);
    set('inp-vip-servers', e.targetVipServers); set('inp-vip-percent', Math.round(e.vipProb * 100));
    set('inp-hours-range', e.limitHours); setText('lbl-hours', `${e.limitHours}h`);
    set('inp-patience', Math.round(e.patienceLimit * 60)); set('inp-tolerance', e.tolerance);
    set('inp-ticket', e.ticketPrice.toFixed(2)); set('inp-cost', e.costPerClient.toFixed(2));
    updateRho();
}

function initSidebarTools() {
    document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
        Object.entries(PRESETS[b.dataset.preset]).forEach(([id, v]) => { $(id).value = v; });
        setText('lbl-hours', `${$('inp-hours-range').value}h`);
        updateRho();
        applyChanges(true);
    }));
    ['inp-lambda', 'inp-mu', 'inp-servers'].forEach((id) => $(id).addEventListener('input', updateRho));
    const STRUCT = ['inp-servers', 'inp-queues', 'inp-vip-servers'];
    document.querySelectorAll('#sidebar input').forEach((el) => {
        el.addEventListener('input', () => applyChanges(STRUCT.includes(el.id)));
        el.addEventListener('change', normalizeInputs);
    });
    updateRho();
}

function initReveal() {
    const root = $('landing-page');
    if (!('IntersectionObserver' in window)) return;
    root.classList.add('reveal-ready');
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { root, threshold: 0.12 });
    root.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

function readParams() {
    return {
        mode: STATE.mode,
        lambda: parseFloat($('inp-lambda').value),
        mu: parseFloat($('inp-mu').value),
        servers: parseInt($('inp-servers').value, 10),
        queues: parseInt($('inp-queues').value, 10),
        hours: parseInt($('inp-hours-range').value, 10),
        vipCount: parseInt($('inp-vip-servers').value, 10),
        vipPercent: parseFloat($('inp-vip-percent').value),
        ticket: parseFloat($('inp-ticket').value),
        costInsumo: parseFloat($('inp-cost').value),
        patience: parseFloat($('inp-patience').value),
        tolerance: parseInt($('inp-tolerance').value, 10)
    };
}

function preview() {
    if (STATE.running) return;
    loadEngine(new QueueEngine(readParams()));
}

function startSimulation() {
    cancelAnimationFrame(STATE.raf);
    const params = readParams();

    STATE.engine = new QueueEngine(params);
    STATE.baseLambda = STATE.engine.lambda;
    STATE.peak = false;
    STATE.paused = false;
    STATE.running = true;
    loadEngine(STATE.engine);

    $('results-trigger').classList.add('hidden');$('panel-overtime').classList.add('hidden');
    $('stat-abandon').classList.toggle('hidden', STATE.mode !== 'psych');$('btn-pause').disabled = false;
    $('btn-pico').disabled = false;
    $('btn-pico').classList.remove('ring-4');$('btn-pico').setAttribute('aria-pressed', 'false');
    
    setPauseLabel();
    updateDashboard();
    toggleParamsLock(true);

    if (window.innerWidth < 1024) $('sidebar').classList.add('-translate-x-full');
    STATE.last = performance.now();
    STATE.raf = requestAnimationFrame(loop);
}

document.addEventListener('click', (e) => {
    const link = e.target.closest('#landing-page a[href^="#"]');
    if (link) { e.preventDefault(); setMenu(false); return scrollToSection(link.getAttribute('href')); }
    const modeEl = e.target.closest('[data-mode]');
    if (modeEl) return enterApp(modeEl.dataset.mode);
    const act = e.target.closest('[data-action]')?.dataset.action;
    if (act && ACTIONS[act]) ACTIONS[act]();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('report-modal').classList.contains('hidden')) return ACTIONS['close-report']();
    const el = e.target.closest?.('[data-mode]');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); enterApp(el.dataset.mode); }
});

document.addEventListener('DOMContentLoaded', () => {

    // Control del botón retroceder del navegador usando tu modal
    window.addEventListener('popstate', (e) => {
        if ($('landing-page').style.display === 'none') {
            if (STATE.running) {
                // Truco: reponemos la entrada en el historial para no salir de la página
                history.pushState({ appOpen: true }, '', '#simulator');
                $('exit-modal').classList.remove('hidden');
            } else {
                location.reload(); 
            }
        }
    });

    // Control de los botones de tu nuevo Modal
    $('btn-cancel-exit')?.addEventListener('click', () => {$('exit-modal').classList.add('hidden');
    });

    $('btn-confirm-exit')?.addEventListener('click', () => {
        STATE.running = false;
        location.href = location.pathname;
    });

    initReveal();
    initSidebarTools();
    const range = $('inp-hours-range');
    range.addEventListener('input', (e) => setText('lbl-hours', `${e.target.value}h`));

    $('btn-start').addEventListener('click', startSimulation);

    $('btn-view').addEventListener('click', () => {
        setText('txt-view', { front: 'FRONTAL', top: 'SUPERIOR', iso: 'ISO' }[cycleView()]);
    });

    $('btn-pause').addEventListener('click', () => {
        if (!STATE.engine) return;
        STATE.paused = !STATE.paused;
        setPauseLabel();
    });

    $('btn-speed').addEventListener('click', () => {
        STATE.speedIdx = (STATE.speedIdx + 1) % SPEEDS.length;
        setText('txt-speed', SPEEDS[STATE.speedIdx].label);
    });

    $('btn-pico').addEventListener('click', (e) => {
        if (!STATE.engine || !STATE.engine.abierto) return;
        STATE.peak = !STATE.peak;
        STATE.engine.setLambda(STATE.peak ? STATE.baseLambda * 3 : STATE.baseLambda);
        e.currentTarget.classList.toggle('ring-4', STATE.peak);
        e.currentTarget.setAttribute('aria-pressed', String(STATE.peak));
    });

    const btnTheme = $('btn-theme');
    const applyTheme = (dark) => {
        document.documentElement.classList.toggle('dark', dark);
        btnTheme.querySelector('span').textContent = dark ? 'light_mode' : 'dark_mode';
    };
    try { if (localStorage.getItem('mmm-theme') === 'light') applyTheme(false); } catch (_) { /* almacenamiento bloqueado */ }
    btnTheme.addEventListener('click', () => {
        const dark = !document.documentElement.classList.contains('dark');
        applyTheme(dark);
        try { localStorage.setItem('mmm-theme', dark ? 'dark' : 'light'); } catch (_) { /* ignorar */ }
    });
});