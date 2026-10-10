// Configuración global de Tailwind (debe cargarse después del script CDN de Tailwind)
if (typeof tailwind !== 'undefined') {
    tailwind.config = {
        darkMode: 'class',
        theme: {
            extend: {
                fontFamily: {
                    sans: ['Inter', 'sans-serif'],
                    display: ['Outfit', 'sans-serif'],
                    mono: ['JetBrains Mono', 'monospace']
                },
                colors: { slate: { 850: '#1e293b', 950: '#020617' } }
            }
        }
    };
} else {
    console.warn('Tailwind CDN no cargó: se omite theme-config.');
}