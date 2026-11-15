# B-Chess Desktop

**B-Chess en el escritorio**: el mismo motor y las mismas piezas que el [B-Chess APK](https://github.com/ElalChico/B-Chess) (`app/`), en una aplicación de escritorio real.

> Este repositorio es SOLO la versión PC. El repositorio del APK es otro repositorio: [ElalChico/B-Chess](https://github.com/ElalChico/B-Chess).

## Qué es

- **VS IA** — motor **Stockfish** adaptado con fuerza ajustable (~400–3190 Elo, 10 niveles).
- **En línea P2P** — sala de 6 caracteres propia o del sistema vs rival humano, conexión directa dispositivo↔dispositivo, compatible con el APK móvil.
- **Torneos** — partidas individuales o por rondas con colores alternados y marcador.
- **Historial local** — PGN + miniaturas + estadísticas gráficas (resumen, flujo, aperturas, progreso y resultados por color).
- **Premove** — encadena jugadas por adelantado como en Lichess.
- **Relojes** con autoridad del anfitrión (sincronizados por red).

## Instalación

### Opción A — Instalador nativo para Windows (recomendada)

1. Descarga `B-Chess-Desktop-Setup-x64.exe` desde **[Releases · B-Chess Desktop](https://github.com/ElalChico/B-Chess-Desktop/releases/latest)**.
2. Ejecuta el instalador. Se crea en el menú Inicio con su icono.
3. **Actualizaciones automáticas estilo APK**: al instalarse, la app comprueba automáticamente los releases de este repo; cuando se publique una versión nueva, la app descargará e instalará **sin desinstalar** — tu historial y ajustes se conservan.

### Opción B — PWA en el navegador

1. Abre **https://elalchico.github.io/B-Chess-Desktop/** en Chrome o Edge.
2. Pulsa el icono **Instalar B-Chess Desktop** en la barra.
3. Se instala como una app propia y se actualiza sola al abrirla en cada release (service worker).

## Desarrollo

```bash
python -m http.server 8090   # abre http://127.0.0.1:8090/
npm install
npm start                    # abre la app Electron de escritorio
npm run build                # genera dist/B-Chess-Desktop-Setup-x64.exe
npm run release              # build + publica release en GitHub (requiere GH_TOKEN)
```

## Qué comparte con el APK

Los mismos assets (piezas, sonidos, temas), el motor, y el protocolo P2P (`v:2`), para partidas entre PC y móvil sin diferencias.

## Conexión: modos disponibles

| Modo | Estado | Descripción |
|------|--------|-------------|
| **P2P (Internet)** | ✅ Funciona | Código de 6 caracteres, WebRTC + Firebase signaling. Compatible PC↔PC y PC↔APK. |
| **Bluetooth** | 🚧 Planeado | Requiere app nativa (Tauri/Electron) con Bluetooth Classic/SPP. Web Bluetooth API solo soporta BLE, no SPP clásico. |
| **LAN (IP Local)** | 🚧 Planeado | WebSocket servidor en Node/Electron (`ws://IP:5891`). Sin Internet, solo LAN. |

> **Nota**: Hoy solo **P2P (Internet)** está implementado y funcional. Bluetooth (SPP clásico) y LAN (WebSocket local) requieren app nativa (Tauri/Electron) y están planificados.

## Motores IA disponibles

| Motor | Tipo | Rango Elo | Control | Comentario |
|-------|------|-----------|---------|------------|
| **Stockfish** (incluido) | AB + NNUE | ~400 – 3190 | `UCI_LimitStrength` + Skill 0–20 | Estándar, cubre todo el rango. |
| **Maia Chess** | Red neuronal (human-like) | 1100–1900 (brackets) | Modelo fijo por Elo | Juega "como humano" en brackets 1100–1900. |
| **Ethereal / Koivisto / Seer** | Híbrido AB+NNUE | Configurable | `UCI_LimitStrength` | Open source, fuerte, ligero. |
| **LCZero (Leela)** | MCTS + NNUE | Muy alto | GPU/WASM SIMD | Muy fuerte, requiere GPU/WASM SIMD. |

> **Recomendación**: **Stockfish solo ya cubre todo el rango 400–3190 Elo** con `UCI_LimitStrength + Skill Level 0–20`. Maia es opcional si buscas "juego humano" en rangos 1100–1900.

## Licencia

MIT — Hecho por Elal Chico.
