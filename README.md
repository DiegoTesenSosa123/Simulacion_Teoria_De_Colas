# 🛒 Simulador de Teoría de Colas (M/M/s) - 3D

> **Curso:** Investigación de Operaciones  
> **Grupo:** 1  
> **Universidad:** [Nombre de tu Universidad]

Este proyecto es una aplicación web interactiva para simular sistemas de líneas de espera (Teoría de Colas) con visualización en 3D en tiempo real. Permite modelar escenarios de múltiples servidores, colas preferenciales y análisis de costos operativos.

## 🚀 Características Principales

* **Visualización 3D (Three.js):**
    * Representación gráfica de servidores y clientes.
    * Animaciones de llegada, movimiento a caja y salida.
    * Distinción visual: Clientes VIP (Morados) vs Generales (Naranjas).
    * Indicadores de estado de caja (Verde=Libre, Rojo=Ocupado, Amarillo=Ocupado Pref).
* **Interfaz Responsiva (Mobile First):**
    * Diseño adaptable para PC y Celulares.
    * Menú lateral y controles táctiles optimizados.
* **Analítica en Tiempo Real:**
    * Gráficas de flujo de ocupación separadas (Chart.js).
    * Cronómetro de simulación y **Tiempo Extra** post-cierre.
* **Análisis Financiero:**
    * Configuración de costos (Sueldos, Costo de espera, Ingresos).
    * Reporte detallado con Diagnóstico Inteligente (ROI, Rentabilidad, Sugerencias).
* **Audio Inmersivo:** Música de fondo ambiental con controles de volumen.

## 🛠️ Tecnologías Utilizadas

* **Core:** HTML5, CSS3, JavaScript (ES6 Modules).
* **Estilos:** [Tailwind CSS](https://tailwindcss.com/) (vía CDN).
* **Gráficos 3D:** [Three.js](https://threejs.org/).
* **Gráficas de Datos:** [Chart.js](https://www.chartjs.org/).
* **Iconos:** Google Material Icons.

## 👥 Integrantes del Grupo 1

* **Bances Celeste**
* **Cabrera Brayan**
* **Sanchez Gomeador**
* **Tesen Sosa, Diego**
* **Vigil Joaquin**

## ⚙️ Configuración de la Simulación

La aplicación permite ajustar los siguientes parámetros de entrada:

1.  **Tasa de Llegada ($\lambda$):** Clientes por hora.
2.  **Tasa de Servicio ($\mu$):** Capacidad de atención por hora.
3.  **Número de Servidores ($s$):** Cantidad de cajas activas.
4.  **Costos:** Salario por hora, costo de oportunidad, ticket promedio.

## 📦 Instalación y Uso

1.  **Clonar el repositorio:**
    ```bash
    git clone [https://github.com/DiegoTesenSosa123/Simulacion-Teoria-Colas.git](https://github.com/DiegoTesenSosa123/Simulacion-Teoria-Colas.git)
    ```
2.  **Ejecutar:**
    * No requiere instalación de Node.js ni servidores complejos.
    * Simplemente abre el archivo `index.html` en tu navegador moderno favorito (Chrome, Edge, Firefox).
    * *Recomendación:* Usar la extensión "Live Server" en VS Code para evitar problemas de CORS con los módulos de JavaScript.

## 📄 Licencia

Este proyecto es de uso académico y educativo.