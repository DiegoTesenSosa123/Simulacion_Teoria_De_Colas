// Menú móvil y diagnóstico de estado (pages/*.html)
(() => {
    const btn = document.querySelector('[data-menu]');
    const menu = document.getElementById('mobile-menu');
    if (btn && menu) {
        btn.addEventListener('click', () => {
            const open = !menu.classList.toggle('hidden');
            btn.setAttribute('aria-expanded', String(open));
            btn.querySelector('span').textContent = open ? 'close' : 'menu';
        });
    }
    if (document.getElementById('status-list')) runStatus();

    async function runStatus() {
        const rows = [];
        const add = (icon, name, state, detail) => rows.push({ icon, name, state, detail });

        let gl = null;
        try { const c = document.createElement('canvas'); gl = c.getContext('webgl2') || c.getContext('webgl'); } catch (_) { /* sin WebGL */ }
        add('view_in_ar', 'Renderizado 3D (WebGL)', gl ? 'ok' : 'error',
            gl ? (window.WebGL2RenderingContext && gl instanceof WebGL2RenderingContext ? 'WebGL 2 disponible' : 'WebGL 1 disponible')
               : 'No disponible: el simulador no podrá mostrar la escena 3D.');

        const im = !!(window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports('importmap'));
        add('integration_instructions', 'Módulos ES e import maps', im ? 'ok' : 'warn',
            im ? 'Soportados' : 'No se pudo confirmar el soporte; actualiza tu navegador.');

        let ls = false;
        try { localStorage.setItem('mmm-test', '1'); localStorage.removeItem('mmm-test'); ls = true; } catch (_) { /* bloqueado */ }
        add('save', 'Almacenamiento local', ls ? 'ok' : 'warn',
            ls ? 'Disponible (solo se usa para recordar el tema).' : 'Bloqueado: el tema no se recordará; el simulador funciona igual.');

        add('devices', 'Pantalla y hardware', 'ok',
            `${innerWidth}×${innerHeight}px · DPR ${devicePixelRatio} · ${navigator.hardwareConcurrency || '?'} hilos lógicos`);

        try {
            const { QueueEngine } = await import('../js/engine.js');
            const t0 = performance.now();
            const e = new QueueEngine({ lambda: 40, mu: 15, servers: 5, queues: 3, hours: 8, vipCount: 1, vipPercent: 30 });
            let n = 0;
            while (e.step(0.004) && n++ < 50000) { /* corre la jornada completa */ }
            const ms = performance.now() - t0;
            add('memory', 'Motor de simulación (M/M/s)', ms < 1500 ? 'ok' : 'warn',
                `Jornada de 8 h simulada en ${ms.toFixed(0)} ms · ${e.getStats().atendidos} clientes atendidos`);
        } catch (_) {
            add('memory', 'Motor de simulación (M/M/s)', 'error',
                'No se pudo cargar js/engine.js. Si abriste el archivo con doble clic, usa un servidor local (los módulos ES lo requieren).');
        }

        const styles = {
            ok: ['OK', 'text-emerald-400 bg-emerald-400/10'],
            warn: ['AVISO', 'text-amber-400 bg-amber-400/10'],
            error: ['ERROR', 'text-red-400 bg-red-400/10']
        };
        const list = document.getElementById('status-list');
        list.textContent = '';
        rows.forEach((r) => {
            const li = document.createElement('li');
            li.className = 'flex items-start gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800';
            const ic = document.createElement('span');
            ic.className = 'material-icons-round text-slate-500 mt-0.5';
            ic.textContent = r.icon;
            const box = document.createElement('div');
            box.className = 'flex-1 min-w-0';
            const n = document.createElement('div');
            n.className = 'font-semibold text-white';
            n.textContent = r.name;
            const d = document.createElement('div');
            d.className = 'text-sm text-slate-400 mt-0.5';
            d.textContent = r.detail;
            box.append(n, d);
            const b = document.createElement('span');
            b.className = `text-[10px] font-bold px-2 py-1 rounded font-mono ${styles[r.state][1]}`;
            b.textContent = styles[r.state][0];
            li.append(ic, box, b);
            list.appendChild(li);
        });

        const worst = rows.some((r) => r.state === 'error') ? 'error' : rows.some((r) => r.state === 'warn') ? 'warn' : 'ok';
        const banner = document.getElementById('status-banner');
        const M = {
            ok: ['check_circle', 'Tu navegador es compatible', 'Todo lo necesario para ejecutar el simulador está disponible.', 'bg-emerald-500/10 border-emerald-500/20', 'text-emerald-400'],
            warn: ['warning', 'Compatible con avisos', 'El simulador debería funcionar, pero revisa los avisos de abajo.', 'bg-amber-500/10 border-amber-500/20', 'text-amber-400'],
            error: ['error', 'Hay problemas de compatibilidad', 'Algo imprescindible falló; revisa el detalle de abajo.', 'bg-red-500/10 border-red-500/20', 'text-red-400']
        }[worst];
        banner.className = `rounded-2xl p-6 mb-8 flex items-center gap-4 border ${M[3]}`;
        banner.textContent = '';
        const bi = document.createElement('span');
        bi.className = `material-icons-round text-4xl ${M[4]}`;
        bi.textContent = M[0];
        const bt = document.createElement('div');
        const h = document.createElement('h2'); h.className = 'text-xl font-bold text-white'; h.textContent = M[1];
        const p = document.createElement('p'); p.className = 'text-sm text-slate-400'; p.textContent = M[2];
        bt.append(h, p);
        banner.append(bi, bt);
    }
})();