export class QueueEngine {
    constructor(params) {
        this.lambda = params.lambda;
        this.mu = params.mu;
        this.s = params.servers; 
        this.m = params.queues;  
        this.probPref = params.lambda > 0 ? params.pref / params.lambda : 0;
        this.limitHours = params.hours;
        
        // Recibimos el parámetro (default 5 si no viene)
        this.vipStep = params.vipStep || 5; 

        this.reloj = 0.0;        
        this.tiempoExtra = 0.0;  
        this.abierto = true;     
        this.trabajando = true;  
        
        this.totalAtendidos = 0;
        this.acumEspera = 0;     
        this.acumOcupacion = 0;  
        
        this.qPref = []; 
        this.qGen = Array.from({length: this.m}, () => []);
        
        this.servidores = [];
        
        // --- LÓGICA DE DENSIDAD VIP ---
        // Calculamos cuántos VIPs tocan según el "step" elegido.
        // Ejemplo: Si s=10 y step=3 -> Math.floor(10/3) = 3 Cajas VIP.
        let sPrefCount = 0;
        
        if (this.s > 1) {
            sPrefCount = Math.floor(this.s / this.vipStep);
        }
        // Si s=1, sPrefCount se queda en 0 (Regla de oro: 1 servidor siempre es General)

        const firstPrefIndex = this.s - sPrefCount; 
        
        for(let i=0; i<this.s; i++) {
            // Los VIPs se colocan al final del arreglo para mantener el orden visual
            const isPref = i >= firstPrefIndex; 
            
            this.servidores.push({
                id: i, 
                // Asignamos tipo
                type: (sPrefCount > 0 && isPref) ? 'PREF' : 'GEN', 
                busy: false, timer: 0, clientType: null, totalBusyTime: 0
            });
        }

        this.hasVipService = this.servidores.some(s => s.type === 'PREF');
    }

    step(dt) {
        let tiempoParaCierre = Math.max(0, this.limitHours - this.reloj);
        let dtNormal = dt <= tiempoParaCierre ? dt : tiempoParaCierre;
        let dtExtra = dt > tiempoParaCierre ? dt - tiempoParaCierre : 0;

        if (dtNormal > 0) {
            this.reloj += dtNormal;
            if (Math.random() < this.lambda * dtNormal) {
                // Solo generamos VIPs si realmente hay servicio VIP
                const esVIP = this.hasVipService && (Math.random() < this.probPref);
                
                const cliente = { t: this.reloj, type: esVIP ? 'PREF' : 'GEN' }; 
                
                if (esVIP) this.qPref.push(cliente);
                else {
                    let idx = 0, min = Infinity;
                    for(let i=0; i<this.m; i++){ if(this.qGen[i].length < min){ min = this.qGen[i].length; idx = i; }}
                    this.qGen[idx].push(cliente);
                }
            }
        }

        if (this.reloj >= this.limitHours) this.abierto = false;

        if (!this.abierto) {
            if (this.hayGente()) this.tiempoExtra += dtExtra; 
            else { this.trabajando = false; return false; }
        }

        this.balanceQueues();
        
        let busyCount = 0;
        this.servidores.forEach(srv => {
            if (srv.busy) {
                busyCount++;
                srv.timer -= dt;
                srv.totalBusyTime += dt;
                if (srv.timer <= 0) { srv.busy = false; srv.clientType = null; this.totalAtendidos++; }
            }
            
            if (!srv.busy) {
                let clientObj = null;
                
                if (srv.type === 'PREF') {
                    clientObj = (this.qPref.length > 0) ? this.qPref.shift() : this.pullGen();
                } else {
                    if (!this.hasVipService && this.qPref.length > 0) {
                         clientObj = this.qPref.shift();
                    } else {
                         clientObj = this.pullGen();
                    }
                }

                if (clientObj) {
                    const horaActual = this.reloj + this.tiempoExtra;
                    this.acumEspera += (horaActual - clientObj.t);
                    srv.busy = true;
                    srv.timer = -Math.log(1 - Math.random()) / this.mu;
                    srv.clientType = clientObj.type; 
                }
            }
        });
        
        this.acumOcupacion += (busyCount / this.s) * dt;
        return true;
    }

    balanceQueues() {
        if (this.m <= 1) return;
        let min = Infinity, minI = -1, max = -Infinity, maxI = -1;
        for(let i=0; i<this.m; i++) {
            let l = this.qGen[i].length;
            if (l < min) { min = l; minI = i; }
            if (l > max) { max = l; maxI = i; }
        }
        if (max - min >= 2) this.qGen[minI].push(this.qGen[maxI].pop());
    }

    pullGen() {
        let maxI = -1, max = 0;
        for(let i=0; i<this.m; i++) { if (this.qGen[i].length > max) { max = this.qGen[i].length; maxI = i; } }
        if (maxI !== -1) return this.qGen[maxI].shift();
        return null;
    }

    hayGente() {
        return this.qPref.length > 0 || this.qGen.some(q => q.length > 0) || this.servidores.some(s => s.busy);
    }
    
    getStats() {
        const tiempoTotal = this.reloj + this.tiempoExtra;
        return {
            pref: this.qPref.length,
            gen: this.qGen.reduce((a, b) => a + b.length, 0),
            overtime: this.tiempoExtra,
            utilization: tiempoTotal > 0 ? (this.acumOcupacion / tiempoTotal) : 0, 
            avgWait: this.totalAtendidos > 0 ? (this.acumEspera / this.totalAtendidos) * 60 : 0 
        };
    }
}