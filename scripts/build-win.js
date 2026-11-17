/*
 * B-Chess Desktop · construye el instalador con el logo incrustado en el .exe
 * Pasos:
 *   1. electron-builder --dir        → genera dist/win-unpacked (sin firmar ni winCodeSign)
 *   2. rcedit sobre el .exe          → icono del logo + metadatos (producto, versión)
 *   3. electron-builder --prepackaged → empaqueta el instalador NSIS ya con el exe editado
 * El paso 2 es necesario porque signAndEditExecutable:false evita el winCodeSign
 * (falla en PCs sin privilegios de symlink) pero además congela el icono de Electron.
 */
const { execSync } = require('child_process');
const path = require('path');
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
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
