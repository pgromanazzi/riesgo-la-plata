# Visor de Protocolos barriales — La Plata

Aplicación estática preparada para la cuenta `pgromanazzi` y GitHub Pages. Permite seleccionar delegaciones, consultar sus barrios, buscar por nombre/código/cuenca y abrir protocolos JPG, PNG, WebP o PDF. Funciona sin base de datos, compilación, claves de API ni dependencias de Node para la publicación.

## Estado de la entrega

**Publicado:** <https://pgromanazzi.github.io/riesgo-la-plata/>. Código fuente: <https://github.com/pgromanazzi/riesgo-la-plata>. GitHub Pages sirve la carpeta `docs/` de la rama `main` con HTTPS.

El código es una implementación nueva. Incluye las **24 delegaciones y 522 barrios del sitio de referencia**, recuperados el 31/10/2026. Las geometrías y los textos de las fichas se conservan; los datos **no son la nueva actualización de 2026**. Su procedencia, estado y fecha de recuperación se informan en «Datos de esta versión», dentro de la ayuda.

Los 522 protocolos están vinculados al servidor `riesgolaplata.org`, no incluidos en este repositorio. Se ha comprobado la apertura de una muestra, no de todos los archivos. Al recibir los protocolos actualizados, se podrán alojar en `docs/protocolos/` y modificar `protocolos_base` a `protocolos/` para dejar de depender de ese servidor.

**No hay monitoreo en tiempo real ni cálculo de rutas.** El visor presenta la información existente en las capas y archivos vinculados.

## Etapa, versión y fecha de publicación

La franja inferior a la cabecera muestra **Etapa III del Programa de Reducción del Riesgo por Inundaciones · Actualizado al 02/11/2026 - v. 3.05**. El distintivo superior muestra **Versión 3.05**.

En cada actualización publicada de esta etapa, incrementar `version` siguiendo la secuencia **3.0 → 3.01 → 3.02 → 3.03 → 3.04 → 3.05**, y registrar en `fecha_version` la fecha efectiva de publicación en Argentina con formato **dd/mm/aaaa**. Mantener `version` como texto para conservar el cero de 3.01. Estos valores se editan en `docs/config.json`; la interfaz compone la leyenda automáticamente. Actualizar también el texto inicial de `docs/index.html` y la revisión del módulo para evitar mostrar la versión anterior durante la carga.

`edicion` identifica la etapa del programa. `fecha_version` identifica la publicación del visor; `fecha_datos`, `aviso` y `data/procedencia.json` documentan por separado la procedencia y vigencia de las capas y protocolos.

El pie izquierdo muestra `institucion` junto a `edicion`, y en la línea siguiente «Unidad de Gestión del Riesgo», definida por `unidad` en `docs/config.json`.

## Encuadre del mapa

El inicio, la recarga del navegador y «Ver todo» centran el conjunto de delegaciones con un margen mínimo de 24 píxeles. El zoom máximo de la vista general es `zoom` en `config.json` (11). Se permiten pasos de un cuarto de nivel para aprovechar el área disponible sin recortar el partido en pantallas pequeñas. Al centrar el partido se calcula el ancho en píxeles correspondiente a una escala gráfica de 5 km; al acercar o alejar, Leaflet recalcula normalmente la distancia indicada. La escala siempre representa la distancia real de la vista.

Al abrir un enlace compartido se respeta el barrio o delegación indicado. Una recarga vuelve a la vista general y limpia esa selección de la dirección. «Ajustar mapa a la selección» conserva el encuadre específico cuando se está consultando un barrio o una delegación.

## Fondos del mapa

El selector «Fondo del mapa», en la esquina inferior izquierda del mapa, ofrece:

- **Calles · OpenStreetMap:** cartografía de calles y lugares.
- **Google Hybrid:** imagen satelital con calles y nombres, mediante una conexión XYZ directa sin clave, del tipo utilizado en QGIS. Se consulta únicamente al seleccionar este fondo. Su disponibilidad depende de Google.

El fondo inicial se define con `mapa_base` (`osm` o `google`) en `docs/config.json`. La elección del visitante se recuerda en su navegador y tiene prioridad sobre ese valor. Desde la versión 3.04, la antigua preferencia por Sentinel-2 se migra a Google Hybrid; Sentinel-2 ya no se ofrece ni se solicita. Cambiar de fondo conserva el encuadre, la selección y la visibilidad de las capas. Los contornos se aclaran sobre la imagen para que puedan distinguirse. Si falla la carga de Google Hybrid, el visor vuelve a OpenStreetMap y avisa al visitante.

La conexión XYZ de Google no es la API oficial autenticada de Google Maps Platform ni una licencia de cartografía abierta; que una URL responda no sustituye las condiciones del proveedor. Se mantiene la atribución visible y un enlace a los [términos de Google Maps](https://www.google.com/intl/es/help/terms_maps/). Referencias: [conexiones XYZ en la documentación de QGIS](https://docs.qgis.org/3.44/en/docs/user_manual/managing_data_source/opening_data.html#using-xyz-tile-services) y [Map Tiles API oficial](https://developers.google.com/maps/documentation/tile/overview). No se configura facturación ni se utiliza una clave ajena.

## Publicación y actualizaciones en GitHub Pages

La publicación ya está configurada en **Settings → Pages → Deploy from a branch → main → /docs**. Para actualizarla:

1. Modificar los archivos del repositorio, manteniendo `docs/` como carpeta de primer nivel.
2. Ejecutar los controles indicados en «Verificación».
3. Confirmar los cambios en `main`.
4. Esperar a que **Actions → pages build and deployment** termine correctamente. GitHub Pages publica los cambios de forma automática.
5. Abrir <https://pgromanazzi.github.io/riesgo-la-plata/> y comprobar los barrios modificados y sus protocolos.

GitHub documenta la publicación desde una rama y `/docs`: <https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site>.

El programa usa rutas relativas, por lo que también funciona en un repositorio con otro nombre. No se modifica el sitio principal `pgromanazzi.github.io` ni el dominio del sitio original.

## Probar en Windows antes de publicar

En PowerShell, ubicado en la carpeta del proyecto y con Python instalado:

```powershell
py -m http.server 8000 --directory docs
```

Abrir `http://localhost:8000`. Se requiere conexión para el mapa base y los protocolos externos. Cerrar el servidor con `Ctrl+C`. No abrir `index.html` con doble clic: los navegadores restringen la lectura de GeoJSON desde `file://`.

## Archivos editables

| Parámetro / archivo | Función |
| --- | --- |
| `docs/index.html` | Estructura del visor |
| `docs/assets/app.mjs` | Navegación, mapa, fichas y protocolos |
| `docs/assets/data.mjs` | Validación, búsqueda y relaciones por identificador |
| `docs/assets/styles.css` | Diseño adaptable a computadora y celular |
| `docs/config.json` | Título, etapa, versión, fecha de publicación, estado de los datos y rutas de capas/protocolos |
| `docs/data/delegaciones.geojson` | Polígonos e identificadores de las delegaciones |
| `docs/data/barrios.geojson` | Polígonos, códigos, nombres, delegación y protocolo de cada barrio |
| `docs/data/procedencia.json` | Fuente, fecha de recuperación y ajustes de los datos de referencia |
| `docs/protocolos/` | Destino para los protocolos definitivos |
| `tools/validar-datos.mjs` | Control de IDs, coordenadas, relaciones y archivos locales |
| `docs/vendor/leaflet/` | Leaflet 1.9.4 y su licencia; se incluye localmente |

## Incorporar las nuevas capas

Se pueden preparar a partir de GeoPackage, Shapefile o GeoJSON. Para el navegador deben quedar como **GeoJSON WGS84 / EPSG:4326, longitud primero y latitud después**, con geometrías Polygon o MultiPolygon. Un GeoPackage en EPSG:5347 o EPSG:5348 requiere reproyección; no basta con cambiar la etiqueta del sistema de referencia.

En QGIS: **Exportar → Guardar objetos como… → GeoJSON → SRC EPSG:4326**. Los nombres siguientes son los del contrato del visor; si la capa usa otros, renombrarlos o adaptar una copia antes de publicar. No se usa `fid` como vínculo salvo que sea un identificador estable en ambas capas.

### Propiedades de delegaciones

| Campo | Obligatorio | Contenido |
| --- | --- | --- |
| `id` | Sí | Identificador único y estable; por ejemplo `D-10` |
| `nombre` | Sí | Nombre de la delegación |
| `superficie_km2` | No | Superficie informada, numérica, en km² |

### Propiedades de barrios

| Campo | Obligatorio | Contenido |
| --- | --- | --- |
| `id` | Sí | Código único del barrio; por ejemplo `LP-B01` |
| `nombre` | Sí | Nombre del barrio |
| `delegacion_id` | Sí | Coincide con un `id` de la capa de delegaciones |
| `cuenca` | No | Nombre de cuenca o curso |
| `protocolo` | No | Archivo relativo a `protocolos_base`, o URL HTTPS completa |
| `evitar` | No | Texto de sectores a evitar del protocolo |
| `circulacion` | No | Texto de circulación del protocolo |
| `punto_encuentro` | No | Texto de punto de encuentro del protocolo |
| `observaciones` | No | Notas del protocolo |

Los conteos y menús se generan desde las capas: no hay una lista fija de 24 delegaciones o un límite de 522 barrios. Se conserva un barrio sin protocolo, con botón deshabilitado y aviso de archivo pendiente. El vínculo territorial debe estar definido; el validador rechaza referencias inexistentes y no las asigna silenciosamente.

La revisión de límites 2026 exige actualizar `delegacion_id` en los barrios: cambiar solamente los polígonos de delegaciones no reasigna las pertenencias. Si un barrio cruza dos límites, se debe resolver el criterio de pertenencia antes de publicarlo. Este visor no recorta ni reasigna geometrías de forma automática.

### Protocolos locales

1. Copiar los archivos en `docs/protocolos/`.
2. En `config.json`, usar `"protocolos_base": "protocolos/"`.
3. En cada barrio, completar `"protocolo": "LP-B01.pdf"` con el nombre exacto correspondiente. GitHub distingue mayúsculas de minúsculas.
4. Actualizar `aviso`, `fecha_datos`, `fuente` y `data/procedencia.json` cuando se incorporen las capas definitivas; incrementar `version` y registrar `fecha_version` en cada publicación según la secuencia de la Etapa III.
5. Ejecutar el validador y comprobar en el navegador barrios de distintas delegaciones.

## Verificación

Con Node instalado, desde la raíz del proyecto:

```powershell
node tools/validar-datos.mjs
node --test tests/data.test.mjs
```

No es necesario ejecutar `npm install`. Las pruebas cubren las relaciones de la referencia, búsqueda con y sin tildes, errores de proyección/IDs, rutas de protocolos y vínculos compartidos. La comprobación de coordenadas y anillos no reemplaza un control de validez topológica, solapamientos o pertenencia territorial en SIG.

Las pruebas que verifican los conteos de Gorina y casco corresponden a esta referencia; deben actualizarse al sustituir las capas por una edición nueva. No son límites de la aplicación.

### Resultado de la verificación de esta entrega

El 31/10/2026 pasaron los ocho ensayos automáticos y el control de los 546 polígonos (24 delegaciones y 522 barrios). Se comprobaron en navegador la búsqueda, los filtros del casco y Gorina, el enlace directo a un barrio, la ficha, la apertura del protocolo LP-B01 y el diseño a 390 px de ancho. Se verificaron muestras de interacción; no se revisaron individualmente los 522 documentos externos.

La publicación en GitHub Pages se completó el 31/10/2026. En la dirección pública se comprobaron la carga de las 24 delegaciones y 522 barrios, la búsqueda de LP-B01, su ficha y la apertura del protocolo de La Loma. El fondo de calles usa OpenStreetMap; su disponibilidad depende de ese servicio externo. Las geometrías, los listados y las fichas siguen funcionando y muestran un aviso cuando el fondo falla.

En la versión 3.04 se comprobó la carga de Google Hybrid sin clave mediante XYZ, el cambio de fondo manteniendo la selección de LP-B01, la vista móvil a 390 px sin desbordamiento horizontal y el regreso automático a OpenStreetMap ante un fallo simulado del fondo de Google. Los ocho ensayos y el validador de capas continuaron pasando.

## Fuentes y componentes

- Datos y protocolos de referencia: <https://riesgolaplata.org/>. No se les asigna una licencia nueva.
- Leaflet 1.9.4: <https://leafletjs.com/download.html>. Licencia BSD-2-Clause incluida en `docs/vendor/leaflet/LICENSE`.
- Identidad municipal: logo blanco `logo_muni_LP_blanco.png` proporcionado por el responsable del sitio, conservado sin modificaciones en `docs/assets/marca/municipalidad-la-plata-blanco.png` y mostrado directamente sobre el fondo azul. El favicon conserva la variante a color de la marca.
- Paleta de la interfaz: azul `#0074BD` y azul institucional `#004389`, obtenidos de la hoja de estilos de <https://met.laplata.gob.ar/pub> el 31/10/2026. La cabecera reproduce su degradado de 100 grados entre ambos tonos; «Ver protocolo» usa `#0074BD` y cambia a `#004389` al pasar el cursor, como los botones de Alerta Temprana. Los colores cartográficos no representan niveles de peligrosidad.
- Tipografía de interfaz: Roboto, indicada en el manual. Archivo WOFF2 servido localmente, obtenido del proyecto oficial <https://github.com/google/fonts/tree/main/ofl/roboto>. Licencia SIL Open Font License incluida en `docs/vendor/roboto/OFL.txt`.
- Fondos: OpenStreetMap y Google Hybrid. Se muestra la atribución del fondo elegido. Política de teselas de OpenStreetMap: <https://operations.osmfoundation.org/policies/tiles/>.

El código y las capas se sirven desde GitHub Pages. El mapa de calles requiere OpenStreetMap, Google Hybrid requiere `mt1.google.com` y los protocolos de referencia requieren `riesgolaplata.org`. El visor solicita únicamente las teselas de la vista actual, respeta la caché del navegador y no incorpora descarga masiva ni modo sin conexión. El visor informa si no se pueden cargar las imágenes de fondo; la consulta de polígonos y listados sigue disponible.
