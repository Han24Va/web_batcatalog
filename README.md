🦇 BatCatalog

Catálogo web tipo SPA que consume la Batman API para explorar personajes, ubicaciones, conceptos e historias del universo de Batman (línea DC Rebirth).

🔗 Demo: http://batcatalog.ddns.net/

Características

Navegación por 4 categorías: Personajes, Ubicaciones, Conceptos e Historias.
Búsqueda por nombre y filtros específicos por categoría (rol, tipo, escritor).
Ordenamiento (sort) y paginación de resultados.
Vista de detalle con información completa de cada elemento.
Estados de carga y manejo de errores controlado.
Caché local para reducir llamadas repetidas a la API.
Diseño responsive (desktop, tablet, móvil).


Stack tecnológico

Frontend: HTML5, CSS3, JavaScript (vanilla)
Cliente HTTP: fetch nativo
Fuente de datos: Batman API — REST, solo lectura (GET), sin autenticación
Control de versiones: GitHub
Despliegue: servidor propio + noIP para dominio dinámico

Cómo correrlo localmente

bash
# Clona el repositorio
git clone https://github.com/violetev100/app_batman.git
cd app_batman

# Levanta un servidor local (elige uno)
npx serve .
# o
python3 -m http.server 8080

Luego abre http://localhost:8080 (o el puerto que uses) en tu navegador.

Estructura del proyecto

app_batman/
├── index.html
├── css/
├── js/
│   ├── services/      # fetch a la Batman API
│   ├── components/    # tarjetas, detalle, filtros
│   └── cache/         # capa de caché local
├── assets/
└── README.md
