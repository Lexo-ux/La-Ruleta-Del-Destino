# La Ruleta Del Destino

Discord Activity interactiva para hacer sorteos, dinámicas y ruletas de decisiones dentro de tu servidor de Discord, construida con **Vite**, **Vanilla JS**, **HTML5 Canvas**, **CSS3**, **Web Audio API** y **`@discord/embedded-app-sdk`**.

## Características

- **100% compatible con la CSP de Discord:** sin CDNs externos, sin Google Fonts y sin imágenes ni audios remotos. Todo se renderiza localmente con CSS/SVG/Canvas y efectos de sonido sintetizados mediante Web Audio API.
- **Ruleta HiDPI en `<canvas>`:** renderizado nítido (`devicePixelRatio`), ajuste automático de texto para 2 hasta 30+ opciones, física de rebote en el puntero superior y cálculo exacto del ganador.
- **Gestión práctica de opciones:** agregar rápido con `Enter`, **edición en bloque** (`textarea` línea por línea), mezclar, eliminar individualmente, limpiar lista, modo eliminación automática y persistencia en `localStorage`.
- **Feedback visual y sonoro:** sonido tipo *tic* al cruzar divisores, fanfarria de victoria, botón de silenciar, confeti en `<canvas>`, modal de ganador e historial de los últimos 5 resultados.
- **Detección automática de entorno:** funciona conectado a Discord (`frame_id` presente) o en **Modo Local** directamente desde cualquier navegador.

---

## 1. Instalación y configuración de `.env`

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Crea tu archivo `.env` a partir de `.env.example`:

   ```bash
   cp .env.example .env
   ```

3. Edita `.env` y coloca el **Application ID (Client ID)** de tu aplicación en el [Discord Developer Portal](https://discord.com/developers/applications):

   ```env
   VITE_DISCORD_CLIENT_ID=123456789012345678
   ```

4. Inicia el servidor de desarrollo local:

   ```bash
   npm run dev
   ```

   > Si abres la URL directamente en el navegador sin parámetros de Discord, la aplicación se iniciará automáticamente en **Modo Local**.

---

## 2. Probar dentro de Discord con `cloudflared`

Discord requiere una URL HTTPS pública para cargar Activities mediante su proxy. `vite.config.js` ya incluye `server: { allowedHosts: true }` para permitir túneles HTTPS sin errores de host.

1. Con `npm run dev` corriendo (por defecto en el puerto `5173`), abre otra terminal y ejecuta un túnel temporal de Cloudflare:

   ```bash
   cloudflared tunnel --url http://localhost:5173
   ```

2. Copia la URL `https://*.trycloudflare.com` que genera `cloudflared`.
3. En el **Discord Developer Portal** → tu aplicación → **Activities** → **URL Mappings**:
   - Mapea la ruta raíz `/` hacia tu URL de `trycloudflare.com` (sin barra final).
   - Asegúrate de activar **Activities** en la configuración de la app.
4. Abre un canal de voz o chat en un servidor de pruebas donde tengas habilitada la app y lanza **La Ruleta Del Destino**.

---

## 3. Despliegue en Vercel o Cloudflare Pages

### Opción A: Vercel

1. Sube el repositorio a GitHub e impórtalo en [Vercel](https://vercel.com/).
2. Configuración del proyecto:
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. En **Environment Variables**, añade `VITE_DISCORD_CLIENT_ID` con tu Application ID de Discord.
4. Despliega y apunta el **URL Mapping** `/` de tu Discord Activity al dominio generado por Vercel (`tu-proyecto.vercel.app`).

### Opción B: Cloudflare Pages

1. Conecta tu repositorio en **Cloudflare Dashboard → Workers & Pages → Create → Pages**.
2. Configuración de compilación:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. En **Settings → Environment variables**, agrega `VITE_DISCORD_CLIENT_ID` con tu Application ID de Discord.
4. Despliega y actualiza el **URL Mapping** `/` en el Discord Developer Portal con la URL `*.pages.dev` resultante.
