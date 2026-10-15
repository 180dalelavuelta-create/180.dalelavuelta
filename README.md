# Tienda online · 180° Dale la vuelta

Web de pedidos: el cliente elige productos, completa la entrega y el pago, y la web abre WhatsApp con el pedido escrito para enviarlo al +54 9 351 215-2115.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página. No hace falta tocarla. |
| `config.js` | **Productos, precios, stock, zonas, días de reparto, pagos, Instagram.** Es lo único que se edita. |
| `app.js` | Lógica del carrito y del mensaje de WhatsApp. No hace falta tocarlo. |
| `img/` | Logo y fotos. Para cambiar una foto, reemplazar el archivo con el mismo nombre o cambiar la ruta en `config.js`. |
| `registro-pedidos.gs` | Opcional: guarda cada pedido en una hoja de Google Sheets. Instrucciones dentro del archivo. |

## Cambios frecuentes (todo en `config.js`)

- **Precios**: `precio: 14000` (sin $ ni puntos).
- **Agotar un producto**: `disponible: false`.
- **Fecha de entrega**: `entregas.fechas` (ver abajo).
- **Descuento por transferencia**: `pagos.transferencia.descuento.habilitado: true` y el `porcentaje`. Hoy está apagado. No se aplica a productos con `esPromocion: true`.
- **Localidades con reparto**: `envio.zonas`.
- **Volver a ofrecer el combo familiar**: está guardado y desactivado dentro de `productos`.

Si falta algún dato (por ejemplo, un precio), la web muestra un aviso arriba con la lista de pendientes.

## Fechas de entrega

En `config.js` → `entregas.fechas`, una lista de fechas en formato "AAAA-MM-DD":
- Una sola fecha (`["2026-10-17"]`): se muestra fija, el cliente no elige.
- Varias (`["2026-10-17", "2026-10-24"]`): el cliente elige una de la lista.
- Se puede pedir hasta el día anterior (`diasAnticipacion: 1`). Las fechas pasadas desaparecen solas; si no queda ninguna, el pedido sale con "Fecha de entrega: A coordinar".

## Horario de reparto

En `config.js` → `entregas.horario` (hoy: entre las 10 y las 14 h). Se muestra arriba, en el formulario y en el mensaje de WhatsApp.
Opcional: `entregas.franjas` (ej. `["10 a 12 h", "12 a 14 h"]`) para que el cliente marque en qué horarios puede recibir.

## Ubicación del cliente

"Usar mi ubicación actual" toma el GPS del celular (funciona en la web publicada con https; el navegador pide permiso). Si el cliente no da permiso, puede pegar el link de Google Maps. En los dos casos el link sale en el mensaje de WhatsApp.

## Stock

`disponible: false` muestra "Agotado". Para limitar cuántos se pueden pedir: `stock: 10`. No hay stock automático: se actualiza a mano.

## Publicar

Es una web estática (no necesita servidor ni base de datos). Opciones gratis:
- **Netlify**: "Import from Git" con este repositorio (se actualiza solo con cada push), o Netlify Drop arrastrando la carpeta.
- **GitHub Pages**: Settings → Pages → Branch `main`, carpeta `/ (root)`.
- **Cloudflare Pages**: también se conecta al repositorio.

Después, poner el link en la bio de Instagram y en el perfil de WhatsApp Business.
