import { cp, rm, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve('monaco-editor')), '../..', 'min', 'vs');
const destination = fileURLToPath(new URL('../public/monaco/vs/', import.meta.url));

// The site only edits C++, so the TypeScript/CSS/HTML/JSON language services
// (≈19 MB, mostly ts.worker) and the UI translations are never requested. The
// small AMD stubs that point to them stay, so Monaco still boots normally.
const unusedWorker = /^(ts|css|html|json)\.worker-.*\.js$/;
const skip = (path) => {
  const parts = relative(source, path).split(sep);
  const name = basename(path);
  return parts[0] === 'language'
    || (parts[0] === 'nls' && parts[1] === 'lang')
    || (parts[0] === 'assets' && unusedWorker.test(name))
    || name.endsWith('.d.ts')
    || name.endsWith('.map');
};

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, filter: (path) => !skip(path) });
console.log('Editor Monaco preparado para servir localmente.');
