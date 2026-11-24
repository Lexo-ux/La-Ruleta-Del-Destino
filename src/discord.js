import { DiscordSDK } from '@discord/embedded-app-sdk';

export function getLocalRoomId() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('room');
  return raw && raw.trim() ? raw.trim() : 'local-test';
}

/**
 * Initializes Discord Embedded App SDK only when running inside a Discord Activity frame.
 * Falls back cleanly to local browser mode when `frame_id` is not present in the URL.
 */
export async function initDiscordEnvironment(onStatusChange) {
  const params = new URLSearchParams(window.location.search);
  const frameId = params.get('frame_id');
  const localRoomId = getLocalRoomId();

  if (!frameId) {
    onStatusChange({
      mode: 'local',
      label: 'Modo Local',
      detail: `Sala local: ${localRoomId}`,
    });
    return { isDiscord: false, sdk: null, roomId: localRoomId };
  }

  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  if (!clientId || clientId === 'tu_application_id_aqui') {
    onStatusChange({
      mode: 'warning',
      label: 'Falta Client ID',
      detail: 'Configura VITE_DISCORD_CLIENT_ID en .env',
    });
    return { isDiscord: false, sdk: null, roomId: localRoomId };
  }

  onStatusChange({
    mode: 'connecting',
    label: 'Conectando a Discord...',
    detail: 'Estableciendo handshake con el cliente',
  });

  try {
    const discordSdk = new DiscordSDK(clientId);
    await discordSdk.ready();

    const roomId = discordSdk.channelId || discordSdk.instanceId || 'default-room';

    onStatusChange({
      mode: 'discord',
      label: 'Conectado a Discord',
      detail: `Instancia activa (${discordSdk.platform}) · Sala ${roomId}`,
    });

    return { isDiscord: true, sdk: discordSdk, roomId };
  } catch (error) {
    console.warn('[Discord SDK] Fallback a modo local:', error?.message || error);
    onStatusChange({
      mode: 'local',
      label: 'Modo Local',
      detail: 'Sin conexión RPC con Discord',
    });
    return { isDiscord: false, sdk: null, roomId: localRoomId };
  }
}
