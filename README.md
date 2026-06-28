# GLIFO UXP Premiere + Backend local

MVP híbrido file-first:

- La UX principal vive dentro del panel UXP de Premiere.
- El usuario exporta manualmente un WAV/MP4 desde Premiere.
- El panel selecciona ese archivo con el file picker UXP y envía `mediaPath` al backend local.
- El backend valida el archivo y transcribe con un provider STT real.
- No hay transcript mock en el flujo principal.

## Estructura

- `plugin/src/panel`
- `plugin/src/premiere`
- `plugin/src/services`
- `plugin/src/types`
- `server/src/routes`
- `server/src/services`

## Variables de entorno

```bash
STT_PROVIDER=openai
OPENAI_API_KEY=tu_api_key
STT_MODEL=gpt-4o-transcribe
```

`STT_MODEL` es opcional. El default es `gpt-4o-transcribe`.

## Instalar

```bash
npm install
```

## Backend local

```bash
STT_PROVIDER=openai OPENAI_API_KEY=tu_api_key npm run dev:server
```

Backend en `http://localhost:3001`.

## Probar endpoint

```bash
curl -X POST http://localhost:3001/transcribe \
  -H "Content-Type: application/json" \
  -d '{"mediaPath":"/ruta/absoluta/export.wav","durationMs":null}'
```

Respuesta esperada:

```json
{
  "transcriptSource": "file",
  "provider": "openai",
  "model": "gpt-4o-transcribe",
  "fullText": "...",
  "segments": [],
  "metadata": {
    "mediaPath": "/ruta/absoluta/export.wav",
    "filename": "export.wav",
    "durationMs": null
  }
}
```

## Build y tests

```bash
npm run build
npm run test --workspace plugin
```

## Cargar plugin en Premiere

1. Abrir UXP Developer Tool.
2. `Add Plugin...` y seleccionar la carpeta `plugin`.
3. Cargar plugin en Premiere.
4. Abrir el panel **Transcribir mejor**.
5. Click en **Transcribir archivo**.
6. Elegir un WAV/MP4 exportado manualmente desde Premiere.

`Transcribir selección` queda reservado para Fase 2.

## MOGRT recomendado para controles de estilo

GLIFO puede crear MOGRTs editando texto y auditar parámetros expuestos por el template. Para controlar estilo desde el panel, el MOGRT exportado desde After Effects debe exponer estos controles en Essential Graphics:

- `Caption Text`
- `Font Size`
- `Fill Color`
- `Stroke Color`
- `Stroke Width`
- `Shadow Opacity` o `Shadow Enabled`
- `Position Y`
- `Scale`

Si el MOGRT no expone parámetros de estilo, GLIFO mantiene el flujo actual de texto/duración y muestra el diagnóstico: “Este MOGRT solo permite editar texto. Para controlar estilo, exponé parámetros en After Effects.”

Los presets de animación todavía no se aplican desde GLIFO; el bridge solo deja auditado si el template expone algún parámetro que parezca `Animation` o `Preset`.

## Errores normalizados

- `media_path_missing`
- `media_path_not_found`
- `unsupported_media_type`
- `stt_provider_unconfigured`
- `stt_provider_failed`
- `transcript_empty`
