// ===== Configuración =====
// Número de WhatsApp en formato internacional, sin "+" ni espacios (54 + 9 + característica + número).
const WHATSAPP_NUMBER = "5493425690824";

// Precio de cada vianda cuando la columna "precio" de la planilla está vacía.
const PRECIO_POR_DEFECTO = 5700;

// ID de la planilla de Google con el menú: es la parte del link entre "/d/" y "/edit".
// La planilla tiene que estar compartida como "Cualquier persona con el enlace: Lector".
// Si queda vacío, se usa el archivo menu.csv de esta web.
const SHEET_ID = "16ZAoyG84e3HsgFKtloFarXCU_jOTyWKfwAHMv3lZZZA";

// Hora límite para pedir la vianda del mismo día (hora de Argentina, formato 24 hs).
// Los días que ya pasaron, y el día de hoy después de esta hora, no se pueden pedir.
// Los domingos ya se puede pedir para la semana siguiente; los sábados no se toman pedidos.
const HORA_LIMITE = "10:30";
const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

// ===== Datos =====
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const TIPOS = {
  estandar: "Menú estándar",
  saludable: "Menú saludable",
  opcional: "Opcional",
};

// Formas de pago. En "diario" se transfiere cada pedido; en los planes, la semana o el mes
// se pagan aparte (y más barato), y cada día se elige el menú igual.
const PAGOS = {
  diario: "Diario",
  semanal: "Plan semanal",
  mensual: "Plan mensual",
};

let MENU = [];
// Días cerrados desde la pestaña "Días" de la planilla: { Lunes: "Feriado", … }.
let CERRADOS = {};
const cart = {};
const money = (n) => "$" + n.toLocaleString("es-AR");
const $ = (id) => document.getElementById(id);
const norm = (s) => (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const esc = (s) => (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Parser de CSV que respeta comillas (descripciones con comas).
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function tipoDe(valor) {
  const t = norm(valor);
  if (t.startsWith("estandar") || t.startsWith("comun")) return "estandar";
  if (t.startsWith("saludable")) return "saludable";
  if (t.startsWith("opcional") || t.startsWith("extra")) return "opcional";
  return null;
}

function diasDe(valor) {
  const d = norm(valor);
  if (d === "todos" || d === "todos los dias") return DIAS;
  return DIAS.filter((dia) => norm(dia) === d);
}

function cargarFilas(rows) {
  const header = rows[0].map(norm);
  const col = (name) => header.indexOf(name);
  const items = [];
  rows.slice(1).forEach((r) => {
    const plato = (r[col("plato")] || "").trim();
    const tipo = tipoDe(r[col("tipo")]);
    if (!plato || !tipo) return;
    const precio = Number((r[col("precio")] || "").replace(/\D/g, "")) || PRECIO_POR_DEFECTO;
    diasDe(r[col("dia")]).forEach((dia) => {
      items.push({ id: "i" + items.length, dia, tipo, plato, descripcion: (r[col("descripcion")] || "").trim(), precio });
    });
  });
  return items;
}

async function leerCSV(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return parseCSV(await res.text());
}

async function cargarMenu() {
  return cargarFilas(await leerCSV(SHEET_ID
    ? `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`
    : "menu.csv"));
}

// Pestaña "Días" (columnas: dia, abierto, motivo). Con "abierto" en 0 el día se muestra cerrado.
// Si la pestaña no existe, Google devuelve la del menú: como no tiene la columna "abierto", se ignora.
async function cargarCerrados() {
  if (!SHEET_ID) return {};
  const rows = await leerCSV(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent("Días")}`);
  const header = rows[0].map(norm);
  const [cDia, cAbierto, cMotivo] = ["dia", "abierto", "motivo"].map((c) => header.indexOf(c));
  if (cDia < 0 || cAbierto < 0) return {};
  const cerrados = {};
  rows.slice(1).forEach((r) => {
    if ((r[cAbierto] || "").trim() !== "0") return;
    diasDe(r[cDia]).forEach((dia) => { cerrados[dia] = (r[cMotivo] || "").trim(); });
  });
  return cerrados;
}

// ===== Horario =====
// Fecha y hora actuales en Argentina, sin importar la zona horaria del celular de quien entra.
function ahora() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA, year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", hourCycle: "h23",
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { fecha: Date.UTC(p.year, p.month - 1, p.day), minutos: Number(p.hour) * 60 + Number(p.minute) };
}

// Para cada día: su fecha y si todavía se puede pedir.
function calendario() {
  const { fecha: hoy, minutos } = ahora();
  const [h, m] = HORA_LIMITE.split(":").map(Number);
  const dow = new Date(hoy).getUTCDay(); // 0 domingo … 6 sábado
  const DIA_MS = 86400000;
  // El domingo muestra la semana siguiente; el sábado la semana actual, que ya pasó entera.
  const lunes = dow === 0 ? hoy + DIA_MS : hoy - (dow - 1) * DIA_MS;
  const cal = {};
  DIAS.forEach((dia, i) => {
    const fecha = lunes + i * DIA_MS;
    const d = new Date(fecha);
    cal[dia] = {
      fecha: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`,
      hoy: fecha === hoy,
      enHorario: fecha > hoy || (fecha === hoy && minutos < h * 60 + m),
      cerrado: dia in CERRADOS ? CERRADOS[dia] : null,
    };
    cal[dia].abierto = cal[dia].enHorario && cal[dia].cerrado === null;
  });
  return cal;
}

let CAL = calendario();

// Saca del pedido lo que ya no se puede pedir (por ejemplo, si la página quedó abierta después de la hora límite).
function quitarCerrados() {
  CAL = calendario();
  const cerrados = items().filter((i) => !CAL[i.dia].abierto);
  if (!cerrados.length) return false;
  cerrados.forEach((i) => delete cart[i.id]);
  renderMenu();
  updateCart();
  alert(`Ya pasaron las ${HORA_LIMITE} hs: sacamos del pedido las viandas de ${[...new Set(cerrados.map((i) => i.dia))].join(", ")}.`);
  return true;
}

// ===== Vista =====
function renderMenu() {
  // Los días cerrados desde la planilla se muestran con su aviso; los que ya pasaron, no.
  const dias = DIAS.filter((d) => CAL[d].enHorario && (CAL[d].cerrado !== null || MENU.some((i) => i.dia === d)));
  if (!dias.some((d) => CAL[d].abierto)) {
    $("day-nav").innerHTML = "";
    $("menu").innerHTML = `<p class="error">Por esta semana ya no tomamos más pedidos. Los pedidos para la semana que viene se abren el domingo.</p>`;
    return;
  }
  $("day-nav").innerHTML = dias.map((d) => `<li><a href="#dia-${norm(d)}">${d} ${CAL[d].fecha}</a></li>`).join("");
  $("menu").innerHTML = dias.map((dia) => {
    if (!CAL[dia].abierto) {
      const motivo = CAL[dia].cerrado;
      const aviso = !motivo ? "Cerrado" : norm(motivo).startsWith("cerrado") ? esc(motivo) : `Cerrado · ${esc(motivo)}`;
      return `<section class="day day-closed" id="dia-${norm(dia)}"><h3>${dia} <small>${CAL[dia].fecha}</small></h3><p class="day-closed-note">${aviso}</p></section>`;
    }
    const grupos = Object.keys(TIPOS).map((tipo) => {
      const items = MENU.filter((i) => i.dia === dia && i.tipo === tipo);
      if (!items.length) return "";
      return `
        <div class="group group-${tipo}">
          <h4>${TIPOS[tipo]}</h4>
          ${items.map((i) => `
            <div class="dish">
              <div class="dish-info">
                <strong>${esc(i.plato)}</strong>
                ${i.descripcion ? `<p>${esc(i.descripcion)}</p>` : ""}
                <span class="price">${money(i.precio)}</span>
              </div>
              <div class="qty">
                <button type="button" data-id="${i.id}" data-delta="-1" aria-label="Quitar ${esc(i.plato)} del ${dia}">−</button>
                <span id="qty-${i.id}">0</span>
                <button type="button" data-id="${i.id}" data-delta="1" aria-label="Agregar ${esc(i.plato)} del ${dia}">+</button>
              </div>
            </div>`).join("")}
        </div>`;
    }).join("");
    const limite = CAL[dia].hoy ? `<span class="day-limit">Pedí hasta las ${HORA_LIMITE} hs</span>` : "";
    return `<section class="day" id="dia-${norm(dia)}"><h3>${dia} <small>${CAL[dia].fecha}</small></h3>${limite}<div class="day-groups">${grupos}</div></section>`;
  }).join("");
}

function items() {
  return MENU.filter((i) => cart[i.id] > 0).map((i) => ({ ...i, cantidad: cart[i.id] }));
}

function resumen(list) {
  const cantidad = list.reduce((s, i) => s + i.cantidad, 0);
  const total = list.reduce((s, i) => s + i.cantidad * i.precio, 0);
  return { texto: cantidad === 1 ? "1 vianda" : `${cantidad} viandas`, total, cantidad };
}

function updateCart() {
  const r = resumen(items());
  $("cart-count").textContent = r.texto;
  $("cart-total").textContent = r.cantidad ? money(r.total) : "";
  $("open-order").disabled = r.cantidad === 0;
  MENU.forEach((i) => { const el = $("qty-" + i.id); if (el) el.textContent = cart[i.id] || 0; });
}

function etiqueta(i) {
  return `${TIPOS[i.tipo]}: ${i.plato}`;
}

// Recordar nombre, dirección y forma de pago en este celular, para el próximo pedido.
const CAMPOS_RECORDADOS = ["nombre", "direccion", "pago"];
function recordarDatos(data) {
  try { localStorage.setItem("tavola-datos", JSON.stringify(Object.fromEntries(CAMPOS_RECORDADOS.map((c) => [c, data.get(c)])))); } catch {}
}
function restaurarDatos() {
  try {
    const datos = JSON.parse(localStorage.getItem("tavola-datos") || "{}");
    CAMPOS_RECORDADOS.forEach((c) => { if (datos[c]) $("order-form").elements[c].value = datos[c]; });
  } catch {}
}

function mostrarTotal() {
  const pago = $("order-form").elements.pago.value;
  $("order-total-line").innerHTML = pago === "diario"
    ? `Total a transferir: <strong>${money(resumen(items()).total)}</strong>`
    : `Incluido en tu ${PAGOS[pago].toLowerCase()}. El pago del plan lo coordinamos por WhatsApp.`;
}

function porDia(list) {
  return DIAS.map((dia) => ({ dia, items: list.filter((i) => i.dia === dia) })).filter((g) => g.items.length);
}

$("menu").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  const id = btn.dataset.id;
  cart[id] = Math.max(0, (cart[id] || 0) + Number(btn.dataset.delta));
  updateCart();
});

const dialog = $("order-dialog");

$("open-order").addEventListener("click", () => {
  if (quitarCerrados() && !items().length) return;
  const list = items();
  $("order-list").innerHTML = porDia(list).map((g) => `
    <li><strong>${g.dia} ${CAL[g.dia].fecha}</strong>
      <ul>${g.items.map((i) => `<li>${i.cantidad} × ${esc(etiqueta(i))}</li>`).join("")}</ul>
    </li>`).join("");
  restaurarDatos();
  mostrarTotal();
  dialog.showModal();
});

$("close-order").addEventListener("click", () => dialog.close());
$("order-form").elements.pago.addEventListener("change", mostrarTotal);

$("order-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (quitarCerrados()) { dialog.close(); return; }
  const data = new FormData(e.target);
  const list = items();
  const lines = ["¡Hola Tavola! Quiero hacer un pedido:"];
  porDia(list).forEach((g) => {
    lines.push("", `*${g.dia} ${CAL[g.dia].fecha}*`);
    g.items.forEach((i) => lines.push(`• ${i.cantidad} × ${etiqueta(i)}`));
  });
  const pago = data.get("pago");
  lines.push(
    "",
    `Forma de pago: ${PAGOS[pago]}`,
    ...(pago === "diario" ? [`Total: ${money(resumen(list).total)}`] : []),
    `Nombre: ${data.get("nombre")}`,
    `Dirección: ${data.get("direccion")}`,
  );
  if (data.get("comentarios").trim()) lines.push(`Comentarios: ${data.get("comentarios").trim()}`);

  recordarDatos(data);
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  dialog.close();
});

Promise.all([cargarMenu(), cargarCerrados().catch(() => ({}))])
  .then(([menu, cerrados]) => {
    MENU = menu;
    CERRADOS = cerrados;
    CAL = calendario();
    if (!MENU.length) throw new Error("menú vacío");
    renderMenu();
    updateCart();
  })
  .catch(() => {
    $("menu").innerHTML = `<p class="error">No pudimos cargar el menú de esta semana. Escribinos por
      <a href="https://wa.me/${WHATSAPP_NUMBER}" target="_blank" rel="noopener">WhatsApp</a> y te lo pasamos.</p>`;
  });
