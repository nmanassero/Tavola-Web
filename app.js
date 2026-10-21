// ===== Configuración =====
// Número de WhatsApp en formato internacional, sin "+" ni espacios (54 + 9 + característica + número).
const WHATSAPP_NUMBER = "5493425208204";
// El mismo número como se muestra en la web (igual que en Instagram).
const WHATSAPP_VISIBLE = "3425-208204";

// Precio de cada vianda cuando la columna "precio" de la planilla está vacía.
// Los opcionales sin precio no suman nada; si tienen precio, se suma a la vianda.
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

// Precio por vianda de cada plan. Mientras quede en null, ese precio no se muestra en la web.
const PRECIO_SEMANAL = null;
const PRECIO_MENSUAL = null;

// Cartel de promoción que aparece al entrar (una vez cada 7 días por celular). Para apagarlo: false.
const PROMO_ACTIVA = true;
const PROMO_DIAS = 7;

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
// Lo elegido para cada día: { Lunes: { menu: "i3", opcional: "i7" } }. Una sola vianda por día.
const sel = {};
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
    const precio = Number((r[col("precio")] || "").replace(/\D/g, "")) || (tipo === "opcional" ? 0 : PRECIO_POR_DEFECTO);
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
  const cerrados = pedidos().filter((p) => !CAL[p.dia].abierto);
  if (!cerrados.length) return false;
  cerrados.forEach((p) => delete sel[p.dia]);
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
    const menus = MENU.filter((i) => i.dia === dia && i.tipo !== "opcional");
    const opcionales = MENU.filter((i) => i.dia === dia && i.tipo === "opcional");
    const opciones = menus.map((i) => `
      <button type="button" class="choice choice-${i.tipo}" data-dia="${dia}" data-menu="${i.id}" aria-pressed="false">
        <span class="choice-tag">${TIPOS[i.tipo]}</span>
        <strong>${esc(i.plato)}</strong>
        ${i.descripcion ? `<span class="choice-desc">${esc(i.descripcion)}</span>` : ""}
        <span class="price">${money(i.precio)}</span>
      </button>`).join("");
    const extras = opcionales.length ? `
      <div class="extras" data-dia="${dia}">
        <h4>Opcional <small>· elegí un cambio si querés</small></h4>
        <div class="extras-list">
          ${opcionales.map((i) => `
            <button type="button" class="chip" data-dia="${dia}" data-opcional="${i.id}" aria-pressed="false" disabled>
              ${esc(i.plato)}${i.precio ? ` <small>+${money(i.precio)}</small>` : ""}
            </button>`).join("")}
        </div>
        <p class="extras-hint">Primero elegí el menú del día.</p>
      </div>` : "";
    const limite = CAL[dia].hoy ? `<span class="day-limit">Pedí hasta las ${HORA_LIMITE} hs</span>` : "";
    return `<section class="day" id="dia-${norm(dia)}"><h3>${dia} <small>${CAL[dia].fecha}</small></h3>${limite}
      <div class="day-groups">${opciones}</div>${extras}</section>`;
  }).join("");
  syncSeleccion();
}

// Refleja en los botones lo elegido en `sel`.
function syncSeleccion() {
  document.querySelectorAll("[data-menu]").forEach((b) => {
    b.setAttribute("aria-pressed", String(sel[b.dataset.dia]?.menu === b.dataset.menu));
  });
  document.querySelectorAll("[data-opcional]").forEach((b) => {
    const s = sel[b.dataset.dia];
    b.disabled = !s?.menu;
    b.setAttribute("aria-pressed", String(s?.opcional === b.dataset.opcional));
  });
  document.querySelectorAll(".extras").forEach((x) => x.classList.toggle("extras-off", !sel[x.dataset.dia]?.menu));
}

const porId = (id) => MENU.find((i) => i.id === id);

// Una entrada por día con vianda elegida.
function pedidos() {
  return DIAS.filter((d) => sel[d]?.menu).map((dia) => {
    const menu = porId(sel[dia].menu);
    const opcional = sel[dia].opcional ? porId(sel[dia].opcional) : null;
    return { dia, menu, opcional, precio: menu.precio + (opcional ? opcional.precio : 0) };
  });
}

function resumen(list) {
  const cantidad = list.length;
  const total = list.reduce((s, p) => s + p.precio, 0);
  return { texto: cantidad === 1 ? "1 vianda" : `${cantidad} viandas`, total, cantidad };
}

function updateCart() {
  const r = resumen(pedidos());
  $("cart-count").textContent = r.texto;
  $("cart-total").textContent = r.cantidad ? money(r.total) : "";
  $("open-order").disabled = r.cantidad === 0;
  syncSeleccion();
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
    ? `Total a transferir: <strong>${money(resumen(pedidos()).total)}</strong>`
    : `Incluido en tu ${PAGOS[pago].toLowerCase()}. El pago del plan lo coordinamos por WhatsApp.`;
}

// Tocar un menú lo elige (y deselecciona el otro); tocarlo de nuevo lo quita, junto con su opcional.
// El opcional es uno solo por día y solo se puede elegir si hay menú.
$("menu").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-dia]");
  if (!btn || btn.disabled) return;
  const dia = btn.dataset.dia;
  const s = sel[dia] || (sel[dia] = { menu: null, opcional: null });
  if (btn.dataset.menu) {
    if (s.menu === btn.dataset.menu) delete sel[dia];
    else s.menu = btn.dataset.menu;
  } else if (btn.dataset.opcional) {
    s.opcional = s.opcional === btn.dataset.opcional ? null : btn.dataset.opcional;
  }
  updateCart();
});

const dialog = $("order-dialog");

// Días que todavía se pueden pedir y quedaron sin vianda elegida.
function diasFaltantes() {
  return DIAS.filter((d) => CAL[d].abierto && !sel[d]?.menu && MENU.some((i) => i.dia === d && i.tipo !== "opcional"));
}

const enumerar = (xs) => xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}` : xs[0];

// Antes de abrir el pedido, si faltan días de la semana, pregunta si los quiere completar.
const faltantes = $("missing-dialog");
$("open-order").addEventListener("click", () => {
  if (quitarCerrados() && !pedidos().length) return;
  const faltan = diasFaltantes();
  if (!faltan.length) return abrirPedido();
  $("missing-text").textContent = faltan.length === 1
    ? `Te faltó elegir la vianda del ${faltan[0].toLowerCase()}.`
    : `Te faltó elegir las viandas del ${enumerar(faltan.map((d) => d.toLowerCase()))}.`;
  faltantes.dataset.primero = faltan[0];
  faltantes.showModal();
});

$("missing-complete").addEventListener("click", () => {
  faltantes.close();
  $("dia-" + norm(faltantes.dataset.primero)).scrollIntoView({ behavior: "smooth" });
});
$("missing-continue").addEventListener("click", () => {
  faltantes.close();
  abrirPedido();
});

function abrirPedido() {
  $("order-list").innerHTML = pedidos().map((p) => `
    <li><strong>${p.dia} ${CAL[p.dia].fecha}</strong>
      <ul>
        <li>${TIPOS[p.menu.tipo]}: ${esc(p.menu.plato)}</li>
        ${p.opcional ? `<li>Opcional: ${esc(p.opcional.plato)}</li>` : ""}
      </ul>
    </li>`).join("");
  restaurarDatos();
  mostrarTotal();
  dialog.showModal();
}

$("close-order").addEventListener("click", () => dialog.close());
$("order-form").elements.pago.addEventListener("change", mostrarTotal);

$("order-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (quitarCerrados()) { dialog.close(); return; }
  const data = new FormData(e.target);
  const list = pedidos();
  const lines = ["¡Hola Tavola! Quiero hacer un pedido:"];
  list.forEach((p) => {
    lines.push("", `*${p.dia} ${CAL[p.dia].fecha}*`, `• ${TIPOS[p.menu.tipo]}: ${p.menu.plato}`);
    if (p.opcional) lines.push(`• Opcional: ${p.opcional.plato}`);
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

// ===== Planes y promoción =====
function renderPlanes() {
  const planes = [
    ["Diario", PRECIO_POR_DEFECTO, "Transferís cada pedido"],
    ["Semanal", PRECIO_SEMANAL, "Pagás la semana y elegís cada día"],
    ["Mensual", PRECIO_MENSUAL, "Pagás una vez y pedís cada día"],
  ];
  const html = planes.map(([nombre, precio, detalle]) => `
    <li>
      <strong>${nombre}</strong>
      <span class="plan-price">${precio ? `${money(precio)} <small>por vianda</small>` : "Más barato"}</span>
      <small>${detalle}</small>
    </li>`).join("");
  document.querySelectorAll(".plans").forEach((ul) => { ul.innerHTML = html; });
}

const promo = $("promo-dialog");
function abrirPromo() { if (!dialog.open && !faltantes.open) promo.showModal(); }
$("promo-close").addEventListener("click", () => promo.close());
$("open-promo").addEventListener("click", abrirPromo);
$("promo-whatsapp").href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("¡Hola Tavola! Quiero info del plan mensual.")}`;

function mostrarPromoSiCorresponde() {
  if (!PROMO_ACTIVA) return;
  try {
    const ultima = Number(localStorage.getItem("tavola-promo") || 0);
    if (Date.now() - ultima < PROMO_DIAS * 86400000) return;
    localStorage.setItem("tavola-promo", String(Date.now()));
  } catch {}
  setTimeout(abrirPromo, 2500);
}

document.querySelectorAll(".wa-badge").forEach((a) => { a.href = `https://wa.me/${WHATSAPP_NUMBER}`; });
document.querySelectorAll(".wa-number").forEach((el) => { el.textContent = WHATSAPP_VISIBLE; });

renderPlanes();
mostrarPromoSiCorresponde();

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
