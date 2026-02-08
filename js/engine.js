import { COST_PARAMS } from './config.js';

export class QueueEngine {
    constructor(params) {
        this.lambda = params.lambda;
        this.mu = params.mu;
        this.s = params.servers; 
        this.m = params.queues;  
        this.probPref = params.lambda > 0 ? COST_PARAMS.prefRate / params.lambda : 0;
        this.limitHours = COST_PARAMS.hours;
        this.reloj = 0.0;
        this.abierto = true;
        this.totalAtendidos = 0;
        
        this.qPref = []; 
        this.qGen = Array.from({length: this.m}, () => []);
        this.servidores = [];
        
        const sPrefCount = Math.max(1, Math.floor(this.s / 5));
        const firstPrefIndex = this.s - sPrefCount; 
        for(let i=0; i<this.s; i++) {
            const isPref = i >= firstPrefIndex; 
            this.servidores.push({id: i, type: isPref ? 'PREF' : 'GEN', busy: false, timer: 0, clientType: null});
        }
    }

    step(dt) {
        if (this.reloj < this.limitHours) {
            this.reloj += dt;
            if (Math.random() < this.lambda * dt) {
                if (Math.random() < this.probPref) this.qPref.push('PREF');
                else {
                    let idx = 0, min = Infinity;
                    for(let i=0; i<this.m; i++){ if(this.qGen[i].length < min){ min = this.qGen[i].length; idx = i; }}
                    this.qGen[idx].push('GEN');
                }
            }
        } else { this.abierto = false; }

        this.balanceQueues();

        for (let i = this.servidores.length - 1; i >= 0; i--) {
            let srv = this.servidores[i];
            if (srv.busy) {
                srv.timer -= dt;
                if (srv.timer <= 0) { srv.busy = false; srv.clientType = null; this.totalAtendidos++; }
            }
            if (!srv.busy) {
                let client = null;
                if (srv.type === 'PREF') {
                    if (this.qPref.length > 0) client = this.qPref.shift();
                    else client = this.pullGen();
                } else {
                    client = this.pullGen();
                }
                if (client) {
                    srv.busy = true;
                    srv.timer = -Math.log(1 - Math.random()) / this.mu;
                    srv.clientType = client;
                }
            }
        }
        return this.abierto || this.hayGente();
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
        for(let i=0; i<this.m; i++) {
            if (this.qGen[i].length > max) { max = this.qGen[i].length; maxI = i; }
        }
        if (maxI !== -1) return this.qGen[maxI].shift();
        for(let i=0; i<this.m; i++) if(this.qGen[i].length > 0) return this.qGen[i].shift();
        return null;
    }

    hayGente() {
        const totalGen = this.qGen.reduce((a, b) => a + b.length, 0);
        return this.qPref.length > 0 || totalGen > 0 || this.servidores.some(s => s.busy);
    }
    
    getStats() {
        return {
            pref: this.qPref.length,
            gen: this.qGen.reduce((a, b) => a + b.length, 0)
        };
    }
}