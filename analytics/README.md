# Contadores de Mi Mundo

El sitio de producción sigue en GitHub Pages, con el dominio `mundo.cositasdeh.mx`. No publicar estos cambios en la copia privada de Sites.

- `mi-mundo-traffic.js` guarda vistas y clics con un identificador aleatorio de navegador, sesión y orden. No envía URL completa, parámetros, IP, correo ni otros datos de cuenta.
- La sesión es por pestaña y vence tras 30 minutos de inactividad entre eventos. El identificador de navegador se renueva a los 180 días. Navegadores distintos o almacenamiento borrado pueden contar como visitantes distintos.
- Los eventos pendientes se reintentan con el mismo UUID para no duplicarlos. No se mide localhost. El propio panel de estadísticas está excluido.
- Ambas rutas de dominó se agrupan en `domino`; `liga=ensenada` y `liga=todos-santos` se cuentan también por separado. Los demás parámetros se descartan.
- `/estadisticas/` usa el administrador general existente. Las tablas de eventos están en el esquema privado, con RLS y sin lectura directa de visitantes. La función de informes comprueba el usuario y devuelve solo agregados.
- Los registros generales, participantes de subasta y nombres de dominó son totales históricos de la base existente, separados de las visitas del periodo seleccionado. Un clic hacia Google Forms o Mercado Pago no se presenta como pedido ni pago confirmado.
- El conteo de pedidos enviados sigue en Google Forms; no existe una integración automática de respuestas ni de pagos en este cambio.

## Activar un nuevo espacio

Incluir `<script src="../mi-mundo-traffic.js" defer></script>` en cada nuevo `index.html` de primer nivel. El primer segmento de la dirección se convierte automáticamente en su contador y aparece en el panel al recibir visitas. Mantener el mismo dominio para conservar el recorrido. Las páginas del portal, libro, subasta y ambas entradas de dominó ya lo incluyen.

## Verificación

Desde `subasta`, ejecutar `npm ci` y `npm run test:traffic` con Node 22 o posterior. Las pruebas ejecutan el SQL real en PostgreSQL aislado y verifican permisos efectivos de `anon` y `authenticated`, protección del informe, reintentos, rutas, totales sin duplicar, sesión y exclusión de parámetros privados.

`001_traffic.sql` fue aplicada en Supabase con el nombre `mi_mundo_traffic_counters`. No volver a ejecutarla sobre la misma base.

## Excluir al propietario

`002_exclude_owner.sql` descarta en servidor los eventos de la sesión del administrador general. El colector envía la sesión únicamente al servicio Supabase existente; no guarda identidad en los eventos. Una sesión vencida queda pendiente hasta poder renovarse, sin degradarse a visita anónima.

El panel activa además `mm-traffic-disabled` al reconocer al administrador. La casilla «No contar mis visitas en este navegador» permite excluir también visitas sin sesión. La exclusión es por navegador y origen: hay que activarla en cada navegador que se utilice sin sesión. Los eventos pendientes de ese navegador se descartan. No se eliminan visitas anónimas anteriores porque no están asociadas a una identidad.

## Laboratorio Digital CRIA

`/laboratorio-digital-cria/` es el directorio de aplicaciones. Cada aplicación usa un segundo segmento y tiene contador propio, por ejemplo `laboratorio-digital-cria--cotizador-giclees`. Los enlaces de navegación permanecen en Mi Mundo. El cotizador se incrusta desde su implementación pública de Google Apps Script, sin parámetros de taller ni acceso a la API interna. No se duplican precios ni registros en el portal.
