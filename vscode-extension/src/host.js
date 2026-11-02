const fs = require("fs");

// VS Code por Snap inyecta variables (GTK_PATH, GIO_MODULE_DIR, LOCPATH…) que
// apuntan a librerías del snap y rompen programas del sistema como pw-record o
// gdbus. El lanzador guarda el valor original en <VAR>_VSCODE_SNAP_ORIG.
function hostEnv() {
  const env = { ...process.env };
  if (!env.SNAP) return env;
  for (const key of Object.keys(env)) {
    const m = key.match(/^(.+)_VSCODE_SNAP_ORIG$/);
    if (!m) continue;
    if (env[key]) env[m[1]] = env[key];
    else delete env[m[1]];
    delete env[key];
  }
  for (const key of ["GTK_PATH", "GTK_EXE_PREFIX", "GTK_IM_MODULE_FILE", "GIO_MODULE_DIR",
    "GSETTINGS_SCHEMA_DIR", "GDK_PIXBUF_MODULEDIR", "GDK_PIXBUF_MODULE_FILE", "LOCPATH"]) {
    if (env[key] && env[key].includes("/snap/")) delete env[key];
  }
  return env;
}

// En Flatpak los programas del sistema no están adentro del sandbox:
// hay que lanzarlos en el host con flatpak-spawn.
const inFlatpak = fs.existsSync("/.flatpak-info");

function hostCommand(cmd, args) {
  return inFlatpak ? ["flatpak-spawn", ["--host", cmd, ...args]] : [cmd, args];
}

function sandboxName() {
  if (inFlatpak) return "flatpak";
  if (process.env.SNAP) return "snap";
  return null;
}

module.exports = { hostEnv, hostCommand, sandboxName };
