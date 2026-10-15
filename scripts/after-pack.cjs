// electron-builder afterPack hook: make the packaged Linux app world-readable.
//
// Files installed or generated under a restrictive umask keep modes without
// world-read: node_modules as npm installed them (the asar-unpacked native
// modules), build output, and the directories electron-builder creates. dpkg
// installs those modes verbatim, which leaves a `/opt/Parallel Code` the desktop
// user cannot enter.
//
// Runs after the app is packed and before the deb and AppImage targets read it.
// Files the targets generate themselves (the desktop entry, changelog) come
// later and are covered by the `umask 022` in the `build` script instead.

const fs = require('fs');
const path = require('path');

// Directories 755; files 644, or 755 where the owner could already execute them,
// so no file becomes executable that its owner could not already execute. This
// clears setuid, setgid and sticky bits; the packed tree has none (chrome-sandbox
// is packed 0755, and the deb's postinst sets 4755 only on systems without user
// namespaces). Symlinks carry no mode of their own and lchmod is not portable, so
// they are left alone. A mode that is already right is not rewritten.
function normalizePermissions(target) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) return;

  const wanted = stat.isDirectory() || stat.mode & 0o100 ? 0o755 : 0o644;
  if ((stat.mode & 0o7777) !== wanted) fs.chmodSync(target, wanted);

  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      normalizePermissions(path.join(target, entry));
    }
  }
}

// node-pty's conpty.node looks for conpty/conpty.dll next to itself. When
// electron-builder rebuilds node-pty from source, the .node files land in
// build/Release but the conpty/ folder (dll + OpenConsole.exe) only ships in
// prebuilds/, so spawning fails with "Cannot find conpty.dll". Copy it across.
function fixWindowsConpty(context) {
  const ptyDir = path.join(
    context.appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'node-pty',
  );
  const arch = context.arch === 3 ? 'arm64' : 'x64'; // electron-builder Arch: 1=x64, 3=arm64
  const source = path.join(ptyDir, 'prebuilds', `win32-${arch}`, 'conpty');
  const releaseDir = path.join(ptyDir, 'build', 'Release');
  if (!fs.existsSync(source) || !fs.existsSync(releaseDir)) return;
  fs.cpSync(source, path.join(releaseDir, 'conpty'), { recursive: true });
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName === 'win32') fixWindowsConpty(context);
  if (context.electronPlatformName !== 'linux') return;

  normalizePermissions(context.appOutDir);

  // fpm reads the menu icon from the build resources directory directly, so its
  // modes reach the package too. This changes modes in the checkout's build/;
  // git records only the executable bit, which is kept, so no diff results.
  const buildResources = context.packager.buildResourcesDir;
  if (buildResources && fs.existsSync(buildResources)) normalizePermissions(buildResources);
};
