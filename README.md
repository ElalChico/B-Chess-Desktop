# B-Chess Desktop

**B-Chess en el escritorio**: el mismo motor y las mismas piezas que el [B-Chess APK](https://github.com/ElalChico/B-Chess) (`app/`), en una aplicación de escritorio real para Windows.

> Este repositorio es SOLO la versión PC. El repositorio del APK es [ElalChico/B-Chess](https://github.com/ElalChico/B-Chess).

## Descarga

[![Descargar B-Chess Desktop](https://img.shields.io/badge/Descargar-B--Chess--Desktop--Setup.exe-2ea043?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/ElalChico/B-Chess-Desktop/releases/latest/download/B-Chess-Desktop-Setup.exe)

**Descarga directa →** [**B-Chess-Desktop-Setup.exe**](https://github.com/ElalChico/B-Chess-Desktop/releases/latest/download/B-Chess-Desktop-Setup.exe) (siempre apunta a la última versión)

[![Última versión](https://img.shields.io/github/v/release/ElalChico/B-Chess-Desktop?style=flat-square)](https://github.com/ElalChico/B-Chess-Desktop/releases/latest)
[![Descargas](https://img.shields.io/github/downloads/ElalChico/B-Chess-Desktop/total?style=flat-square)](https://github.com/ElalChico/B-Chess-Desktop/releases)
[![Licencia MIT](https://img.shields.io/badge/Licencia-MIT-blue.svg?style=flat-square)](LICENSE)

## Qué es

- **VS IA** — motor **Stockfish** adaptado con fuerza ajustable (~400–3190 Elo, 10 niveles).
- **En línea P2P** — salas de 6 caracteres, conexión directa dispositivo↔dispositivo vía WebRTC, compatible con el APK móvil (mismo protocolo `v:2`). **Funciona también en la versión web**.
- **LAN / Red local** — juega PC↔PC y PC↔APK por **TCP directo** (puerto 5891), sin Internet. El anfitrión ve su IP local con un toque; el invitado solo introduce `IP:puerto`. **Solo en la app de escritorio (.exe), no en la versión web.**
- **Torneos** — partidas individuales o por rondas con colores alternados y marcador.
- **Historial local** — PGN + miniaturas + estadísticas gráficas (resumen, flujo, aperturas, progreso, resultados por color) con gráficos grandes en tarjetas iguales.
- **Premove** — encadena jugadas por adelantado como en Lichess.
- **Relojes** con autoridad del anfitrión y sincronización por red.
- **Privacidad en línea** — eliges qué compartes con el rival: foto, identidad (@handle/nombre), estadísticas G/E/P e historial de partidas. Todo viene activado por defecto.
- **Actualizaciones automáticas** — como en el APK: la app comprueba cada release y se actualiza sola, **reemplazando la instalación anterior** (sin copias viejas ocupando espacio).
- **Icono Stockfish** propio como avatar del rival vs IA; fotos y usernames en tablero y fin de partida.
- **Historial** con vistas Tarjetas / Compacta / Lista.
- **Panel de movimientos colapsable** para dar todo el ancho al tablero.
- **Perfil HUD** — rediseño serio tipo juego: avatar octogonal, estadísticas estilo HUD.

## Instalación

### Opción A — Instalador nativo para Windows (recomendada)

1. Descarga el instalador con el botón de arriba o desde **[Releases · B-Chess Desktop](https://github.com/ElalChico/B-Chess-Desktop/releases/latest)**.
2. Ejecuta `B-Chess-Desktop-Setup.exe`. Se crea en el menú Inicio con su icono.
3. **Actualizaciones automáticas:** al instalarse, la app comprueba automáticamente los releases de este repo; cuando se publica una versión nueva, la app la descarga e instala **sin desinstalar** — tu historial, avatar y ajustes se conservan. Las actualizaciones usan un `blockmap` (descarga solo lo que cambia).

> **Nota:** para partidas por LAN / PC↔APK debes usar la Opción A (la PWA en el navegador no tiene acceso a sockets TCP). Bluetooth no está disponible en escritorio.

### Opción B — PWA en el navegador

1. Abre **https://elalchico.github.io/B-Chess-Desktop/** en Chrome o Edge.
2. Pulsa el icono **Instalar B-Chess Desktop** en la barra.
3. Se instala como una app propia y se actualiza sola al abrirla (service worker).

> **Qué funciona en la versión web (Opción B):** **solo P2P (Internet)**. Los navegadores no pueden abrir sockets TCP crudos, así que **LAN está deshabilitada** en la versión web (el botón aparece atenuado como «Solo en .exe»). Bluetooth no existe. **Si quieres jugar en red local, usa la [Opción A — instalador .exe](https://github.com/ElalChico/B-Chess-Desktop/releases/latest).**

## Desarrollo

```bash
python -m http.server 8090   # abre http://127.0.0.1:8090/
npm install
npm start                    # abre la app Electron de escritorio
npm run build                # genera dist/B-Chess-Desktop-Setup.exe
npm run release              # build + publica release en GitHub (requiere GH_TOKEN)
```

## Conexión: modos disponibles

| Modo | Web (GitHub Pages) | .exe (Electron) | Descripción |
|------|--------------------|-----------------|-------------|
| **P2P (Internet)** | ✅ Funciona | ✅ Funciona | Código de 6 caracteres, WebRTC + Firebase signaling. Compatible PC↔PC y PC↔APK. |
| **LAN (IP Local)** | ❌ Deshabilitada (no disponible) | ✅ Funciona | TCP directo puerto 5891. Compatible PC↔PC y PC↔APK. Requiere red local. |
| **Bluetooth** | ❌ No existe | ❌ No existe | Web Bluetooth API solo soporta BLE (no SPP clásico). |

> El .exe conserva LAN; la versión web (GitHub Pages/PWA) solo ofrece P2P. LAN en la web está **deshabilitada a propósito** (los navegadores no exponen sockets TCP).

## Motores IA disponibles

| Motor | Tipo | Rango Elo | Control | Comentario |
|-------|------|-----------|---------|------------|
| **Stockfish** (incluido) | AB + NNUE | ~400 – 3190 | `UCI_LimitStrength` + Skill 0–20 | Estándar, cubre todo el rango. |

## Licencia

MIT — Hecho por Elal Chico.
