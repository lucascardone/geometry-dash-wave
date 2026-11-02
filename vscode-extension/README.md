# Wave GD

Un wave estilo Geometry Dash que vive en la barra lateral de VS Code y se mueve al ritmo de la música que suena en tu compu (Spotify o cualquier otra fuente).

- El laberinto se arma solo siguiendo el tempo: las vueltas caen en el beat y, cuando la canción se pone intensa, se vuelve más cerrado y pasa a **mini wave**.
- Las paredes y los rombos se iluminan en capas al ritmo de la música.
- Si no tocás nada, el wave se maneja solo. Si lo agarrás, jugás vos y se guarda tu **récord**.

## Requisitos

- **VS Code 1.80** o más nuevo.
- **Linux** con PipeWire (`pw-record`) o PulseAudio (`parec`) para capturar el audio del sistema. La mayoría de las distros modernas ya traen alguno de los dos.
- Opcional: `gdbus` (viene con GLib) para mostrar la canción que suena en Spotify.

En Windows y macOS no está probada: la captura automática de audio es solo para Linux.

## Instalación

### Opción 1: desde el `.vsix` (la más fácil)

1. Descargá el archivo `wave-gd-X.Y.Z.vsix` de la sección [**Releases**](https://github.com/lucascardone/geometry-dash-wave/releases) del repo.
2. Instalalo de una de estas dos formas:
   - **Desde VS Code:** abrí la vista de Extensiones (`Ctrl+Shift+X`), tocá el menú `···` de arriba → **Install from VSIX...** y elegí el archivo.
   - **Desde la terminal:**
     ```bash
     code --install-extension wave-gd-X.Y.Z.vsix
     ```
3. Recargá la ventana: `Ctrl+Shift+P` → **Developer: Reload Window**.

### Opción 2: compilarla desde el código

Necesitás [Node.js](https://nodejs.org) 18 o más nuevo y `git`.

```bash
git clone https://github.com/lucascardone/geometry-dash-wave.git
cd geometry-dash-wave/vscode-extension
npx --yes @vscode/vsce package --allow-missing-repository
code --install-extension wave-gd-0.1.0.vsix --force
```

Después recargá la ventana (`Ctrl+Shift+P` → **Developer: Reload Window**).

> `--force` hace falta si ya tenías instalada la misma versión; sin eso VS Code no la reemplaza.

### Opción 3: probarla sin instalar (para desarrollo)

Abrí la carpeta `vscode-extension` en VS Code y apretá `F5`. Se abre una ventana nueva de VS Code con la extensión cargada.

## Cómo se usa

1. Abrí el Explorador (`Ctrl+Shift+E`): abajo aparece el panel **Wave**. También podés usar `Ctrl+Shift+P` → **Wave GD: Mostrar**.
2. Poné música. El wave empieza a seguir el ritmo solo.
3. Para jugar vos, mantené apretado:

| Acción | Control |
| --- | --- |
| Subir (soltar = bajar) | Click / `Espacio` / `↑` / `W` / tocar la pantalla |
| Prender/apagar pirámides | Botón **▲ PIRÁMIDES** o tecla `P` |

Para que el teclado funcione, primero hacé click en el panel.

Si dejás de tocar unos segundos (5 por defecto), vuelve al modo automático.

### Récord

El puntaje solo cuenta cuando jugás vos con las pirámides prendidas. En mini wave cada bloque vale el doble. El récord se guarda en VS Code y se sincroniza con Settings Sync. Para borrarlo: `Ctrl+Shift+P` → **Wave GD: Borrar récord**.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `Wave GD: Mostrar` | Abre el panel del wave. |
| `Wave GD: Reiniciar captura de audio` | Vuelve a arrancar la captura si dejó de detectar la música. |
| `Wave GD: Borrar récord` | Pone el récord en cero. |

## Configuración

En `Ctrl+,` buscá **Wave GD**:

| Opción | Por defecto | Descripción |
| --- | --- | --- |
| `waveGd.idleTimeout` | `5` | Segundos sin tocar el wave antes de pasar a modo automático. |
| `waveGd.sensitivity` | `1.5` | Umbral para detectar beats (más bajo = detecta más beats). Entre `0.5` y `4`. |
| `waveGd.speed` | `1` | Multiplicador de velocidad. Entre `0.25` y `3`. |
| `waveGd.color` | `#00e6ff` | Color del wave y de la estela. |
| `waveGd.audioCommand` | vacío | Comando propio para capturar audio. Tiene que sacar PCM `s16le`, mono, 22050 Hz por stdout. Vacío = usa `pw-record` o `parec`. |

## Problemas comunes

**El wave no sigue la música.**
Fijate si tenés `pw-record` o `parec`:
```bash
command -v pw-record parec
```
Si no aparece ninguno, instalá `pipewire-bin` (PipeWire) o `pulseaudio-utils` (PulseAudio), según tu distro. Después corré **Wave GD: Reiniciar captura de audio**.

**Tengo VS Code instalado por Snap o Flatpak.**
La extensión funciona igual, pero la música depende de poder correr programas del sistema (`pw-record`, `parec`, `gdbus`):
- **Snap:** VS Code mete variables de entorno propias que rompen esos programas. La extensión las limpia antes de lanzarlos, así que no hace falta hacer nada.
- **Flatpak:** VS Code corre en un sandbox que no ve los programas del sistema, así que la extensión los lanza afuera con `flatpak-spawn --host`. Si igual no anda, dale permiso y reiniciá VS Code:
  ```bash
  flatpak override --user --talk-name=org.freedesktop.Flatpak com.visualstudio.code
  ```
- Si querés evitar estos problemas, usá el `.deb` / `.rpm` oficial de [code.visualstudio.com](https://code.visualstudio.com).

Si algo falla, el panel muestra el error abajo con un ⚠, y entre paréntesis te dice si VS Code está corriendo en Snap o Flatpak.

**Detecta pocos o demasiados beats.**
Bajá o subí `waveGd.sensitivity`.

**Instalé una versión nueva pero sigo viendo la vieja.**
Instalala con `--force` y recargá la ventana.

## Licencia

[MIT](LICENSE)
