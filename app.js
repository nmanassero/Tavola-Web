// ===== Configuración =====
// Número de WhatsApp en formato internacional, sin "+" ni espacios (54 + 9 + característica + número).
const WHATSAPP_NUMBER = "5493425690824";

// Precio de cada vianda u opcional cuando la columna "precio" de la planilla está vacía.
const PRECIO_POR_DEFECTO = 5700;

// ID de la planilla de Google con el menú: es la parte del link entre "/d/" y "/edit".
// La planilla tiene que estar compartida como "Cualquier persona con el enlace: Lector".
// Si queda vacío, se usa el archivo menu.csv de esta web.
const SHEET_ID = "16ZAoyG84e3HsgFKtloFarXCU_jOTyWKfwAHMv3lZZZA";

// Hora límite para pedir la vianda del mismo día (hora de Argentina).
// Los días que ya pasaron, y el día de hoy después de esta hora, no se pueden pedir.
// Sábados y domingos se muestra la semana siguiente completa.
const HORA_LIMITE = "10:30";
const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

// ===== Datos =====
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const TIPOS = {
  estandar: "Menú estándar",
  saludable: "Menú saludable",
  opcional: "Opcionales",
};

let MENU = [];
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
  if (t.startsWith("estandar")) return "estandar";
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

async function cargarMenu() {
  const url = SHEET_ID
    ? `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`
    : "menu.csv";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return cargarFilas(parseCSV(await res.text()));
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
  const lunes = dow === 0 || dow === 6 ? hoy + ((8 - dow) % 7) * DIA_MS : hoy - (dow - 1) * DIA_MS;
  const cal = {};
  DIAS.forEach((dia, i) => {
    const fecha = lunes + i * DIA_MS;
    const d = new Date(fecha);
    cal[dia] = {
      fecha: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`,
      hoy: fecha === hoy,
      abierto: fecha > hoy || (fecha === hoy && minutos < h * 60 + m),
    };
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
  const dias = DIAS.filter((d) => CAL[d].abierto && MENU.some((i) => i.dia === d));
  $("day-nav").innerHTML = dias.map((d) => `<li><a href="#dia-${norm(d)}">${d} ${CAL[d].fecha}</a></li>`).join("");
  if (!dias.length) {
    $("menu").innerHTML = `<p class="error">Por esta semana ya no tomamos más pedidos. Los pedidos para la semana que viene se abren el sábado.</p>`;
    return;
  }
  $("menu").innerHTML = dias.map((dia) => {
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
  const viandas = list.filter((i) => i.tipo !== "opcional").reduce((s, i) => s + i.cantidad, 0);
  const opcionales = list.filter((i) => i.tipo === "opcional").reduce((s, i) => s + i.cantidad, 0);
  const total = list.reduce((s, i) => s + i.cantidad * i.precio, 0);
  const partes = [];
  if (viandas) partes.push(viandas === 1 ? "1 vianda" : `${viandas} viandas`);
  if (opcionales) partes.push(opcionales === 1 ? "1 opcional" : `${opcionales} opcionales`);
  return { texto: partes.join(" + ") || "0 viandas", total, cantidad: viandas + opcionales };
}

function updateCart() {
  const r = resumen(items());
  $("cart-count").textContent = r.texto;
  $("cart-total").textContent = r.cantidad ? money(r.total) : "";
  $("open-order").disabled = r.cantidad === 0;
  MENU.forEach((i) => { const el = $("qty-" + i.id); if (el) el.textContent = cart[i.id] || 0; });
}

function etiqueta(i) {
  return i.tipo === "opcional" ? `Opcional: ${i.plato}` : `${TIPOS[i.tipo]}: ${i.plato}`;
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
      <ul>${g.items.map((i) => `<li>${i.cantidad} × ${esc(etiqueta(i))} — ${money(i.cantidad * i.precio)}</li>`).join("")}</ul>
    </li>`).join("");
  $("order-total").textContent = money(resumen(list).total);
  dialog.showModal();
});

$("close-order").addEventListener("click", () => dialog.close());

$("order-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (quitarCerrados()) { dialog.close(); return; }
  const data = new FormData(e.target);
  const list = items();
  const lines = ["¡Hola Tavola! Quiero hacer un pedido:"];
  porDia(list).forEach((g) => {
    lines.push("", `*${g.dia} ${CAL[g.dia].fecha}*`);
    g.items.forEach((i) => lines.push(`• ${i.cantidad} × ${etiqueta(i)} (${money(i.cantidad * i.precio)})`));
  });
  lines.push(
    "",
    `Total: ${money(resumen(list).total)}`,
    `Nombre: ${data.get("nombre")}`,
    `Dirección: ${data.get("direccion")}`,
  );
  if (data.get("comentarios").trim()) lines.push(`Comentarios: ${data.get("comentarios").trim()}`);

  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  dialog.close();
});

cargarMenu()
  .then((menu) => {
    MENU = menu;
    if (!MENU.length) throw new Error("menú vacío");
    renderMenu();
    updateCart();
  })
  .catch(() => {
    $("menu").innerHTML = `<p class="error">No pudimos cargar el menú de esta semana. Escribinos por
      <a href="https://wa.me/${WHATSAPP_NUMBER}" target="_blank" rel="noopener">WhatsApp</a> y te lo pasamos.</p>`;
  });
