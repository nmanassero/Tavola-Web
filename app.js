// ===== Configuración =====
// Número de WhatsApp en formato internacional, sin "+" ni espacios (54 + 9 + característica + número).
const WHATSAPP_NUMBER = "5493425690824";

// Precio de cada vianda u opcional cuando la columna "precio" de la planilla está vacía.
const PRECIO_POR_DEFECTO = 5700;

// ID de la planilla de Google con el menú: es la parte del link entre "/d/" y "/edit".
// La planilla tiene que estar compartida como "Cualquier persona con el enlace: Lector".
// Si queda vacío, se usa el archivo menu.csv de esta web.
const SHEET_ID = "16ZAoyG84e3HsgFKtloFarXCU_jOTyWKfwAHMv3lZZZA";

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

// ===== Vista =====
function renderMenu() {
  const dias = DIAS.filter((d) => MENU.some((i) => i.dia === d));
  $("day-nav").innerHTML = dias.map((d) => `<li><a href="#dia-${norm(d)}">${d}</a></li>`).join("");
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
    return `<section class="day" id="dia-${norm(dia)}"><h3>${dia}</h3><div class="day-groups">${grupos}</div></section>`;
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
  MENU.forEach((i) => { $("qty-" + i.id).textContent = cart[i.id] || 0; });
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
  const list = items();
  $("order-list").innerHTML = porDia(list).map((g) => `
    <li><strong>${g.dia}</strong>
      <ul>${g.items.map((i) => `<li>${i.cantidad} × ${esc(etiqueta(i))} — ${money(i.cantidad * i.precio)}</li>`).join("")}</ul>
    </li>`).join("");
  $("order-total").textContent = money(resumen(list).total);
  dialog.showModal();
});

$("close-order").addEventListener("click", () => dialog.close());

$("order-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  const list = items();
  const lines = ["¡Hola Tavola! Quiero hacer un pedido:"];
  porDia(list).forEach((g) => {
    lines.push("", `*${g.dia}*`);
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
