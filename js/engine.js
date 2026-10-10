const clamp = (v, min, max, d) => {
    v = Number(v);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
};
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

// Número de llegadas en un intervalo: Poisson(l). Knuth para l pequeño, normal para l grande.
const poisson = (l) => {
    if (l <= 0) return 0;
    if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss()));
    const L = Math.exp(-l);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
};

const MAX_DT = 0.004; // horas simuladas por sub-paso (~14 s): evita distorsión en velocidades altas

export class QueueEngine {
    constructor(params = {}) {
        this.mode = params.mode === 'psych' ? 'psych' : 'standard';

        // Parámetros saneados: un input vacío/negativo/NaN ya no rompe la simulación
        this.lambda = clamp(params.lambda, 0, 1000, 40);
        this.mu = clamp(params.mu, 0.1, 1000, 15);
        this.s = Math.round(clamp(params.servers, 1, 20, 5));
        this.m = Math.round(clamp(params.queues, 1, 10, 3));
        this.limitHours = clamp(params.hours, 1, 24, 8);

        this.targetVipServers = Math.round(clamp(params.vipCount, 0, this.s, 0));
        this.vipProb = clamp(params.vipPercent, 0, 100, 0) / 100;

        this.ticketPrice = clamp(params.ticket, 0, 1e6, 0);
        this.costPerClient = clamp(params.costInsumo, 0, 1e6, 0);

        this.patienceLimit = clamp(params.patience, 1, 240, 15) / 60;
        this.tolerance = Math.round(clamp(params.tolerance, 1, 100, 10));

        this.reloj = 0;        // horas dentro del horario de apertura
        this.tiempoExtra = 0;  // horas de sobretiempo
        this.abierto = true;
        this.trabajando = true;

        this.stats = { atendidos: 0, abandonos: 0, rechazos: 0, esperaTotal: 0, ocupacionTotal: 0, maxQueueLength: 0 };

        this.history = [];      // muestras {t, q, busy} para la gráfica del reporte
        this.nextSample = 0;

        this.qPref = [];
        this.qGen = Array.from({ length: this.m }, () => []);
        this.servidores = [];
        this.initServers();
    }

    // Reloj global: sigue avanzando en sobretiempo (antes se congelaba y falseaba esperas y paciencia)
    get now() { return this.reloj + this.tiempoExtra; }

    initServers() {
        for (let i = 0; i < this.s; i++) {
            this.servidores.push({
                id: i,
                type: i < this.targetVipServers ? 'PREF' : 'GEN',
                busy: false, timer: 0, clientType: null, totalBusyTime: 0
            });
        }
        this.hasVipService = this.targetVipServers > 0;
    }

    // Cambios en caliente que no alteran cajas ni colas: la simulación en curso sigue el panel
    updateLive(p = {}) {
        this.mu = clamp(p.mu, 0.1, 1000, this.mu);
        this.vipProb = clamp(p.vipPercent, 0, 100, this.vipProb * 100) / 100;
        this.ticketPrice = clamp(p.ticket, 0, 1e6, this.ticketPrice);
        this.costPerClient = clamp(p.costInsumo, 0, 1e6, this.costPerClient);
        this.patienceLimit = clamp(p.patience, 1, 240, this.patienceLimit * 60) / 60;
        this.tolerance = Math.round(clamp(p.tolerance, 1, 100, this.tolerance));
        if (this.abierto) this.limitHours = Math.max(this.reloj, clamp(p.hours, 1, 24, this.limitHours));
    }

    setLambda(v) { this.lambda = clamp(v, 0, 3000, this.lambda); }

    // Avanza `hours` horas simuladas en sub-pasos fijos. Devuelve false al terminar.
    advance(hours) {
        let left = hours;
        while (left > 1e-12) {
            const dt = Math.min(MAX_DT, left);
            left -= dt;
            if (!this.step(dt)) return false;
        }
        return true;
    }

    step(dt) {
        if (!this.trabajando) return false;

        const open = this.abierto ? Math.max(0, Math.min(dt, this.limitHours - this.reloj)) : 0;
        if (open > 0) {
            this.reloj = Math.min(this.limitHours, this.reloj + open);
            const n = poisson(this.lambda * open);
            for (let i = 0; i < n; i++) this.handleArrival();
        }
        if (this.reloj >= this.limitHours - 1e-9) this.abierto = false;

        if (!this.abierto) {
            if (!this.hayGente()) { this.trabajando = false; return false; }
            this.tiempoExtra += dt - open;
        }

        if (this.mode === 'psych') this.checkReneging();
        this.balanceQueues();
        this.processServers(dt);

        const q = this.getTotalQueueSize();
        if (q > this.stats.maxQueueLength) this.stats.maxQueueLength = q;

        let busy = 0;
        for (const s of this.servidores) if (s.busy) busy++;
        this.stats.ocupacionTotal += (busy / this.s) * dt;
        if (this.now >= this.nextSample) { this.history.push({ t: this.now, q, busy }); this.nextSample += 0.05; }
        return true;
    }

    handleArrival() {
        if (this.mode === 'psych' && this.getTotalQueueSize() > this.tolerance * this.m && Math.random() < 0.7) {
            this.stats.rechazos++; // balking
            return;
        }
        const esVIP = this.hasVipService && Math.random() < this.vipProb;
        const cliente = {
            t: this.now,
            type: esVIP ? 'PREF' : 'GEN',
            patience: this.patienceLimit * (0.8 + Math.random() * 0.4)
        };
        if (esVIP) { this.qPref.push(cliente); return; }

        let idx = 0, min = Infinity;
        for (let i = 0; i < this.m; i++) {
            if (this.qGen[i].length < min) { min = this.qGen[i].length; idx = i; }
        }
        this.qGen[idx].push(cliente);
    }

    checkReneging() { // reneging
        const now = this.now;
        const check = (arr) => {
            for (let i = arr.length - 1; i >= 0; i--) {
                if (now - arr[i].t > arr[i].patience) { arr.splice(i, 1); this.stats.abandonos++; }
            }
        };
        check(this.qPref);
        this.qGen.forEach(check);
    }

    processServers(dt) {
        for (const srv of this.servidores) {
            if (srv.busy) {
                srv.timer -= dt;
                srv.totalBusyTime += dt;
                if (srv.timer <= 0) {
                    srv.busy = false;
                    srv.clientType = null;
                    this.stats.atendidos++;
                }
            }
            if (srv.busy) continue;

            let c;
            if (srv.type === 'PREF') c = this.qPref.shift() || this.pullGen();
            else c = this.pullGen() || this.qPref.shift();

            if (c) {
                this.stats.esperaTotal += this.now - c.t;
                srv.busy = true;
                srv.clientType = c.type;
                srv.timer = -Math.log(1 - Math.random()) / this.mu; // Exp(μ)
            }
        }
    }

    balanceQueues() {
        if (this.m <= 1) return;
        let min = Infinity, minI = 0, max = -Infinity, maxI = 0;
        for (let i = 0; i < this.m; i++) {
            const l = this.qGen[i].length;
            if (l < min) { min = l; minI = i; }
            if (l > max) { max = l; maxI = i; }
        }
        if (max - min >= 2) this.qGen[minI].push(this.qGen[maxI].pop());
    }

    pullGen() {
        let maxI = -1, max = 0;
        for (let i = 0; i < this.m; i++) {
            if (this.qGen[i].length > max) { max = this.qGen[i].length; maxI = i; }
        }
        return maxI === -1 ? null : this.qGen[maxI].shift();
    }

    hayGente() { return this.qPref.length > 0 || this.qGen.some(q => q.length > 0) || this.servidores.some(s => s.busy); }
    getTotalQueueSize() { return this.qPref.length + this.qGen.reduce((a, q) => a + q.length, 0); }

    getStats() {
        const total = this.now;
        return {
            prefQ: this.qPref.length,
            genQ: this.qGen.reduce((a, q) => a + q.length, 0),
            ...this.stats,
            utilization: total > 0 ? this.stats.ocupacionTotal / total : 0,
            avgWait: this.stats.atendidos > 0 ? (this.stats.esperaTotal / this.stats.atendidos) * 60 : 0,
            overtime: this.tiempoExtra,
            ticket: this.ticketPrice,
            cost: this.costPerClient
        };
    }
}