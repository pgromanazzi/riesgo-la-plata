import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, protocolUrl } from '../docs/assets/data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
try {
  const config = read('config.json');
  const index = buildIndex(read(config.delegaciones), read(config.barrios));
  const page = 'https://pgromanazzi.github.io/riesgo-la-plata/';
  let remote = 0, local = 0, missing = 0;
  const errors = [];
  for (const feature of index.bList) {
    const p = feature.properties;
    if (!p.protocolo) { missing++; continue; }
    const url = protocolUrl(p.protocolo, config.protocolos_base, page);
    if (!url) { errors.push(`${p.id}: ruta de protocolo inválida.`); continue; }
    if (new URL(url).origin !== new URL(page).origin) { remote++; continue; }
    const relative = decodeURIComponent(new URL(url).pathname.slice(new URL(page).pathname.length));
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(root + path.sep) || !fs.existsSync(absolute)) errors.push(`${p.id}: no existe ${relative} (revisar mayúsculas/minúsculas).`);
    else local++;
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`OK: ${index.dList.length} delegaciones, ${index.bList.length} barrios; relaciones, IDs y coordenadas válidos.`);
  console.log(`Protocolos: ${local} locales, ${remote} externos, ${missing} sin vincular.`);
  if (remote) console.log('Los enlaces externos se validaron sintácticamente; su disponibilidad requiere conexión y no se comprobó en lote.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
