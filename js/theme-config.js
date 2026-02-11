// Configuración global de Tailwind y temas
tailwind.config = { 
    darkMode: 'class', 
    theme: { 
        extend: { 
            fontFamily: { 
                sans: ['Inter', 'sans-serif'], 
                display: ['Outfit', 'sans-serif'], 
                mono: ['JetBrains Mono', 'monospace'] 
            },
            colors: {
                // Tonos oscuros personalizados para el fondo
                slate: { 850: '#1e293b', 950: '#020617' } 
            }
        } 
    } 
};