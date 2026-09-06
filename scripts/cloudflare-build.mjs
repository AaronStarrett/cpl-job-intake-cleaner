import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runProductionPolicy } from './builds-policy.mjs';

// Ubuntu 24.04 amd64 mappings reviewed against locked Playwright's nativeDeps table.
// Unknown libraries fail closed; never download arbitrary filenames or disable validation.
export const LIBRARY_PACKAGES = Object.freeze({
  'libasound.so.2': 'libasound2t64',
  'libatk-1.0.so.0': 'libatk1.0-0t64',
  'libatk-bridge-2.0.so.0': 'libatk-bridge2.0-0t64',
  'libatspi.so.0': 'libatspi2.0-0t64',
  'libcairo.so.2': 'libcairo2',
  'libcups.so.2': 'libcups2t64',
  'libdbus-1.so.3': 'libdbus-1-3',
  'libdrm.so.2': 'libdrm2',
  'libgbm.so.1': 'libgbm1',
  'libglib-2.0.so.0': 'libglib2.0-0t64',
  'libgobject-2.0.so.0': 'libglib2.0-0t64',
  'libgio-2.0.so.0': 'libglib2.0-0t64',
  'libgmodule-2.0.so.0': 'libglib2.0-0t64',
  'libnspr4.so': 'libnspr4',
  'libplc4.so': 'libnspr4',
  'libplds4.so': 'libnspr4',
  'libnss3.so': 'libnss3',
  'libnssutil3.so': 'libnss3',
  'libsmime3.so': 'libnss3',
  'libssl3.so': 'libnss3',
  'libpango-1.0.so.0': 'libpango-1.0-0',
  'libpangocairo-1.0.so.0': 'libpangocairo-1.0-0',
  'libpangoft2-1.0.so.0': 'libpangoft2-1.0-0',
  'libX11.so.6': 'libx11-6',
  'libX11-xcb.so.1': 'libx11-xcb1',
  'libxcb.so.1': 'libxcb1',
  'libxcb-render.so.0': 'libxcb-render0',
  'libxcb-shm.so.0': 'libxcb-shm0',
  'libXcomposite.so.1': 'libxcomposite1',
  'libXdamage.so.1': 'libxdamage1',
  'libXext.so.6': 'libxext6',
  'libXfixes.so.3': 'libxfixes3',
  'libxkbcommon.so.0': 'libxkbcommon0',
  'libXrandr.so.2': 'libxrandr2',
  'libXrender.so.1': 'libxrender1',
  'libXau.so.6': 'libxau6',
  'libXdmcp.so.6': 'libxdmcp6',
  'libfontconfig.so.1': 'libfontconfig1',
  'libfreetype.so.6': 'libfreetype6',
  'libharfbuzz.so.0': 'libharfbuzz0b',
  'libgraphite2.so.3': 'libgraphite2-3',
  'libthai.so.0': 'libthai0',
  'libdatrie.so.1': 'libdatrie1',
  'libpixman-1.so.0': 'libpixman-1-0',
  'libpng16.so.16': 'libpng16-16t64',
  'libexpat.so.1': 'libexpat1',
  'libffi.so.8': 'libffi8',
  'libpcre2-8.so.0': 'libpcre2-8-0',
  'libbrotlidec.so.1': 'libbrotli1',
  'libbrotlicommon.so.1': 'libbrotli1',
  'libuuid.so.1': 'libuuid1',
});

export function missingLibraries(output) {
  return [...new Set(output.split('\n').flatMap((line) => {
    const match = /^\s*([A-Za-z0-9_.+-]+)\s+=>\s+not found\s*$/.exec(line);
    if (match) return [match[1]];
    if (line.includes('not found')) throw new Error('Unrecognized ldd missing-library output.');
    return [];
  }))];
}

export function packagesForLibraries(libraries) {
  return [...new Set(libraries.map((library) => {
    if (!Object.hasOwn(LIBRARY_PACKAGES, library)) throw new Error(`Unreviewed browser dependency: ${library}`);
    return LIBRARY_PACKAGES[library];
  }))];
}

function localDirectory(root, relative) {
  let current = root;
  for (const component of relative.split('/')) {
    current = path.join(current, component);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('Browser build directories cannot be symbolic links.');
    mkdirSync(current, { recursive: true });
    const resolved = realpathSync(current);
    if (!resolved.startsWith(root + path.sep)) throw new Error('Browser build directory escaped the checkout.');
  }
  return current;
}

export function runCloudflareBuild() {
  // Refuse preview, local, missing context, changed source, or mismatched commits BEFORE setup.
  runProductionPolicy();
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('This browser setup supports only the verified Workers Builds Linux x64 image.');
  const osRelease = readFileSync('/etc/os-release', 'utf8');
  if (!/^ID="?ubuntu"?$/m.test(osRelease) || !/^VERSION_ID="?24\.04"?$/m.test(osRelease)) throw new Error('The Workers Builds image changed; review its browser dependencies before deploying.');

  const root = realpathSync(process.cwd());
  const debs = localDirectory(root, 'work/browser-debs');
  const libraries = localDirectory(root, 'work/browser-libs');
  const browsers = localDirectory(root, 'work/browser-binaries');
  const env = {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browsers,
    LD_LIBRARY_PATH: [path.join(libraries, 'usr/lib/x86_64-linux-gnu'), path.join(libraries, 'lib/x86_64-linux-gnu'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
  };
  if (env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS || env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD) throw new Error('Browser setup and host validation must not be skipped.');
  // A release gate must test this checkout, not a previously deployed app.
  if (env.E2E_BASE_URL) throw new Error('Native release tests must use the local Workers preview.');
  const run = (command, args, options = {}) => execFileSync(command, args, {
    cwd: root, env, encoding: 'utf8', stdio: 'inherit', timeout: 180_000, maxBuffer: 8 * 1024 * 1024, ...options,
  });
  run('npx', ['--no-install', 'playwright', 'install', 'chromium', '--only-shell']);
  const require = createRequire(import.meta.url);
  const playwrightRoot = path.dirname(require.resolve('playwright-core/package.json'));
  const descriptor = JSON.parse(readFileSync(path.join(playwrightRoot, 'browsers.json'), 'utf8')).browsers.find((browser) => browser.name === 'chromium-headless-shell');
  const revision = descriptor?.revisionOverrides?.['ubuntu24.04-x64'] ?? descriptor?.revision;
  if (!/^\d{1,8}$/.test(revision ?? '')) throw new Error('Cannot identify the locked Chromium headless-shell revision.');
  const executable = path.join(browsers, `chromium_headless_shell-${revision}`, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
  if (!existsSync(executable)) throw new Error('The locked Playwright browser layout changed; review the CI setup.');

  const downloaded = new Set();
  const extracted = new Set();
  const inspect = () => missingLibraries(run('ldd', [executable], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 }));
  for (let pass = 0; pass < 4; pass++) {
    const missing = inspect();
    if (missing.length === 0) break;
    const packages = packagesForLibraries(missing).filter((name) => !downloaded.has(name));
    if (!packages.length || downloaded.size + packages.length > 32) throw new Error('Browser library resolution made no progress or exceeded its package limit.');
    console.log(`Browser dependency pass ${pass + 1}: ${packages.join(', ')}`);
    // APT authenticates packages from the image's configured distro repositories.
    // download writes archives only; dpkg-deb extracts files without running install scripts.
    run('apt-get', ['-o', 'Acquire::Retries=0', '-o', 'Acquire::http::Timeout=30', '-o', 'Acquire::https::Timeout=30', 'download', ...packages.map((name) => `${name}:amd64`)], { cwd: debs, timeout: 90_000 });
    for (const name of packages) downloaded.add(name);
    const archives = readdirSync(debs).filter((name) => name.endsWith('.deb'));
    if (archives.length > 32 || archives.reduce((total, name) => total + statSync(path.join(debs, name)).size, 0) > 150 * 1024 * 1024) throw new Error('Browser dependency archives exceeded their bound.');
    for (const archive of archives) {
      if (extracted.has(archive)) continue;
      const filename = path.join(debs, archive);
      const packageName = run('dpkg-deb', ['--field', filename, 'Package'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 }).trim();
      const architecture = run('dpkg-deb', ['--field', filename, 'Architecture'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 }).trim();
      if (!downloaded.has(packageName) || architecture !== 'amd64') throw new Error('Unexpected browser package or architecture.');
      run('dpkg-deb', ['--extract', filename, libraries], { timeout: 30_000 });
      extracted.add(archive);
    }
  }
  if (inspect().length) throw new Error('Browser libraries remain unresolved after four passes.');
  console.log('Browser dependencies resolved without a privileged install. Running the complete release gate.');
  // The same env reaches browser validation, tests, policy check, and final Wrangler upload.
  run('npm', ['run', 'deploy:builds'], { timeout: 15 * 60_000 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCloudflareBuild();
