# Tavola · Web de pedidos

Landing de viandas: el cliente elige, para cada día, menú estándar, saludable u opcional, y la forma de pago (diario, plan semanal o plan mensual). El pedido se envía por WhatsApp.

Es una web estática (`index.html`, `styles.css`, `app.js`): no necesita servidor ni base de datos.

## Cómo cargar el menú de la semana (Google Sheets)

1. Crear una planilla de Google con estas columnas en la primera fila (la primera hoja es la que se lee):

   | dia | tipo | plato | descripcion | precio |
   |-----|------|-------|-------------|--------|
   | Lunes | Estándar | Milanesa con papas | Milanesa casera con papas rústicas. | |
   | Lunes | Saludable | Ensalada completa | Hojas verdes, huevo y lentejas. | |
   | Lunes | Opcional | Milanesa con tortilla de papas | En lugar de papas al horno. | |

   - **dia**: Lunes, Martes, Miércoles, Jueves, Viernes, o `Todos` (aparece todos los días).
   - **tipo**: `Estándar` (o `Común`), `Saludable` u `Opcional`. El opcional es una variante del día (otra salsa, tortilla en lugar de arroz…) y se elige en lugar de los otros dos.
   - **descripcion**: opcional.
   - **precio**: opcional. Si queda vacío se usa el precio por defecto (`PRECIO_POR_DEFECTO` en `app.js`).
   - Un día sin filas no se muestra.

   Se puede partir de `menu.csv` (Archivo → Importar en Google Sheets).

2. Compartir la planilla: **Compartir → Acceso general → Cualquier persona con el enlace → Lector**.

3. Copiar el ID de la planilla (la parte del link entre `/d/` y `/edit`) y pegarlo en `SHEET_ID` en `app.js`. Esto se hace una sola vez.

   Ya está configurada la planilla [Tavola · Menú semanal](https://docs.google.com/spreadsheets/d/16ZAoyG84e3HsgFKtloFarXCU_jOTyWKfwAHMv3lZZZA/edit). Si no está compartida como "Lector" para cualquiera con el enlace, la web muestra un aviso para pedir por WhatsApp.

4. (Opcional) Para cerrar un día (feriado, caso especial), agregar una segunda pestaña llamada exactamente **Días** con estas columnas:

   | dia | abierto | motivo |
   |-----|---------|--------|
   | Lunes | 1 | |
   | Martes | 1 | |
   | Miércoles | 0 | Feriado |
   | Jueves | 1 | |
   | Viernes | 1 | |

   - **abierto**: `1` abierto, `0` cerrado. Vacío cuenta como abierto.
   - **motivo**: opcional; se muestra en la web (por ejemplo "Cerrado · Feriado").
   - Es por día de la semana: después del feriado hay que volver a ponerlo en `1`.
   - Si la pestaña no existe, todos los días quedan abiertos.

Después, cada cambio en la planilla aparece en la web al recargar la página (Google puede tardar unos minutos en reflejarlo).

Si `SHEET_ID` queda vacío, la web usa `menu.csv` (menú de ejemplo).

## Otras configuraciones (`app.js`)

- `WHATSAPP_NUMBER`: número que recibe los pedidos, formato internacional sin `+` (54 9 + característica + número).
- `PRECIO_POR_DEFECTO`: precio de cada vianda sin precio en la planilla.
- `PRECIO_SEMANAL` / `PRECIO_MENSUAL`: precio por vianda de cada plan. En `null` la web muestra "Más barato" en lugar del precio.
- `PROMO_ACTIVA`: cartel "¡Aprovechá y reservá mensualmente!" que aparece al entrar (una vez cada `PROMO_DIAS` días por celular). `false` lo apaga.
- `HORA_LIMITE`: hasta qué hora (de Argentina) se puede pedir la vianda del mismo día. Los días que ya pasaron no se muestran. Los sábados no se toman pedidos; desde el domingo se muestra la semana siguiente.

## Probar localmente

```sh
python3 -m http.server
```

y abrir http://localhost:8000 (abrir `index.html` directo con doble clic no carga el menú, porque el navegador bloquea leer archivos locales).
