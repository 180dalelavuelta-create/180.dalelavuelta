/* 180° Dale la vuelta — lógica de la tienda.
   Los productos, precios y datos se editan en config.js, no acá. */

(function (global) {
  "use strict";

  /* ================= LÓGICA PURA (sin DOM, testeable) ================= */

  const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  const fmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
  function formatPrecio(n) {
    return "$ " + fmt.format(Math.round(n)).replace(/ /g, " ");
  }

  // En modo prueba se usan precios redondos de ejemplo SOLO para productos sin precio.
  function precioDe(prod, prueba) {
    if (typeof prod.precio === "number" && prod.precio > 0) return prod.precio;
    if (prueba) return prod.tipo === "combo" ? 4000 : prod.contenido && /2/.test(prod.contenido) ? 2000 : 1000;
    return null;
  }

  // Ahorro de un producto frente a comprar otro N veces (ej. promo 2 kg vs 2 × 1 kg)
  function ahorro(prod, productos, prueba) {
    const c = prod.comparaCon;
    if (!c) return null;
    const ref = productos.find((p) => p.id === c.id);
    if (!ref) return null;
    const a = precioDe(prod, prueba), b = precioDe(ref, prueba);
    if (a === null || b === null) return null;
    const dif = b * (c.cantidad || 1) - a;
    return dif > 0 ? { monto: dif, cantidad: c.cantidad || 1, nombre: ref.nombre } : null;
  }

  function sePuedeComprar(prod, prueba) {
    return !!prod && prod.disponible !== false && precioDe(prod, prueba) !== null && prod.stock !== 0;
  }

  function maximo(prod) {
    const c = global.TIENDA_CONFIG;
    const lim = c && c.maximoPorProducto > 0 ? c.maximoPorProducto : 99;
    return typeof prod.stock === "number" && prod.stock > 0 ? Math.min(prod.stock, lim) : lim;
  }

  // Limpia un carrito guardado: saca productos inexistentes, agotados o sin precio, y respeta el stock.
  function sanearCarrito(carrito, productos, prueba) {
    const limpio = {};
    for (const id of Object.keys(carrito || {})) {
      const prod = productos.find((p) => p.id === id);
      const cant = Math.floor(Number(carrito[id]));
      if (!sePuedeComprar(prod, prueba) || !(cant > 0)) continue;
      limpio[id] = Math.min(cant, maximo(prod));
    }
    return limpio;
  }

  function calcularTotales(carrito, cfg, metodoPago, prueba) {
    const lineas = [];
    let subtotal = 0;
    let baseDescuento = 0;
    const desc = cfg.pagos.transferencia.descuento;
    for (const prod of cfg.productos) {
      const cant = carrito[prod.id];
      if (!cant) continue;
      const unit = precioDe(prod, prueba);
      if (unit === null) continue;
      const sub = unit * cant;
      lineas.push({ id: prod.id, nombre: prod.nombre, cantidad: cant, unitario: unit, subtotal: sub });
      subtotal += sub;
      if (!prod.esPromocion || desc.combinableConPromociones) baseDescuento += sub;
    }
    const descuentoActivo =
      cfg.pagos.transferencia.habilitada && desc.habilitado && desc.porcentaje > 0;
    const cumpleMinimo = !desc.minimoCompra || subtotal >= desc.minimoCompra;
    const descuentoPosible = descuentoActivo && cumpleMinimo && baseDescuento > 0
      ? Math.round((baseDescuento * desc.porcentaje) / 100) : 0;
    const descuento = metodoPago === "transferencia" ? descuentoPosible : 0;
    const cantidadItems = lineas.reduce((a, l) => a + l.cantidad, 0);
    return {
      lineas, subtotal, descuento, descuentoPosible, total: subtotal - descuento, cantidadItems,
      faltaParaMinimoDescuento: descuentoActivo && !cumpleMinimo ? desc.minimoCompra - subtotal : 0,
      faltaParaPedidoMinimo: cfg.pedidoMinimo && subtotal < cfg.pedidoMinimo ? cfg.pedidoMinimo - subtotal : 0,
    };
  }

  function iso(d) {
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  function fechasDisponibles(cfg, hoy) {
    const e = cfg.entregas;
    if (!e.pedirFecha) return [];
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    d.setDate(d.getDate() + (e.diasAnticipacion || 0));
    // Fechas puntuales: tienen prioridad sobre los días de reparto
    if (e.fechas && e.fechas.length) {
      const desde = iso(d);
      return e.fechas
        .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= desde && !(e.fechasBloqueadas || []).includes(v))
        .sort()
        .map((v) => {
          const [y, m, dd] = v.split("-").map(Number);
          const f = new Date(y, m - 1, dd);
          return { valor: v, etiqueta: DIAS[f.getDay()] + " " + dd + "/" + m, larga: DIAS[f.getDay()].toLowerCase() + " " + dd + " de " + MESES[m - 1] };
        });
    }
    if (!e.diasReparto || !e.diasReparto.length) return [];
    const out = [];
    for (let i = 0; i < 60 && out.length < (e.cantidadFechas || 6); i++) {
      const valor = iso(d);
      if (e.diasReparto.includes(d.getDay()) && !(e.fechasBloqueadas || []).includes(valor)) {
        out.push({ valor, etiqueta: DIAS[d.getDay()] + " " + d.getDate() + "/" + (d.getMonth() + 1), larga: DIAS[d.getDay()].toLowerCase() + " " + d.getDate() + " de " + MESES[d.getMonth()] });
      }
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  function normalizar(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  }

  // "sin-config": no hay zonas cargadas · "en-zona" · "fuera"
  function cobertura(localidad, cfg) {
    const zonas = cfg.envio.zonas || [];
    if (!zonas.length) return "sin-config";
    return zonas.some((z) => normalizar(z.localidad) === normalizar(localidad)) ? "en-zona" : "fuera";
  }

  function textoEnvio(estado, cfg) {
    if (!cfg.envio.gratisEnZona) return "A coordinar";
    if (estado === "en-zona") return "GRATIS";
    if (estado === "fuera") return "A coordinar (fuera de la zona de reparto)";
    return "GRATIS dentro de la zona de reparto (a confirmar)";
  }

  function validar(d, cfg, opciones) {
    const err = {};
    const nombre = (d.nombre || "").trim();
    if (!nombre) err.nombre = "Escribí tu nombre y apellido.";
    else if (nombre.split(/\s+/).length < 2) err.nombre = "Sumá tu apellido, así identificamos el pedido.";
    const digitos = (d.telefono || "").replace(/\D/g, "");
    if (!digitos) err.telefono = "Necesitamos un teléfono para confirmar el pedido.";
    else if (digitos.length < 8 || digitos.length > 15) err.telefono = "Revisá el número: debería tener entre 8 y 15 dígitos.";
    if ((d.direccion || "").trim().length < 4) err.direccion = "Escribí calle y número (o lote y manzana).";
    if (!(d.localidad || "").trim()) err.localidad = "Elegí tu localidad.";
    else if (cfg.envio.zonas && cfg.envio.zonas.length && !cfg.envio.permitirOtraLocalidad && cobertura(d.localidad, cfg) !== "en-zona")
      err.localidad = "Por ahora entregamos solo en las localidades de la lista.";
    if (opciones.fechas.length && !d.fecha) err.fecha = "Elegí una fecha de entrega.";
    if (cfg.entregas.franjas.length && !(d.franjas && d.franjas.length)) err.franja = "Marcá al menos un horario en el que puedas recibir.";
    if ((d.ubicacionLink || "").trim() && !(d.ubicacion && d.ubicacion.lat) && !extraerLink(d.ubicacionLink))
      err.ubicLink = "Eso no parece un link. En Google Maps tocá Compartir → Copiar link, o dejá este campo vacío.";
    if (!d.pago) err.pago = "Elegí cómo vas a pagar.";
    return err;
  }

  // Primer link http(s) dentro de un texto pegado (Maps a veces copia texto + link)
  function extraerLink(t) {
    const m = String(t || "").match(/https?:\/\/[^\s<>"']+/i);
    return m ? m[0].replace(/[).,;]+$/, "") : "";
  }

  function linkUbicacion(d) {
    if (d.ubicacion && d.ubicacion.lat) return "https://maps.google.com/?q=" + d.ubicacion.lat + "," + d.ubicacion.lng;
    return extraerLink(d.ubicacionLink);
  }

  // Horarios marcados, en el orden de la configuración
  function textoHorarios(d, cfg) {
    const sel = d.franjas || [];
    if (!sel.length) return "";
    if (sel.includes("__todas")) return "en cualquier horario";
    return cfg.entregas.franjas.filter((f) => sel.includes(f)).join(", ");
  }

  function nombrePago(m) {
    return m === "transferencia" ? "Transferencia bancaria" : m === "efectivo" ? "Efectivo" : "";
  }

  function armarMensaje(d, t, cfg, idPedido, extra) {
    extra = extra || {};
    const L = [];
    if (extra.prueba) L.push("[PEDIDO DE PRUEBA - NO PREPARAR]", "");
    L.push("Hola, quiero realizar un pedido a " + cfg.marca.nombreMensaje + ".");
    L.push("Pedido N.º " + idPedido, "");
    L.push("DATOS DEL CLIENTE");
    L.push("Nombre: " + d.nombre.trim());
    L.push("Teléfono: " + d.telefono.trim());
    L.push("Dirección: " + d.direccion.trim());
    L.push("Localidad: " + d.localidad.trim());
    const ub = linkUbicacion(d);
    if (ub) L.push("Ubicación: " + ub);
    const hor = cfg.entregas.horario;
    if (extra.fechaEtiqueta) L.push("Fecha de entrega: " + extra.fechaEtiqueta + (hor && extra.fechaEtiqueta !== "A coordinar" ? ", " + hor.largo : ""));
    const hs = textoHorarios(d, cfg);
    if (hs) L.push("Puede recibir: " + hs);
    L.push("", "MI PEDIDO");
    for (const l of t.lineas) {
      L.push("• " + l.nombre + " x " + l.cantidad + " (" + formatPrecio(l.unitario) + " c/u) — " + formatPrecio(l.subtotal));
    }
    L.push("");
    L.push("Subtotal: " + formatPrecio(t.subtotal));
    if (t.descuento > 0) {
      L.push("Descuento por transferencia (" + cfg.pagos.transferencia.descuento.porcentaje + "%): -" + formatPrecio(t.descuento));
    }
    L.push("Envío: " + textoEnvio(cobertura(d.localidad, cfg), cfg));
    L.push("TOTAL: " + formatPrecio(t.total), "");
    L.push("Medio de pago: " + nombrePago(d.pago));
    const obs = (d.observaciones || "").trim();
    L.push("Observaciones: " + (obs || "Sin observaciones"), "");
    if (hor) L.push("Sé que pasan a dejar el pedido " + hor.largo + " y va a haber alguien para recibirlo.");
    L.push("¡Espero la confirmación del pedido!");
    return L.join("\n");
  }

  function urlWhatsApp(numero, mensaje) {
    return "https://wa.me/" + String(numero).replace(/\D/g, "") + (mensaje ? "?text=" + encodeURIComponent(mensaje) : "");
  }

  function generarId(fecha, rnd) {
    const p = (n) => String(n).padStart(2, "0");
    const r = (rnd || Math.random)().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0");
    return "180-" + String(fecha.getFullYear()).slice(2) + p(fecha.getMonth() + 1) + p(fecha.getDate()) + "-" + r;
  }

  function pendientes(cfg) {
    const out = [];
    const sinPrecio = cfg.productos.filter((p) => !(typeof p.precio === "number" && p.precio > 0));
    if (sinPrecio.length) out.push("Precios de: " + sinPrecio.map((p) => p.nombre).join(", "));
    if (!(cfg.envio.zonas || []).length) out.push("Localidades o barrios con reparto (envio.zonas)");
    const tr = cfg.pagos.transferencia;
    if (tr.habilitada && tr.alias && !tr.aliasConfirmado) out.push("Confirmar el alias de transferencia (\"" + tr.alias + "\")");
    if (tr.habilitada && !tr.cbu && !tr.titular) out.push("Datos bancarios: CBU/CVU, titular y banco (opcional)");
    if (!cfg.contacto.instagram) out.push("Link del perfil de Instagram");
    if (cfg.entregas.pedirFecha && !fechasDisponibles(cfg, new Date()).length) out.push("Próxima fecha de entrega (entregas.fechas): las cargadas ya pasaron");
    return out;
  }

  const Logica = {
    formatPrecio, precioDe, ahorro, sePuedeComprar, maximo, sanearCarrito, calcularTotales,
    fechasDisponibles, textoHorarios, extraerLink, linkUbicacion, cobertura, textoEnvio, validar, armarMensaje, urlWhatsApp, generarId, pendientes,
    nombrePago,
  };
  global.TiendaLogica = Logica;
  if (typeof module !== "undefined") module.exports = Logica;
  if (typeof document === "undefined") return;

  /* ================= INTERFAZ ================= */

  const cfg = global.TIENDA_CONFIG;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const store = {
    get(k, def) { try { const v = localStorage.getItem("180dlv_" + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem("180dlv_" + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
    del(k) { try { localStorage.removeItem("180dlv_" + k); } catch (e) { /* nada */ } },
  };
  const ses = {
    get(k) { try { return sessionStorage.getItem("180dlv_" + k); } catch (e) { return null; } },
    set(k, v) { try { v ? sessionStorage.setItem("180dlv_" + k, "1") : sessionStorage.removeItem("180dlv_" + k); } catch (e) { /* nada */ } },
  };

  const S = {
    prueba: location.hash === "#prueba" || ses.get("prueba") === "1",
    carrito: {},
    datos: Object.assign({ nombre: "", telefono: "", direccion: "", localidad: "", observaciones: "", fecha: "", franjas: [], pago: "", ubicacion: null, ubicacionLink: "" }, store.get("datos", {})),
    otraLocalidad: false,
    errores: {},
    intento: false,
    idPedido: store.get("idPedido", null),
    cantSel: {},
  };
  const faltanPrecios = cfg.productos.some((p) => !(typeof p.precio === "number" && p.precio > 0));
  if (!faltanPrecios) S.prueba = false; // con todos los precios cargados, el modo prueba no hace falta
  S.carrito = sanearCarrito(store.get("carrito", {}), cfg.productos, S.prueba);
  const fechas = fechasDisponibles(cfg, new Date());
  if (S.datos.fecha && !fechas.some((f) => f.valor === S.datos.fecha)) S.datos.fecha = "";
  if (S.datos.pago === "transferencia" && !cfg.pagos.transferencia.habilitada) S.datos.pago = "";
  if (S.datos.pago === "efectivo" && !cfg.pagos.efectivo.habilitado) S.datos.pago = "";
  const zonas = cfg.envio.zonas || [];
  if (zonas.length && S.datos.localidad && cobertura(S.datos.localidad, cfg) === "fuera") {
    if (cfg.envio.permitirOtraLocalidad) S.otraLocalidad = true; else S.datos.localidad = "";
  }

  function guardar() {
    store.set("carrito", S.carrito);
    const { ubicacion, ...resto } = S.datos; // la ubicación no se guarda entre visitas
    store.set("datos", resto);
  }

  /* ---------- Encabezado, hero, aviso ---------- */

  function iconoWA(cls) {
    return '<svg class="' + (cls || "ico") + '" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>';
  }

  function pintarEstatico() {
    if ($("#heroLogo") && "IntersectionObserver" in global && scrollY < 200) document.body.classList.add("hero-visible");
    const wa = urlWhatsApp(cfg.contacto.whatsapp, "Hola, tengo una consulta.");
    $$("[data-wa]").forEach((a) => { a.href = wa; });
    $$("[data-wa-num]").forEach((el) => { el.textContent = cfg.contacto.whatsappVisible; });
    $$("[data-logo]").forEach((img) => { img.src = cfg.marca.logo; });
    $$("[data-ico-wa]").forEach((el) => { el.innerHTML = iconoWA(); });

    const ig = cfg.contacto.instagram;
    $$("[data-instagram]").forEach((a) => {
      if (ig) { a.href = ig; a.hidden = false; } else { a.hidden = true; }
    });

    // Zonas en el hero
    const z = $("#zonasHero");
    if (zonas.length) {
      z.textContent = "Repartimos en " + zonas.map((x) => x.localidad).join(", ") + ".";
      z.hidden = false;
    }
    if (!cfg.envio.gratisEnZona) $("#envioHero").hidden = true;

    // Próxima entrega en el hero
    if (fechas.length) {
      const h = $("#fechaHero");
      h.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/></svg>' +
        esc((fechas.length === 1 ? "Entrega: " : "Próxima entrega: ") + fechas[0].larga + (cfg.entregas.horario ? ", " + cfg.entregas.horario.corto : ""));
      h.hidden = false;
    }

    if (fechas.length === 1 && cfg.entregas.horario) {
      const g = $("#graciasEntrega");
      g.textContent = "El " + fechas[0].larga + ", " + cfg.entregas.horario.largo + ", pasamos a dejarte el pedido.";
      g.hidden = false;
    }

    // Descuento visible en hero/pago
    const d = cfg.pagos.transferencia.descuento;
    if (cfg.pagos.transferencia.habilitada && d.habilitado && d.porcentaje > 0) {
      const t = $("#descHero");
      const hayPromos = !d.combinableConPromociones && cfg.productos.some((p) => p.esPromocion && p.disponible !== false);
      t.textContent = d.porcentaje + "% off por transferencia" + (d.minimoCompra ? " (compras desde " + formatPrecio(d.minimoCompra) + ")" : "") + (hayPromos ? " · excepto promos" : "");
      t.hidden = false;
    }

    // Combos: ocultar sección si no hay
    if (!cfg.productos.some((p) => p.tipo === "combo")) { $("#combos").hidden = true; $$("[data-nav-combos]").forEach((a) => { a.hidden = true; }); }

    pintarAviso();
  }

  function pintarAviso() {
    const lista = pendientes(cfg);
    const aviso = $("#aviso");
    const franja = $("#franjaPrueba");
    franja.hidden = !S.prueba;
    if (!cfg.mostrarAvisoConfiguracion || (!lista.length && !S.prueba)) { aviso.hidden = true; return; }
    aviso.hidden = false;
    $("#avisoCant").textContent = lista.length;
    $("#avisoLista").innerHTML = lista.map((x) => "<li>" + esc(x) + "</li>").join("");
    $("#avisoResumen").hidden = !lista.length;
    $("#btnPrueba").hidden = !faltanPrecios;
    $("#btnPrueba").textContent = S.prueba ? "Salir del modo prueba" : "Probar la tienda con precios de ejemplo";
  }

  function cambiarModoPrueba() {
    S.prueba = !S.prueba;
    ses.set("prueba", S.prueba);
    if (!S.prueba) S.carrito = sanearCarrito(S.carrito, cfg.productos, false);
    pintarAviso();
    pintarCatalogo();
    pintarPedido();
    toast(S.prueba ? "Modo prueba activado: precios de ejemplo" : "Modo prueba desactivado");
  }

  /* ---------- Catálogo ---------- */

  function stepper(id, valor, max, contexto, minimo) {
    const deshabilitado = false;
    return (
      '<div class="stepper" data-ctx="' + contexto + '">' +
      '<button type="button" class="st-btn" data-menos="' + id + '" aria-label="Uno menos"' + (deshabilitado || valor <= minimo ? " disabled" : "") + ">−</button>" +
      '<output class="st-val" aria-live="polite" aria-label="Cantidad">' + valor + "</output>" +
      '<button type="button" class="st-btn" data-mas="' + id + '" aria-label="Uno más"' + (deshabilitado || valor >= max ? " disabled" : "") + ">+</button>" +
      "</div>"
    );
  }

  function tarjeta(prod) {
    const precio = precioDe(prod, S.prueba);
    const comprable = sePuedeComprar(prod, S.prueba);
    const agotado = prod.disponible === false || prod.stock === 0;
    const enCarrito = S.carrito[prod.id] || 0;
    const tope = maximo(prod);
    const restante = Math.max(0, tope - enCarrito);
    const sel = restante ? Math.min(S.cantSel[prod.id] || 1, restante) : 0;
    const ejemplo = S.prueba && !(typeof prod.precio === "number" && prod.precio > 0);
    let precioHtml;
    if (agotado) precioHtml = '<span class="chip chip-agotado">Agotado</span>';
    else if (precio === null) precioHtml = '<span class="precio-pend">Precio a confirmar</span>';
    else precioHtml = '<span class="precio">' + formatPrecio(precio) + "</span>" + (ejemplo ? '<span class="chip chip-ej">ejemplo</span>' : "");

    let accion;
    if (agotado) accion = '<p class="nota-card">Sin stock por ahora. Consultanos por WhatsApp.</p>';
    else if (precio === null) accion = '<p class="nota-card">Todavía no está a la venta.</p>';
    else accion =
      '<div class="acciones">' + stepper(prod.id, sel, restante, "card", 1) +
      (restante
        ? '<button type="button" class="btn-agregar" data-agregar="' + prod.id + '">+ Agregar</button>'
        : '<button type="button" class="btn-agregar tope" disabled>Máximo ' + tope + " por pedido</button>") + "</div>" +
      '<p class="en-carrito">' + (enCarrito ? "En tu pedido: <strong>" + enCarrito + "</strong>" + (restante ? "" : " (máximo)") : "") + "</p>";

    const img = prod.imagen
      ? '<img src="' + esc(prod.imagen) + '" alt="' + esc(prod.nombre) + '" loading="eager" decoding="async" width="900" height="675">'
      : "";
    const etiqueta = prod.etiqueta && !agotado ? '<span class="etiqueta">' + esc(prod.etiqueta) + "</span>" : "";
    const ah = agotado ? null : ahorro(prod, cfg.productos, S.prueba);
    const ahorroHtml = ah ? '<p class="ahorro">¡Ahorrás ' + formatPrecio(ah.monto) + (prod.contenido ? " llevando " + esc(prod.contenido) : "") + "!</p>" : "";

    if (prod.tipo === "combo") {
      return (
        '<article class="combo' + (comprable ? "" : " no-disp") + (img ? " con-foto" : "") + '" data-prod="' + prod.id + '">' +
        (img ? '<div class="combo-foto">' + img + "</div>" : "") +
        '<div class="combo-cuerpo">' +
        '<p class="eyebrow">Combo · ' + esc(prod.contenido || "") + "</p>" +
        "<h3>" + esc(prod.nombre) + "</h3>" +
        (prod.descripcion ? '<p class="desc">' + esc(prod.descripcion) + "</p>" : "") +
        (prod.incluye && prod.incluye.length ? '<ul class="incluye">' + prod.incluye.map((i) => "<li>" + esc(i) + "</li>").join("") + "</ul>" : "") +
        '<div class="fila-precio">' + precioHtml + "</div>" + accion +
        "</div></article>"
      );
    }
    return (
      '<article class="card' + (comprable ? "" : " no-disp") + '" data-prod="' + prod.id + '">' +
      (img ? '<div class="card-foto">' + img + etiqueta + "</div>" : "") +
      '<div class="card-cuerpo">' +
      "<h3>" + esc(prod.nombre) + "</h3>" +
      '<p class="desc">' + esc(prod.descripcion || "") + (prod.contenido ? ' <span class="peso">' + esc(prod.contenido) + "</span>" : "") + "</p>" +
      '<div class="fila-precio">' + precioHtml + "</div>" + ahorroHtml + accion +
      "</div></article>"
    );
  }

  function pintarCatalogo() {
    $("#gridProductos").innerHTML = cfg.productos.filter((p) => p.tipo !== "combo").map(tarjeta).join("");
    $("#gridCombos").innerHTML = cfg.productos.filter((p) => p.tipo === "combo").map(tarjeta).join("");
  }

  // Actualiza solo textos y botones de una tarjeta; la foto no se toca (así no parpadea ni se pixela)
  function actualizarTarjeta(id) {
    const prod = cfg.productos.find((p) => p.id === id);
    const art = $('[data-prod="' + id + '"]');
    if (!prod || !art) return false;
    const tmp = document.createElement("div");
    tmp.innerHTML = tarjeta(prod);
    const nueva = tmp.firstElementChild;
    const cuerpoNuevo = nueva.querySelector(".card-cuerpo, .combo-cuerpo");
    const cuerpoViejo = art.querySelector(".card-cuerpo, .combo-cuerpo");
    if (!cuerpoNuevo || !cuerpoViejo) return false;
    cuerpoViejo.replaceWith(cuerpoNuevo);
    art.className = nueva.className;
    return true;
  }

  function actualizarCatalogo() {
    if (!cfg.productos.every((p) => actualizarTarjeta(p.id))) pintarCatalogo();
  }

  function agregar(id, boton) {
    const prod = cfg.productos.find((p) => p.id === id);
    if (!sePuedeComprar(prod, S.prueba)) { toast("Ese producto no está disponible."); return; }
    const cant = S.cantSel[id] || 1;
    const max = maximo(prod);
    const antes = S.carrito[id] || 0;
    const nuevo = Math.min(antes + cant, max);
    if (nuevo === antes) { toast("Podés pedir hasta " + max + " de " + prod.nombre + "."); return; }
    S.carrito[id] = nuevo;
    S.cantSel[id] = 1;
    $("#gracias").hidden = true;
    guardar();
    actualizarTarjeta(id);
    pintarPedido();
    toast("Agregado: " + prod.nombre + " x " + (nuevo - antes) + (nuevo === max ? " · llegaste al máximo de " + max : ""));
    const b = $('[data-agregar="' + id + '"]') || $('[data-prod="' + id + '"] .btn-agregar');
    if (b) {
      b.classList.add("ok"); b.textContent = "Agregado ✓";
      clearTimeout(agregar.t && agregar.t[id]);
      agregar.t = agregar.t || {};
      agregar.t[id] = setTimeout(() => actualizarTarjeta(id), 1400);
    }
  }

  /* ---------- Pedido ---------- */

  function pintarPedido() {
    const t = calcularTotales(S.carrito, cfg, S.datos.pago, S.prueba);
    const vacio = t.lineas.length === 0;

    // contador del header
    $$("[data-cant]").forEach((el) => { el.textContent = t.cantidadItems; el.hidden = !t.cantidadItems; });
    $("#btnCarrito").setAttribute("aria-label", "Ver pedido, " + t.cantidadItems + " productos");

    // barra inferior
    $("#barraTotal").textContent = formatPrecio(t.total);
    $("#barraCant").textContent = t.cantidadItems + (t.cantidadItems === 1 ? " producto" : " productos");
    actualizarBarra();

    $("#pedidoVacio").hidden = !vacio || !$("#gracias").hidden;
    $("#pedidoLleno").hidden = vacio;
    if (vacio) return;

    $("#lineas").innerHTML = t.lineas.map((l) => {
      const prod = cfg.productos.find((p) => p.id === l.id);
      return (
        '<li class="linea">' +
        '<div class="l-info"><span class="l-nombre">' + esc(l.nombre) + '</span><span class="l-unit">' + formatPrecio(l.unitario) + " c/u</span></div>" +
        stepper(l.id, l.cantidad, maximo(prod), "carrito", 0) +
        '<span class="l-sub">' + formatPrecio(l.subtotal) + "</span>" +
        '<button type="button" class="l-quitar" data-quitar="' + l.id + '" aria-label="Quitar ' + esc(l.nombre) + '">Quitar</button>' +
        "</li>"
      );
    }).join("");

    // totales
    const pct = cfg.pagos.transferencia.descuento.porcentaje;
    let h = '<div class="tot-fila"><span>Subtotal</span><span>' + formatPrecio(t.subtotal) + "</span></div>";
    if (t.descuento > 0) {
      h += '<div class="tot-fila tot-desc"><span>Descuento transferencia (' + pct + "%)</span><span>−" + formatPrecio(t.descuento) + "</span></div>";
    }
    const est = cobertura(S.datos.localidad, cfg);
    const envioTxt = !S.datos.localidad ? (cfg.envio.gratisEnZona ? "Gratis en zona de reparto" : "A coordinar") : textoEnvio(est, cfg).replace("GRATIS dentro de la zona de reparto (a confirmar)", "Gratis en zona de reparto");
    h += '<div class="tot-fila' + (est === "fuera" ? "" : " tot-envio") + '"><span>Envío</span><span>' + esc(envioTxt.charAt(0) + envioTxt.slice(1).toLowerCase()) + "</span></div>";
    h += '<div class="tot-fila tot-total"><span>Total</span><span>' + formatPrecio(t.total) + "</span></div>";
    if (t.descuentoPosible > 0 && S.datos.pago !== "transferencia") {
      h += '<p class="tot-hint">Pagando con transferencia: <strong>' + formatPrecio(t.subtotal - t.descuentoPosible) + "</strong> (ahorrás " + formatPrecio(t.descuentoPosible) + ").</p>";
    }
    const d = cfg.pagos.transferencia.descuento;
    const promoEnCarrito = !d.combinableConPromociones && d.habilitado && cfg.pagos.transferencia.habilitada &&
      t.lineas.some((l) => (cfg.productos.find((p) => p.id === l.id) || {}).esPromocion);
    if (promoEnCarrito && S.datos.pago === "transferencia") {
      h += '<p class="tot-hint">El ' + pct + "% por transferencia no se aplica a las promos.</p>";
    }
    if (t.faltaParaMinimoDescuento > 0) {
      h += '<p class="tot-hint">Te faltan ' + formatPrecio(t.faltaParaMinimoDescuento) + " para el " + pct + "% off por transferencia.</p>";
    }
    if (t.faltaParaPedidoMinimo > 0) {
      h += '<p class="tot-hint tot-alerta">El pedido mínimo es ' + formatPrecio(cfg.pedidoMinimo) + ". Te faltan " + formatPrecio(t.faltaParaPedidoMinimo) + ".</p>";
    }
    $("#totales").innerHTML = h;
    $("#totalFinal").textContent = formatPrecio(t.total);

    pintarCobertura();
    pintarPagoInfo();
    actualizarLinkWA();
  }

  function pintarCobertura() {
    const box = $("#coberturaMsg");
    const loc = S.datos.localidad.trim();
    const est = cobertura(loc, cfg);
    box.className = "cobertura";
    if (!loc) { box.hidden = true; return; }
    box.hidden = false;
    if (est === "en-zona") {
      box.classList.add("ok");
      box.textContent = cfg.envio.gratisEnZona ? "Llegamos a " + loc + ". El envío es gratis." : "Llegamos a " + loc + ".";
    } else if (est === "fuera") {
      box.classList.add("fuera");
      box.textContent = loc + " no está en nuestra zona de reparto habitual. Podés mandar el pedido igual y coordinamos la entrega por WhatsApp; el envío gratis no aplica.";
    } else {
      box.textContent = "Te confirmamos por WhatsApp si llegamos a tu domicilio.";
    }
  }

  function pintarPagoInfo() {
    const tr = cfg.pagos.transferencia;
    const box = $("#infoTransferencia");
    if (S.datos.pago !== "transferencia") { box.hidden = true; return; }
    const filas = [];
    if (tr.alias && tr.aliasConfirmado) filas.push(["Alias", tr.alias]);
    if (tr.cbu) filas.push(["CBU/CVU", tr.cbu]);
    if (tr.titular) filas.push(["Titular", tr.titular]);
    if (tr.cuit) filas.push(["CUIT", tr.cuit]);
    if (tr.banco) filas.push(["Banco", tr.banco]);
    box.hidden = false;
    box.innerHTML = filas.length
      ? "<p>Transferí cuando te confirmemos el pedido:</p><dl>" + filas.map((f) =>
          "<div><dt>" + esc(f[0]) + '</dt><dd><span class="copiable">' + esc(f[1]) + "</span>" + (f[0] !== "Alias" ? "" : ' <button type="button" class="btn-copiar" data-copiar="' + esc(f[1]) + '">Copiar</button>') + "</dd></div>").join("") + "</dl>"
      : "<p>Te pasamos los datos para transferir por WhatsApp cuando confirmemos el pedido.</p>";
  }

  function textoFecha() {
    const f = fechas.find((x) => x.valor === S.datos.fecha);
    if (f) return f.etiqueta;
    return cfg.entregas.pedirFecha && !fechas.length ? "A coordinar" : "";
  }

  function mensajeActual() {
    const t = calcularTotales(S.carrito, cfg, S.datos.pago, S.prueba);
    if (!S.idPedido) S.idPedido = generarId(new Date());
    return { t, msg: armarMensaje(S.datos, t, cfg, S.idPedido, { prueba: S.prueba, fechaEtiqueta: textoFecha() }) };
  }

  function actualizarLinkWA() {
    const a = $("#btnFinalizar");
    const { msg } = mensajeActual();
    a.href = urlWhatsApp(cfg.contacto.whatsapp, msg);
  }

  function pintarErrores() {
    const campos = ["nombre", "telefono", "direccion", "localidad", "fecha", "franja", "ubicLink", "pago"];
    for (const c of campos) {
      const box = $("#err-" + c);
      if (!box) continue;
      const msg = S.errores[c];
      box.textContent = msg || "";
      box.hidden = !msg;
      const ctrl = c === "localidad" ? ($("#f-localidad-otra:not([hidden])") || $("#f-localidad")) : c === "pago" ? null : $("#f-" + c);
      if (ctrl) ctrl.setAttribute("aria-invalid", msg ? "true" : "false");
    }
    $("#grupoPago").classList.toggle("invalido", !!S.errores.pago);
    $("#grupoFranja").classList.toggle("invalido", !!S.errores.franja);
  }

  function finalizar(ev) {
    const t = calcularTotales(S.carrito, cfg, S.datos.pago, S.prueba);
    if (!t.lineas.length) { ev.preventDefault(); toast("Tu pedido está vacío."); return; }
    if (t.faltaParaPedidoMinimo > 0) { ev.preventDefault(); toast("Todavía no llegás al pedido mínimo."); return; }
    S.intento = true;
    S.errores = validar(S.datos, cfg, { fechas });
    pintarErrores();
    const primero = Object.keys(S.errores)[0];
    if (primero) {
      ev.preventDefault();
      $("#resumenErrores").hidden = false;
      $("#resumenErrores").textContent = "Revisá los datos marcados para poder enviar el pedido.";
      const el = primero === "pago" ? $('input[name="pago"]') : primero === "localidad" ? ($("#f-localidad-otra:not([hidden])") || $("#f-localidad")) : $("#f-" + primero);
      if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "center", behavior: suave() }); }
      return;
    }
    $("#resumenErrores").hidden = true;
    actualizarLinkWA(); // href final ya armado; el navegador abre el link
    registrar(t);
    // El mensaje de WhatsApp ya lleva el pedido completo: vaciamos el carrito ya mismo
    // (así, si el cliente vuelve a la página, no encuentra el pedido viejo).
    pedidoEnviado($("#btnFinalizar").href);
  }

  function registrar(t) {
    const r = cfg.registroPedidos;
    if (!r || !r.habilitado || !r.url || S.prueba || S.registrado === S.idPedido) return;
    S.registrado = S.idPedido;
    const payload = JSON.stringify({
      id: S.idPedido,
      fecha: new Date().toISOString(),
      nombre: S.datos.nombre.trim(),
      telefono: S.datos.telefono.trim(),
      direccion: S.datos.direccion.trim(),
      localidad: S.datos.localidad.trim(),
      ubicacion: linkUbicacion(S.datos),
      fechaEntrega: textoFecha(),
      franja: textoHorarios(S.datos, cfg),
      productos: t.lineas.map((l) => l.nombre + " x " + l.cantidad + " (" + l.unitario + ")").join("; "),
      subtotal: t.subtotal,
      descuento: t.descuento,
      total: t.total,
      pago: nombrePago(S.datos.pago),
      envio: textoEnvio(cobertura(S.datos.localidad, cfg), cfg),
      observaciones: (S.datos.observaciones || "").trim(),
    });
    try {
      const blob = new Blob([payload], { type: "text/plain;charset=utf-8" });
      if (!(navigator.sendBeacon && navigator.sendBeacon(r.url, blob))) {
        fetch(r.url, { method: "POST", mode: "no-cors", keepalive: true, body: payload }).catch(() => {});
      }
    } catch (e) { /* el registro es opcional: WhatsApp sigue siendo el canal principal */ }
  }

  function pedidoEnviado(href) {
    // Primero se guarda (sincrónico); la pantalla se actualiza después de que se abre WhatsApp
    S.carrito = {};
    S.cantSel = {};
    S.idPedido = null;
    store.del("idPedido");
    S.datos.observaciones = "";
    S.intento = false;
    guardar();
    setTimeout(() => {
      $("#f-observaciones").value = "";
      $("#linkReabrir").href = href;
      $("#gracias").hidden = false;
      actualizarCatalogo();
      pintarPedido();
      $("#pedido").scrollIntoView({ block: "start", behavior: suave() });
    }, 0);
  }

  /* ---------- Formulario ---------- */

  function montarFormulario() {
    // Localidad: lista si hay zonas configuradas, texto libre si no
    const wrap = $("#locWrap");
    if (zonas.length) {
      $('label[for="f-localidad"]').textContent = "Localidad";
      wrap.innerHTML =
        '<select id="f-localidad" autocomplete="address-level2" aria-describedby="err-localidad">' +
        '<option value="">Elegí tu localidad</option>' +
        zonas.map((z) => '<option value="' + esc(z.localidad) + '">' + esc(z.localidad) + "</option>").join("") +
        (cfg.envio.permitirOtraLocalidad ? '<option value="__otra">Otra localidad</option>' : "") + "</select>" +
        '<input id="f-localidad-otra" type="text" autocomplete="address-level2" placeholder="Escribí tu localidad o barrio" aria-describedby="err-localidad" hidden>';
      const sel = $("#f-localidad");
      const otra = $("#f-localidad-otra");
      if (S.otraLocalidad) { sel.value = "__otra"; otra.hidden = false; otra.value = S.datos.localidad; }
      else sel.value = S.datos.localidad;
      sel.addEventListener("change", () => {
        S.otraLocalidad = sel.value === "__otra";
        otra.hidden = !S.otraLocalidad;
        S.datos.localidad = S.otraLocalidad ? otra.value : sel.value;
        if (S.otraLocalidad) otra.focus();
        cambio();
      });
      otra.addEventListener("input", () => { S.datos.localidad = otra.value; cambio(); });
    } else {
      wrap.innerHTML = '<input id="f-localidad" type="text" autocomplete="address-level2" placeholder="Ej.: barrio, localidad" aria-describedby="err-localidad">';
      const i = $("#f-localidad");
      i.value = S.datos.localidad;
      i.addEventListener("input", () => { S.datos.localidad = i.value; cambio(); });
    }

    // Fecha y franja
    if (fechas.length === 1) {
      S.datos.fecha = fechas[0].valor; // una sola fecha: no hay nada que elegir
      $("#grupoFecha").hidden = false;
      $("#f-fecha").hidden = true;
      $("#fechaFija").hidden = false;
      const hor = cfg.entregas.horario;
      $("#fechaFija").textContent = hor
        ? "El " + fechas[0].larga + ", " + hor.largo + ", pasamos a dejarte el pedido."
        : "Entregamos el " + fechas[0].larga + ".";
      $("#fechaAyuda").hidden = !hor;
    } else if (cfg.entregas.pedirFecha && !fechas.length) {
      $("#grupoFecha").hidden = false;
      $("#f-fecha").hidden = true;
      $("#fechaFija").hidden = false;
      $("#fechaFija").textContent = "Te confirmamos la próxima fecha de entrega por WhatsApp." + (cfg.entregas.horario ? " Repartimos " + cfg.entregas.horario.largo + "." : "");
    }
    if (fechas.length > 1) {
      $("#grupoFecha").hidden = false;
      $("#f-fecha").innerHTML = '<option value="">Elegí una fecha</option>' + fechas.map((f) => '<option value="' + f.valor + '">' + f.etiqueta + "</option>").join("");
      $("#f-fecha").value = S.datos.fecha;
    }

    // Horarios para recibir (varios a la vez)
    const fr = cfg.entregas.franjas || [];
    if (fr.length) {
      const valid = fr.concat(cfg.entregas.permitirCualquierHorario ? ["__todas"] : []);
      S.datos.franjas = (Array.isArray(S.datos.franjas) ? S.datos.franjas : []).filter((v) => valid.includes(v));
      $("#grupoFranja").hidden = false;
      $("#opcionesFranja").innerHTML = valid.map((f, i) =>
        '<label class="hora' + (f === "__todas" ? " hora-todas" : "") + '"><input type="checkbox" name="franja" value="' + esc(f) + '"' +
        (i === 0 ? ' id="f-franja"' : "") + (S.datos.franjas.includes(f) ? " checked" : "") + "><span>" +
        (f === "__todas" ? "Cualquier horario" : esc(f)) + "</span></label>").join("");
      $$('input[name="franja"]').forEach((cb) => cb.addEventListener("change", () => {
        let sel = $$('input[name="franja"]:checked').map((x) => x.value);
        // "Cualquier horario" y los horarios sueltos se excluyen entre sí
        if (cb.checked && cb.value === "__todas") sel = ["__todas"];
        else if (cb.checked) sel = sel.filter((v) => v !== "__todas");
        $$('input[name="franja"]').forEach((x) => { x.checked = sel.includes(x.value); });
        S.datos.franjas = sel;
        cambio();
      }));
    }

    // Textos simples
    for (const c of ["nombre", "telefono", "direccion", "observaciones", "fecha"]) {
      const el = $("#f-" + c);
      if (!el) continue;
      if (el.tagName !== "SELECT") el.value = S.datos[c] || "";
      el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => { S.datos[c] = el.value; cambio(); });
    }

    // Pago
    const opciones = [];
    if (cfg.pagos.transferencia.habilitada) {
      const d = cfg.pagos.transferencia.descuento;
      const tag = d.habilitado && d.porcentaje > 0 ? '<span class="tag-desc">' + d.porcentaje + "% off</span>" : "";
      opciones.push('<label class="opcion"><input type="radio" name="pago" value="transferencia"><span class="op-txt"><strong>Transferencia</strong>' + tag + '<small>Transferís cuando te confirmamos el pedido.</small></span></label>');
    }
    if (cfg.pagos.efectivo.habilitado) {
      opciones.push('<label class="opcion"><input type="radio" name="pago" value="efectivo"><span class="op-txt"><strong>Efectivo</strong><small>' + esc(cfg.pagos.efectivo.nota || "") + "</small></span></label>");
    }
    $("#opcionesPago").innerHTML = opciones.join("");
    $$('input[name="pago"]').forEach((r) => {
      r.checked = r.value === S.datos.pago;
      r.addEventListener("change", () => { S.datos.pago = r.value; cambio(); });
    });

    // Ubicación
    $("#btnUbicacion").addEventListener("click", pedirUbicacion);
    $("#btnQuitarUbic").addEventListener("click", () => { S.datos.ubicacion = null; pintarUbicacion(); cambio(); });
    $("#btnPegarLink").addEventListener("click", () => { mostrarLink(true); $("#f-ubicLink").focus(); });
    const inp = $("#f-ubicLink");
    inp.value = S.datos.ubicacionLink || "";
    inp.addEventListener("input", () => { S.datos.ubicacionLink = inp.value; cambio(); });
    if (S.datos.ubicacionLink) mostrarLink(true);
    pintarUbicacion();
  }

  function cambio() {
    if (S.intento) { S.errores = validar(S.datos, cfg, { fechas }); pintarErrores(); if (!Object.keys(S.errores).length) $("#resumenErrores").hidden = true; }
    guardar();
    pintarPedido();
  }

  function pedirUbicacion() {
    const st = $("#ubicEstado");
    if (!("geolocation" in navigator)) { st.textContent = "Tu navegador no permite compartir la ubicación. Podés pegar el link de Google Maps acá abajo."; mostrarLink(true); return; }
    st.textContent = "Buscando tu ubicación…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        S.datos.ubicacion = { lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) };
        pintarUbicacion();
        actualizarLinkWA();
      },
      () => {
        st.textContent = "No pudimos tomar tu ubicación (puede que el permiso esté bloqueado). Podés pegar el link de Google Maps acá abajo, o con la dirección alcanza.";
        mostrarLink(true);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  function mostrarLink(si) {
    $("#ubicLinkBox").hidden = !si || !!S.datos.ubicacion;
    $("#btnPegarLink").hidden = si || !!S.datos.ubicacion;
  }

  function pintarUbicacion() {
    const ok = !!S.datos.ubicacion;
    $("#btnUbicacion").hidden = ok;
    $("#ubicOk").hidden = !ok;
    $("#ubicEstado").textContent = ok ? "" : "Ayuda al repartidor a encontrar tu casa.";
    mostrarLink(!$("#ubicLinkBox").hidden || !!S.datos.ubicacionLink);
  }

  /* ---------- Barra inferior, toast, utilidades ---------- */

  let pedidoVisible = false;
  function actualizarBarra() {
    const barra = $("#barra");
    const hay = Object.keys(S.carrito).length > 0;
    barra.hidden = !hay || pedidoVisible;
    document.body.classList.toggle("con-barra", hay && !pedidoVisible);
  }

  let toastTimer;
  function toast(txt) {
    const el = $("#toast");
    el.textContent = txt;
    el.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("visible"), 2200);
  }

  function suave() {
    return matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  }

  function irAPedido() {
    $("#pedido").scrollIntoView({ behavior: suave(), block: "start" });
    const h = $("#pedido h2");
    if (h) h.focus({ preventScroll: true });
  }

  function copiar(texto, boton) {
    const listo = () => { boton.textContent = "Copiado"; setTimeout(() => { boton.textContent = "Copiar"; }, 1500); };
    try {
      navigator.clipboard.writeText(texto).then(listo, () => seleccionar(boton));
    } catch (e) { seleccionar(boton); }
  }
  function seleccionar(boton) {
    const span = boton.previousElementSibling;
    const r = document.createRange(); r.selectNodeContents(span);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  /* ---------- Eventos ---------- */

  function montarEventos() {
    $("#form").addEventListener("submit", (e) => { e.preventDefault(); $("#btnFinalizar").click(); });
    document.addEventListener("click", (e) => {
      const t = e.target.closest("button, a");
      if (!t) return;
      if (t.dataset.agregar) return agregar(t.dataset.agregar, t);
      if (t.dataset.quitar) {
        const prod = cfg.productos.find((p) => p.id === t.dataset.quitar);
        delete S.carrito[t.dataset.quitar]; guardar(); actualizarCatalogo(); pintarPedido();
        toast("Quitaste " + (prod ? prod.nombre : "el producto"));
        const sig = $("[data-quitar]") || $("#pedido h2"); if (sig) sig.focus();
        return;
      }
      if (t.dataset.mas || t.dataset.menos) {
        const id = t.dataset.mas || t.dataset.menos;
        const prod = cfg.productos.find((p) => p.id === id);
        const delta = t.dataset.mas ? 1 : -1;
        const ctx = t.closest(".stepper").dataset.ctx;
        if (ctx === "card") {
          const restante = Math.max(1, maximo(prod) - (S.carrito[id] || 0));
          S.cantSel[id] = Math.max(1, Math.min(restante, (S.cantSel[id] || 1) + delta));
          actualizarTarjeta(id);
        } else {
          const n = (S.carrito[id] || 0) + delta;
          if (n <= 0) delete S.carrito[id]; else S.carrito[id] = Math.min(n, maximo(prod));
          guardar(); actualizarTarjeta(id); pintarPedido();
        }
        const mismo = $('.stepper[data-ctx="' + ctx + '"] [data-' + (delta > 0 ? "mas" : "menos") + '="' + id + '"]');
        if (mismo && !mismo.disabled) mismo.focus();
        else if (mismo) { const otro = mismo.parentElement.querySelector(".st-btn:not([disabled])"); if (otro) otro.focus(); }
        return;
      }
      if (t.dataset.copiar) return copiar(t.dataset.copiar, t);
      if (t.id === "btnCarrito" || t.id === "btnBarra") { e.preventDefault(); return irAPedido(); }
      if (t.id === "btnFinalizar") return finalizar(e);
      if (t.id === "btnPrueba") return cambiarModoPrueba();
      if (t.id === "btnSeguir") { $("#gracias").hidden = true; pintarPedido(); $("#productos").scrollIntoView({ behavior: suave() }); }
    });

    if ("IntersectionObserver" in global) {
      const heroLogo = $("#heroLogo");
      if (heroLogo) {
        new IntersectionObserver((ents) => {
          document.body.classList.toggle("hero-visible", ents[0].isIntersecting);
        }, { rootMargin: "-64px 0px 0px 0px" }).observe(heroLogo);
      }
      new IntersectionObserver((ents) => {
        pedidoVisible = ents[0].isIntersecting;
        actualizarBarra();
      }, { rootMargin: "0px 0px -35% 0px" }).observe($("#pedido"));
    }
  }

  function iniciar() {
    pintarEstatico();
    montarFormulario();
    pintarCatalogo();
    pintarPedido();
    montarEventos();
    $("#anio").textContent = new Date().getFullYear();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})(typeof window !== "undefined" ? window : globalThis);
