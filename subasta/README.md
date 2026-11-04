# Subasta de Mi Mundo

La entrada pública es `/subasta/`. Usa la misma sesión de `mi-mundo-auth.js`, el mismo correo/PIN y el permiso `mi_mundo_is_admin()` ya utilizado por Mi Mundo.

## Preparación y compilación

Con Node.js 22.13 o posterior, desde esta carpeta:

```sh
npm ci
npm test
npm run build
```

GitHub Pages sirve `index.html` y los archivos compilados de `assets/`. El código editable está en `src/`.

## Activación de la base

La base se activó con autorización del propietario. Los archivos siguientes documentan los cambios aplicados en el proyecto de Mi Mundo:

1. `supabase/001_auction.sql` crea cinco tablas privadas, el motor de vencimientos y la interfaz de acceso controlado `mi_mundo_auction`.
2. `supabase/002_sample_catalog.sql` incorpora las seis obras ilustrativas de la versión anterior y conserva el cierre de muestra.
3. `supabase/003_expiry_job.sql` programa la revisión de vencimientos cada minuto con Supabase Cron.

Los participantes solo pueden consultar sus propios datos. Las pujas se validan en servidor bajo bloqueo transaccional. Solo el administrador general de Mi Mundo puede gestionar ofertas, datos bancarios y abonos. El acceso anónimo se limita al catálogo público agregado y a la conciliación rutinaria de plazos. Las tablas privadas tienen RLS y carecen de permisos directos para `anon` y `authenticated`.

El cron llama una función privada. No necesita claves ni un agente que esté abierto. Las visitas al catálogo también revisan vencimientos.

## Cuenta compartida

Los registros ya confirmados de Dominó entran directamente con su mismo correo y PIN. La ficha de la subasta precarga su nombre y WhatsApp cuando están disponibles, y permite completar los datos específicos de participación. Los registros nuevos conservan la confirmación de correo de Mi Mundo.

La pequeña adaptación de `martes-de-domino/index.html` permite reconocer el nombre general de las cuentas creadas desde la subasta, conservando los permisos por liga existentes. La recuperación usa la ruta `/subasta/?vista=acceso`, que debe figurar en las URL permitidas de Supabase Auth si el proyecto limita los redireccionamientos.

## Cobros y avisos

Se mantienen las reglas de participación sin depósito y 24 horas desde el aviso. El segundo postor recibe la oferta por su propia puja. Cada persona se considera una sola vez por lote.

El administrador abre `?vista=gestion`, prepara un enlace exclusivo de Mercado Pago o registra banco/CLABE/beneficiario, envía el aviso y confirma su envío para iniciar el plazo. El abono se confirma después de verificarlo en el banco o Mercado Pago. Antes de ofrecer a otro postor una obra con enlace vencido, debe desactivar ese enlace y registrarlo en el panel. Las transferencias tardías requieren revisión.

El correo de confirmación de cuentas ya está disponible en Mi Mundo. El envío automático de avisos de pujas y pagos necesita una integración de correo transaccional. Esta versión prepara los avisos para envío manual desde la organización. Los datos bancarios y las credenciales nunca se publican en GitHub.

## Pruebas

`npm test` ejecuta la migración real en PostgreSQL aislado mediante PGlite. Comprueba acceso anónimo, correo sin confirmar, administrador, privacidad entre participantes, incrementos, cierre, plazo exacto, candidatos distintos, pago tardío, enlace anterior y adjudicación única. No envía correos ni realiza cargos.
