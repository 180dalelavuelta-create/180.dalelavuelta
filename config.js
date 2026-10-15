/* =====================================================================
   180° DALE LA VUELTA — CONFIGURACIÓN DE LA TIENDA
   ---------------------------------------------------------------------
   Este es el ÚNICO archivo que hace falta editar para cambiar productos,
   precios, stock, zonas de reparto, pagos y redes.

   Todo lo marcado con  ⚠️ COMPLETAR  falta cargar antes de publicar.
   Mientras falten datos, la web muestra un aviso arriba con la lista
   de pendientes (se puede apagar con mostrarAvisoConfiguracion: false).

   Reglas para editar:
   - Los textos van entre comillas: "así".
   - Los precios van SIN signo $ ni puntos: 12500  (no "$12.500").
   - null significa "todavía no hay dato".
   ===================================================================== */

window.TIENDA_CONFIG = {

  marca: {
    nombre: "180° Dale la vuelta",
    nombreMensaje: "180 Dale la Vuelta",   // cómo aparece en el mensaje de WhatsApp
    bajada: "Milanesas a tu puerta",
    ubicacion: "Río Ceballos, Córdoba",
    logo: "img/logo.png",
  },

  contacto: {
    // Número en formato internacional, solo dígitos: 54 + 9 + característica + número
    // En el link de WhatsApp el 54 9 es obligatorio: sin el código de país, WhatsApp da "número inválido".
    whatsapp: "5493512152115",
    whatsappVisible: "351 215-2115",
    instagram: "https://www.instagram.com/180dalelavuelta/",
  },

  /* ---------------- PRODUCTOS ----------------
     id:            identificador interno, sin espacios (no cambiar una vez publicado)
     tipo:          "producto" o "combo" (los combos van en su propia sección)
     nombre:        nombre visible
     descripcion:   texto corto
     contenido:     peso o cantidad que se muestra junto al precio
     incluye:       (solo combos) lista de lo que trae
     precio:        número sin $ ni puntos. null = sin precio cargado (no se puede comprar)
     disponible:    true = se vende / false = muestra "Agotado" y no se puede agregar
     stock:         cantidad máxima que se puede pedir hoy. null = sin límite cargado
     esPromocion:   true si el producto ya tiene un precio promocional
                    (en ese caso no suma descuento por transferencia, salvo que
                    pagos.transferencia.descuento.combinableConPromociones sea true)
     imagen:        ruta de la foto. null = se muestra sin foto
     etiqueta:      (opcional) texto corto sobre la foto, ej. "Promo"
     comparaCon:    (opcional) muestra cuánto se ahorra frente a otro producto.
                    { id: "mila-1kg", cantidad: 2 } = "Ahorrás $X frente a 2 × Mila x kilo".
                    Se calcula solo con los precios cargados.
  */
  productos: [
    {
      id: "mila-1kg",
      tipo: "producto",
      nombre: "Mila x kilo",
      descripcion: "Milanesas de pollo.",
      contenido: "1 kg",
      precio: 14000,
      disponible: true,
      stock: null,
      esPromocion: false,
      imagen: "img/mila-1kg.jpg",
    },
    {
      id: "mila-2kg",
      tipo: "producto",
      nombre: "Promo 2 kilos",
      descripcion: "Milanesas de pollo.",
      contenido: "2 kg",
      precio: 25000,
      disponible: true,
      stock: null,
      esPromocion: true,
      etiqueta: "Promo",
      comparaCon: { id: "mila-1kg", cantidad: 2 },
      imagen: "img/mila-2kg.jpg",
    },

    /* Para volver a ofrecer el combo familiar, sacar las barras y asteriscos
       que lo encierran y cargar el precio:
    {
      id: "combo-familiar",
      tipo: "combo",
      nombre: "Combo familiar",
      descripcion: "Para resolver varias comidas de una vez.",
      contenido: "4 kg en total",
      incluye: ["2 kilos de milanesas", "1 kilo de pechuga", "1 kilo de bifes"],
      precio: null,
      disponible: true,
      stock: null,
      esPromocion: false,
      imagen: null,
    },
    */
  ],

  /* ---------------- ENVÍOS ---------------- */
  envio: {
    gratisEnZona: true,

    // Localidades con reparto (envío gratis). El cliente elige de esta lista;
    // si elige "Otra localidad", la web le avisa que queda fuera de zona.
    // Si la lista queda vacía, el cliente escribe su localidad a mano.
    // false = el cliente solo puede elegir una de las localidades de la lista.
    // true  = aparece "Otra localidad" con aviso de fuera de zona.
    permitirOtraLocalidad: false,
    zonas: [
      { localidad: "Río Ceballos" },
      { localidad: "Unquillo" },
      { localidad: "Villa Allende" },
      { localidad: "Salsipuedes" },
      { localidad: "Mendiolaza" },
    ],
  },

  entregas: {
    // Pedir fecha de entrega en el formulario.
    pedirFecha: true,

    // Fechas puntuales de entrega, formato "AAAA-MM-DD". Si hay fechas acá, se usan
    // SOLO estas (y no los días de reparto de abajo). Las fechas pasadas desaparecen solas.
    // Con una sola fecha, no hay que elegir: se muestra fija.
    // Para agregar otra: fechas: ["2026-10-17", "2026-10-24"],
    fechas: ["2026-10-17"],

    // Alternativa: días de reparto fijos cada semana (se usa si "fechas" está vacía).
    // 0=domingo 1=lunes 2=martes 3=miércoles 4=jueves 5=viernes 6=sábado
    diasReparto: [],
    // Horario de reparto: se le muestra al cliente y va en el mensaje de WhatsApp.
    // null = no se muestra horario.
    horario: { largo: "entre las 10 y las 14 h", corto: "de 10 a 14 h" },

    // Opcional: horarios para que el cliente marque cuándo puede recibir (varios a la vez).
    // Lista vacía [] = no se pregunta. Ej.: ["10 a 12 h", "12 a 14 h"]
    franjas: [],
    // Suma la opción "Cualquier horario"
    permitirCualquierHorario: true,
    diasAnticipacion: 1,       // primer día que se puede elegir (1 = mañana)
    cantidadFechas: 6,         // cuántas fechas ofrecer
    fechasBloqueadas: [],      // feriados o días sin reparto, formato "2026-12-25"
  },

  /* ---------------- PAGOS ---------------- */
  pagos: {
    transferencia: {
      habilitada: true,
      descuento: {
        habilitado: false,                  // true = vuelve el descuento por transferencia
        porcentaje: 5,
        minimoCompra: null,                 // ej. 20000. null = sin mínimo
        combinableConPromociones: false,
      },
      // Datos que ve el cliente al elegir transferencia.
      alias: "180dalelavuelta",
      aliasConfirmado: true,                // false = no se muestra el alias
      titular: "Franco Nicolas Gonzalez Acuna",
      cuit: "20-28430971-6",
      cbu: null,                            // opcional
      banco: null,                          // opcional
    },
    efectivo: {
      habilitado: true,
      nota: "Sujeto a confirmación del negocio.",
    },
  },

  pedidoMinimo: null,   // monto mínimo de compra. null = sin mínimo

  // Cantidad máxima de cada producto por pedido
  maximoPorProducto: 5,

  /* ---------------- REGISTRO EN GOOGLE SHEETS (opcional) ----------------
     Ver LEEME.md → "Registro de pedidos". Pegar acá la URL del Apps Script
     publicado como aplicación web. Sin URL, la tienda funciona igual.        */
  registroPedidos: {
    habilitado: false,
    url: "",
  },

  // Aviso de datos pendientes arriba de la página (solo mientras falten datos)
  mostrarAvisoConfiguracion: true,
};
