# GLIFO CEP Bridge

Sidecar CEP minimo para que el panel UXP siga siendo la UI principal y CEP/ExtendScript haga solo la escritura host-side en la timeline.

## Que hace

- Hace polling a `http://localhost:3001/bridge/mogrt-jobs/next`.
- Ejecuta `$._GLIFO.importOneMogrt(...)` con `CSInterface.evalScript`.
- Usa `activeSequence.importMGT(...)` para insertar un MOGRT.
- Intenta setear `Source Text`, `Caption Text` o `Text`.
- Intenta ajustar `TrackItem.end`.
- Postea el resultado en `POST /bridge/mogrt-jobs/:id/result`.

## Instalacion local

1. Copiar o symlinkear esta carpeta en:
   - macOS: `/Library/Application Support/Adobe/CEP/extensions/GLIFO CEP Bridge`
   - Windows: `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\GLIFO CEP Bridge`
2. Habilitar unsigned panels para la version CSXS correspondiente si Premiere lo requiere.
3. Reiniciar Premiere.
4. Abrir `Window > Extensions > GLIFO CEP Bridge`.
5. Mantener abierto este panel mientras UXP crea jobs MOGRT.

## Prueba esperada

1. Correr el backend local en `localhost:3001`.
2. Abrir el panel CEP Bridge.
3. Desde UXP, usar `Probar MOGRT (1 segmento)`.
4. El panel CEP debe loguear `job:claimed`, `eval:start`, `eval:done` y `job:result-posted`.
