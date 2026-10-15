/**
 * 180° Dale la vuelta — Registro de pedidos en Google Sheets (opcional)
 *
 * 1. Crear una hoja de cálculo nueva en Google Sheets.
 * 2. Menú Extensiones → Apps Script. Borrar lo que haya y pegar este archivo.
 * 3. Guardar. Botón "Implementar" → "Nueva implementación" → tipo "Aplicación web".
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquier usuario
 * 4. Copiar la URL que termina en /exec y pegarla en config.js:
 *      registroPedidos: { habilitado: true, url: "https://script.google.com/macros/s/.../exec" }
 *
 * No hay claves ni contraseñas en la web: el script corre con la cuenta de Google
 * del negocio y solo puede agregar filas a esta hoja.
 */

const COLUMNAS = [
  "id", "fecha", "nombre", "telefono", "direccion", "localidad", "ubicacion",
  "fechaEntrega", "franja", "productos", "subtotal", "descuento", "total",
  "pago", "envio", "observaciones",
];

function doPost(e) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (hoja.getLastRow() === 0) hoja.appendRow(COLUMNAS);
  let datos = {};
  try { datos = JSON.parse(e.postData.contents); } catch (err) { return salida("error"); }
  // Evita filas duplicadas si el cliente toca "Finalizar" dos veces
  const ids = hoja.getLastRow() > 1 ? hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues().flat() : [];
  if (ids.indexOf(datos.id) !== -1) return salida("duplicado");
  hoja.appendRow(COLUMNAS.map((c) => (datos[c] === undefined ? "" : String(datos[c]).slice(0, 1000))));
  return salida("ok");
}

function salida(estado) {
  return ContentService.createTextOutput(estado);
}
