/*
 * B-Chess Desktop · construye el instalador con el logo incrustado en el .exe
 * Pasos:
 *   1. Limpia dist/ e INSTALADOR/ (sin versiones viejas acumuladas)
 *   2. electron-builder --dir        → genera dist/win-unpacked (sin firmar ni winCodeSign)
 *   3. rcedit sobre el .exe          → icono del logo + metadatos (producto, versión)
 *   4. electron-builder --prepackaged → empaqueta el instalador NSIS ya con el exe editado
 *   5. Copia el instalador a INSTALADOR/ (única versión, sin residuos)
 * El paso 3 es necesario porque signAndEditExecutable:false evita el winCodeSign
 * (falla en PCs sin privilegios de symlink) pero además congela el icono de Electron.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { rcedit } = require('rcedit');

const pkg = require(path.join('..', 'package.json'));
const version = pkg.version;
const vParts = version.split('.');
while (vParts.length < 4) vParts.push('0');
const fileVersion = vParts.slice(0, 4).join('.');

function run(cmd) {
  console.log('> ' + cmd);
  execSync(cmd, { stdio: 'inherit' });
}

(async function main() {
  console.log('> limpiando dist/ e INSTALADOR/ (sin acumulación)');
  if (fs.existsSync('dist')) fs.rmSync('dist', { recursive: true, force: true });
  if (fs.existsSync('INSTALADOR')) fs.rmSync('INSTALADOR', { recursive: true, force: true });
  fs.mkdirSync('INSTALADOR', { recursive: true });

  run('npx electron-builder --win --x64 --dir --publish never');

  const exe = path.join('dist', 'win-unpacked', 'B-Chess Desktop.exe');
  await rcedit(exe, {
    icon: path.join('icono.ico'),
    'file-version': fileVersion,
    'product-version': version,
    'version-string': {
      ProductName: 'B-Chess Desktop',
      FileDescription: 'B-Chess Desktop',
      CompanyName: 'Elal Chico',
      LegalCopyright: 'MIT',
      InternalName: 'b-chess-desktop',
      OriginalFilename: 'B-Chess Desktop.exe',
      ProductVersion: version
    }
  });
  console.log('> icono y metadatos incrustados en', exe);

  run('npx electron-builder --prepackaged "' + path.join('dist', 'win-unpacked') + '" --win nsis --x64 --publish never');

  // Copiar el instalador a INSTALADOR/ (única versión, sin residuos)
  const artifacts = ['B-Chess-Desktop-Setup.exe', 'B-Chess-Desktop-Setup.exe.blockmap', 'latest.yml'];
  for (var i = 0; i < artifacts.length; i++) {
    var src = path.join('dist', artifacts[i]);
    var dst = path.join('INSTALADOR', artifacts[i]);
    if (fs.existsSync(src)) fs.copyFileSync(src, dst);
  }
  console.log('> instalador copiado a INSTALADOR/ (limpio y único)');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});