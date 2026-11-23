import { DiscordSDK } from '@discord/embedded-app-sdk';

/**
 * Initializes Discord Embedded App SDK only when running inside a Discord Activity frame.
 * Falls back cleanly to local browser mode when `frame_id` is not present in the URL.
 */
export async function initDiscordEnvironment(onStatusChange) {
  const params = new URLSearchParams(window.location.search);
  const frameId = params.get('frame_id');

  if (!frameId) {
    onStatusChange({
      mode: 'local',
      label: 'Modo Local',
      detail: 'Ejecutando fuera de Discord (sin frame_id)',
    });
    return { isDiscord: false, sdk: null };
  }

  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  if (!clientId || clientId === 'tu_application_id_aqui') {
    onStatusChange({
      mode: 'warning',
      label: 'Falta Client ID',
      detail: 'Configura VITE_DISCORD_CLIENT_ID en .env',
    });
    return { isDiscord: false, sdk: null };
  }

  onStatusChange({
    mode: 'connecting',
    label: 'Conectando a Discord...',
    detail: 'Estableciendo handshake con el cliente',
  });

  try {
    const discordSdk = new DiscordSDK(clientId);
    await discordSdk.ready();

    onStatusChange({
      mode: 'discord',
      label: 'Conectado a Discord',
      detail: `Instancia activa (${discordSdk.platform})`,
    });

    return { isDiscord: true, sdk: discordSdk };
  } catch (error) {
    console.warn('[Discord SDK] Fallback a modo local:', error?.message || error);
    onStatusChange({
      mode: 'local',
      label: 'Modo Local',
      detail: 'Sin conexión RPC con Discord',
    });
    return { isDiscord: false, sdk: null };
  }
}
