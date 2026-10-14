import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve('monaco-editor')), '../..', 'min', 'vs');
const destination = fileURLToPath(new URL('../public/monaco/vs/', import.meta.url));
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
console.log('Editor Monaco preparado para servir localmente.');
