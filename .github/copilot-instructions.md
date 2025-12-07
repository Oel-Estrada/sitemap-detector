# Sitemap Detector Chrome Extension

## Estructura del Proyecto

Este proyecto contiene todos los archivos necesarios para ejecutar y desarrollar el plugin de Chrome "Sitemap Detector".

### Pasos de instalación

1. **Abra Chrome Extensions:**
   - Vaya a `chrome://extensions/`

2. **Active el modo de desarrollador:**
   - Haga clic en el toggle "Modo de desarrollador" en la esquina superior derecha

3. **Cargue la extensión:**
   - Haga clic en "Cargar extensión sin empaquetar"
   - Seleccione esta carpeta (`c:\WorkSpace\extensions`)

4. **Empiece a usar:**
   - Haga clic en el icono de Sitemap Detector en la barra de herramientas
   - El plugin detectará automáticamente el sitemap del sitio actual

## Archivos Incluidos

- **manifest.json** - Configuración y permisos del plugin
- **popup.html** - Interfaz del usuario
- **popup.css** - Estilos de la interfaz
- **popup.js** - Lógica del popup y comunicación con el background
- **background.js** - Procesamiento del sitemap y lógica principal
- **images/** - Carpeta para los iconos del plugin
- **README.md** - Documentación completa

## Funcionalidades

✅ Detecta automáticamente el sitemap (sitemap.xml, sitemap_index.xml, sitemap1.xml)
✅ Verifica si la URL actual está en el sitemap
✅ Muestra información detallada del sitemap
✅ Lista todas las URLs del sitemap
✅ Muestra metadatos (fecha de actualización, prioridad, frecuencia)
✅ Interfaz moderna y responsiva

## Desarrollo

Para personalizar o mejorar el plugin, edite los archivos necesarios:

- Cambios visuales: `popup.html` y `popup.css`
- Cambios de funcionalidad: `background.js` y `popup.js`
- Cambios de permisos o configuración: `manifest.json`

Para más información, consulte `README.md`.
