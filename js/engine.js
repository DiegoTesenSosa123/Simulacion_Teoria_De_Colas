export class QueueEngine {
    constructor(params) {
        // ... (código existente del constructor igual hasta stats) ...
        this.mode = params.mode || 'standard';
        // Configuración Base
        this.lambda = params.lambda; 
        this.mu = params.mu;         
        this.s = params.servers;     
        this.m = params.queues;      
        this.limitHours = params.hours;

        // Segmentación VIP
        this.targetVipServers = Math.min(params.vipCount, this.s);
        this.vipProb = Math.max(0, Math.min(1, params.vipPercent / 100));

        // Finanzas
        this.ticketPrice = params.ticket;
        this.costPerClient = params.costInsumo;

        // Psicología
        this.patienceLimit = (params.patience || 15) / 60; 
        this.tolerance = params.tolerance || 10;
        
        // Estado Interno
        this.reloj = 0.0;
        this.tiempoExtra = 0.0;
        this.abierto = true;     
        this.trabajando = true;

        // --- STATS EXTENDIDOS ---
        this.stats = { 
            atendidos: 0, 
            abandonos: 0, 
            rechazos: 0, 
            esperaTotal: 0, 
            ocupacionTotal: 0,
            maxQueueLength: 0 // Nuevo campo para reporte
        };
        
        this.qPref = []; 
        this.qGen = Array.from({length: this.m}, () => []); 
        
        this.servidores = [];
        this.initServers();
    }

    // ... initServers, setLambda igual ...
    initServers() {
        let sPrefCount = this.targetVipServers;
        for(let i=0; i<this.s; i++) {
            const isPref = i < sPrefCount; 
            this.servidores.push({
                id: i, 
                type: isPref ? 'PREF' : 'GEN', 
                busy: false, 
                timer: 0, 
                clientType: null, 
                totalBusyTime: 0
            });
        }
        this.hasVipService = sPrefCount > 0;
    }

    setLambda(newLambda) { this.lambda = newLambda; }

    step(dt) {
        // ... (lógica de tiempo igual) ...
        let tiempoParaCierre = Math.max(0, this.limitHours - this.reloj);
        let dtNormal = dt <= tiempoParaCierre ? dt : tiempoParaCierre;
        let dtExtra = dt > tiempoParaCierre ? dt - tiempoParaCierre : 0;

        if (this.abierto && dtNormal > 0) {
            this.reloj += dtNormal;
            if (Math.random() < this.lambda * dtNormal) {
                this.handleArrival();
            }
        } else if (this.abierto && dtNormal <= 0) {
             this.abierto = false; 
        }

        if (!this.abierto) {
            if (this.hayGente()) {
                this.tiempoExtra += (dtNormal === 0 ? dt : dtExtra); 
            } else { 
                this.trabajando = false; 
                return false; 
            }
        }

        if (this.mode === 'psych') this.checkReneging(dt);

        this.balanceQueues();   
        this.processServers(dt);
        
        // --- CALCULO DE COLA MÁXIMA ---
        const currentTotalQ = this.getTotalQueueSize();
        if(currentTotalQ > this.stats.maxQueueLength) {
            this.stats.maxQueueLength = currentTotalQ;
        }

        let busyCount = this.servidores.filter(s => s.busy).length;
        this.stats.ocupacionTotal += (busyCount / this.s) * dt;
        
        return true;
    }

    // ... (resto de métodos handleArrival, checkReneging, processServers, balanceQueues, pullGen, hayGente igual) ...
    handleArrival() {
        const esVIP = this.hasVipService && (Math.random() < this.vipProb);
        
        if (this.mode === 'psych') {
            const totalEnCola = this.getTotalQueueSize();
            if (totalEnCola > (this.tolerance * this.m)) {
                if (Math.random() < 0.7) {
                    this.stats.rechazos++;
                    return; 
                }
            }
        }

        const cliente = { 
            t: this.reloj, 
            type: esVIP ? 'PREF' : 'GEN',
            patience: this.patienceLimit * (0.8 + Math.random() * 0.4) 
        }; 
        
        if (esVIP) this.qPref.push(cliente);
        else {
            let idx = 0, min = Infinity;
            for(let i=0; i<this.m; i++){ 
                if(this.qGen[i].length < min){ min = this.qGen[i].length; idx = i; }
            }
            this.qGen[idx].push(cliente);
        }
    }

    checkReneging(dt) {
        const check = (arr) => {
            for (let i = arr.length - 1; i >= 0; i--) {
                if ((this.reloj - arr[i].t) > arr[i].patience) {
                    arr.splice(i, 1);
                    this.stats.abandonos++;
                }
            }
        };
        check(this.qPref);
        this.qGen.forEach(q => check(q));
    }

    processServers(dt) {
        this.servidores.forEach(srv => {
            if (srv.busy) {
                srv.timer -= dt;
                srv.totalBusyTime += dt;
                if (srv.timer <= 0) { 
                    srv.busy = false; 
                    srv.clientType = null; 
                    this.stats.atendidos++; 
                }
            }
            
            if (!srv.busy) {
                let clientObj = null;
                
                if (srv.type === 'PREF') {
                    if (this.qPref.length > 0) {
                        clientObj = this.qPref.shift();
                    } else {
                        clientObj = this.pullGen();
                    }
                } else {
                    clientObj = this.pullGen();
                    if (!clientObj && this.qPref.length > 0) {
                        clientObj = this.qPref.shift(); 
                    }
                }

                if (clientObj) {
                    this.stats.esperaTotal += (this.reloj - clientObj.t);
                    srv.busy = true;
                    srv.clientType = clientObj.type; // Guardamos el tipo de CLIENTE
                    srv.timer = -Math.log(1 - Math.random()) / this.mu;
                }
            }
        });
    }

    balanceQueues() {
        if (this.m <= 1) return;
        let min = Infinity, minI = -1, max = -Infinity, maxI = -1;
        for(let i=0; i<this.m; i++) {
            let l = this.qGen[i].length;
            if (l < min) { min = l; minI = i; }
            if (l > max) { max = l; maxI = i; }
        }
        if (max - min >= 2) {
            const mover = this.qGen[maxI].pop();
            this.qGen[minI].push(mover);
        }
    }

    pullGen() {
        let maxI = -1, max = 0;
        for(let i=0; i<this.m; i++) { 
            if (this.qGen[i].length > max) { max = this.qGen[i].length; maxI = i; } 
        }
        if (maxI !== -1) return this.qGen[maxI].shift();
        return null;
    }

    hayGente() { return this.qPref.length > 0 || this.qGen.some(q => q.length > 0) || this.servidores.some(s => s.busy); }
    getTotalQueueSize() { return this.qPref.length + this.qGen.reduce((a, b) => a + b.length, 0); }

    getStats() {
        const tiempoTotal = this.reloj + this.tiempoExtra;
        return {
            prefQ: this.qPref.length,
            genQ: this.qGen.reduce((a, b) => a + b.length, 0),
            ...this.stats, // Incluye maxQueueLength
            utilization: tiempoTotal > 0 ? (this.stats.ocupacionTotal / tiempoTotal) : 0, 
            avgWait: this.stats.atendidos > 0 ? (this.stats.esperaTotal / this.stats.atendidos) * 60 : 0, 
            overtime: this.tiempoExtra,
            ticket: this.ticketPrice,
            cost: this.costPerClient
        };
    }
}