# Tavola · Web de pedidos

Landing de viandas: el cliente elige, para cada día, una vianda (menú estándar o saludable) y, si quiere, un opcional, y la forma de pago (diario, plan semanal o plan mensual, con su precio y ahorro). El pedido se envía por WhatsApp.

Es una web estática (`index.html`, `styles.css`, `app.js`): no necesita servidor ni base de datos.

## Cómo cargar el menú de la semana (Google Sheets)

1. Crear una planilla de Google con estas columnas en la primera fila (la primera hoja es la que se lee):

   | dia | tipo | plato | descripcion | precio |
   |-----|------|-------|-------------|--------|
   | Lunes | Estándar | Milanesa con papas | Milanesa casera con papas rústicas. | |
   | Lunes | Saludable | Ensalada completa | Hojas verdes, huevo y lentejas. | |
   | Lunes | Opcional | Milanesa con tortilla de papas | En lugar de papas al horno. | |

   - **dia**: Lunes, Martes, Miércoles, Jueves, Viernes, o `Todos` (aparece todos los días).
   - **tipo**: `Estándar` (o `Común`), `Saludable` u `Opcional`. Por día se elige una sola vianda: estándar **o** saludable. El opcional es un cambio sobre esa vianda (otra salsa, tortilla en lugar de arroz…); se puede elegir uno solo.
   - **descripcion**: opcional.
   - **precio**: opcional. En los menús, si queda vacío se usa el precio por defecto ("Precio vianda" de la pestaña Precios, o `PRECIOS` en `app.js`). En los opcionales, vacío significa sin cargo; si tiene precio, se suma a la vianda.
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

5. (Opcional) Para configurar precios y planes, agregar una pestaña llamada exactamente **Precios**:

   | concepto | valor |
   |----------|-------|
   | Precio vianda | 5700 |
   | Días por mes | 20 |
   | Ahorro plan semanal (viandas por mes) | 1 |
   | Ahorro plan mensual (viandas por mes) | 3 |

   - Todo se calcula sobre un mes de "Días por mes" días hábiles: sin plan, 20 × $5.700 = $114.000; plan semanal, una vianda menos ($108.300, se paga por semana); plan mensual, tres viandas menos ($96.900).
   - La web muestra el precio sin plan tachado, el precio del plan y el porcentaje de ahorro.
   - "Precio vianda" también es el precio de los menús que tengan la columna `precio` vacía en el menú.
   - Si la pestaña no existe, se usan los valores de `PRECIOS` en `app.js`.

Después, cada cambio en la planilla aparece en la web al recargar la página (Google puede tardar unos minutos en reflejarlo).

Si `SHEET_ID` queda vacío, la web usa `menu.csv` (menú de ejemplo).

## Otras configuraciones (`app.js`)

- `WHATSAPP_NUMBER`: número que recibe los pedidos, formato internacional sin `+` (54 9 + característica + número).
- `WHATSAPP_VISIBLE`: el mismo número como se muestra en la web (por ejemplo `3425-208204`).
- `PRECIOS`: valores por defecto de precios y planes, que se usan si la planilla no tiene la pestaña "Precios".
- `PROMO_ACTIVA`: cartel "¡Aprovechá y reservá mensualmente!" que aparece al entrar (una vez cada `PROMO_DIAS` días por celular). `false` lo apaga.
- `HORA_LIMITE`: hasta qué hora (de Argentina) se puede pedir la vianda del mismo día. Los días que ya pasaron no se muestran. Los sábados no se toman pedidos; desde el domingo se muestra la semana siguiente.

Al cambiar `app.js` o `styles.css`, subir el número de versión (`?v=`) en `index.html` para que los celulares no usen la versión anterior guardada.

## Probar localmente

```sh
python3 -m http.server
```

y abrir http://localhost:8000 (abrir `index.html` directo con doble clic no carga el menú, porque el navegador bloquea leer archivos locales).
