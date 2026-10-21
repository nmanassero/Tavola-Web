// ===== Configuración =====
// Número de WhatsApp en formato internacional, sin "+" ni espacios.
// wa.me necesita el código de país: para Argentina es 54 + 9 + característica + número.
// El número que se pasó fue 3425111111 (Santa Fe); confirmá que esto sea correcto.
const WHATSAPP_NUMBER = "5493425111111";

// Menúes de EJEMPLO: reemplazar por los reales (nombre, descripción, precio, imagen opcional).
const MENUS = [
  { id: "lasagna", nombre: "Lasaña de carne", descripcion: "Capas de pasta casera, bolognesa y bechamel.", precio: 8500, emoji: "🍝" },
  { id: "ravioles", nombre: "Ravioles de ricota", descripcion: "Con salsa fileto o crema, a elección.", precio: 7800, emoji: "🥟" },
  { id: "noquis", nombre: "Ñoquis de papa", descripcion: "Con salsa mixta.", precio: 7000, emoji: "🍽️" },
  { id: "milanesa", nombre: "Milanesa con puré", descripcion: "Milanesa de ternera con puré de papas.", precio: 8000, emoji: "🥩" },
  { id: "tarta", nombre: "Tarta de verduras", descripcion: "Acelga, cebolla y queso. Porción grande.", precio: 6500, emoji: "🥧" },
  { id: "postre", nombre: "Tiramisú", descripcion: "Porción individual.", precio: 4000, emoji: "🍰" },
];

// ===== Lógica =====
const cart = {};
const money = (n) => "$" + n.toLocaleString("es-AR");
const $ = (id) => document.getElementById(id);

function renderMenus() {
  $("menu-grid").innerHTML = MENUS.map((m) => `
    <article class="card">
      ${m.imagen ? `<img src="${m.imagen}" alt="${m.nombre}" loading="lazy">` : `<div class="ph" aria-hidden="true">${m.emoji || ""}</div>`}
      <div class="card-body">
        <h3>${m.nombre}</h3>
        <p>${m.descripcion}</p>
        <div class="card-foot">
          <span class="price">${money(m.precio)}</span>
          <div class="qty">
            <button type="button" data-id="${m.id}" data-delta="-1" aria-label="Quitar ${m.nombre}">−</button>
            <span id="qty-${m.id}">0</span>
            <button type="button" data-id="${m.id}" data-delta="1" aria-label="Agregar ${m.nombre}">+</button>
          </div>
        </div>
      </div>
    </article>`).join("");
}

function items() {
  return MENUS.filter((m) => cart[m.id] > 0).map((m) => ({ ...m, cantidad: cart[m.id] }));
}

function updateCart() {
  const list = items();
  const count = list.reduce((s, i) => s + i.cantidad, 0);
  const total = list.reduce((s, i) => s + i.cantidad * i.precio, 0);
  $("cart-count").textContent = count === 1 ? "1 item" : `${count} items`;
  $("cart-total").textContent = count ? money(total) : "";
  $("open-order").disabled = count === 0;
  MENUS.forEach((m) => { $("qty-" + m.id).textContent = cart[m.id] || 0; });
}

$("menu-grid").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  const id = btn.dataset.id;
  cart[id] = Math.max(0, (cart[id] || 0) + Number(btn.dataset.delta));
  updateCart();
});

const dialog = $("order-dialog");

$("open-order").addEventListener("click", () => {
  const list = items();
  $("order-list").innerHTML = list.map((i) => `<li>${i.cantidad} × ${i.nombre} — ${money(i.cantidad * i.precio)}</li>`).join("");
  $("order-total").textContent = money(list.reduce((s, i) => s + i.cantidad * i.precio, 0));
  dialog.showModal();
});

$("close-order").addEventListener("click", () => dialog.close());

$("entrega").addEventListener("change", (e) => {
  const envio = e.target.value === "Envío";
  $("direccion-field").hidden = !envio;
  $("direccion-field").querySelector("input").required = envio;
});

$("order-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  const list = items();
  const total = list.reduce((s, i) => s + i.cantidad * i.precio, 0);
  const lines = [
    "¡Hola Tavola! Quiero hacer un pedido:",
    "",
    ...list.map((i) => `• ${i.cantidad} × ${i.nombre} (${money(i.cantidad * i.precio)})`),
    "",
    `Total: ${money(total)}`,
    `Nombre: ${data.get("nombre")}`,
    `Entrega: ${data.get("entrega")}`,
  ];
  if (data.get("entrega") === "Envío") lines.push(`Dirección: ${data.get("direccion")}`);
  if (data.get("comentarios").trim()) lines.push(`Comentarios: ${data.get("comentarios").trim()}`);

  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  dialog.close();
});

renderMenus();
updateCart();
