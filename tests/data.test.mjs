import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildIndex, validateData, searchIndex, protocolUrl, selectionHash } from '../docs/assets/data.mjs';

const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const d = read('../docs/data/delegaciones.geojson');
const b = read('../docs/data/barrios.geojson');
const idx = buildIndex(d, b);

test('las capas completas tienen relaciones válidas y conservan todos los barrios', () => {
  assert.deepEqual(validateData(d, b), []);
  assert.equal([...idx.groups.values()].reduce((n, f) => n + f.length, 0), b.features.length);
});
test('nombres distintos de Gorina y casco no dejan barrios fuera de la selección', () => {
  assert.equal(idx.groups.get('D-10').length, 18);
  assert.equal(idx.groups.get('D-14').length, 35);
});
test('la búsqueda ignora tildes y mayúsculas y permite códigos', () => {
  assert.ok(searchIndex(idx, 'jose hernandez').delegations.some(f => f.properties.id === 'D-11'));
  assert.equal(searchIndex(idx, 'lp-b01').neighborhoods[0].properties.nombre, 'La Loma');
  assert.equal(searchIndex(idx, 'LP-B01', 'D-10').neighborhoods.length, 0);
  assert.equal(searchIndex(idx, 'caso inexistente 987654321').neighborhoods.length, 0);
});
test('se rechazan IDs repetidos, delegaciones ausentes y coordenadas proyectadas', () => {
  const dup = structuredClone(b); dup.features.push(structuredClone(dup.features[0]));
  assert.ok(validateData(d, dup).some(e => e.includes('duplicado')));
  const orphan = structuredClone(b); orphan.features[0].properties.delegacion_id = 'NO-EXISTE';
  assert.ok(validateData(d, orphan).some(e => e.includes('inexistente')));
  const projected = structuredClone(d); projected.features[0].geometry.coordinates[0][0][0][0] = 5500000;
  assert.ok(validateData(projected, b).some(e => e.includes('WGS84')));
});
test('se rechazan anillos abiertos y capas vacías', () => {
  const broken = structuredClone(d); broken.features[0].geometry.coordinates[0][0].pop();
  assert.ok(validateData(broken, b).some(e => e.includes('no cerrado')));
  assert.ok(validateData({ type: 'FeatureCollection', features: [] }, b).some(e => e.includes('vacía')));
});
test('los protocolos locales respetan el subdirectorio del repositorio en Pages', () => {
  const page = 'https://pgromanazzi.github.io/riesgo-la-plata/';
  assert.equal(protocolUrl('LP-B01.pdf', 'protocolos/', page), page + 'protocolos/LP-B01.pdf');
  assert.equal(protocolUrl('La Loma.jpg', 'protocolos/', page), page + 'protocolos/La%20Loma.jpg');
  assert.equal(protocolUrl('LP-B01.jpg', 'https://riesgolaplata.org/Protocolos/', page), 'https://riesgolaplata.org/Protocolos/LP-B01.jpg');
  assert.equal(protocolUrl('https://example.org/ficha.pdf', 'protocolos/', page), 'https://example.org/ficha.pdf');
});
test('no se admiten esquemas activos ni rutas de protocolo fuera de carpeta', () => {
  for (const value of ['javascript:alert(1)', '//evil.test/a.pdf', '../a.pdf', '%2e%2e/a.pdf', 'http://evil.test/a.jpg', '/a.pdf', 'a.html', 'data:image/png;base64,x', '..\\a.pdf']) {
    assert.equal(protocolUrl(value, 'protocolos/', 'https://pgromanazzi.github.io/riesgo-la-plata/'), null, value);
  }
  assert.equal(protocolUrl('', 'protocolos/', 'https://example.org/'), null);
});
test('los enlaces compartidos conservan códigos con espacios y caracteres especiales', () => {
  const h = selectionHash('', 'B-1 / prueba');
  assert.equal(new URLSearchParams(h.slice(1)).get('barrio'), 'B-1 / prueba');
  assert.equal(selectionHash('D-10', ''), '#delegacion=D-10');
  assert.equal(selectionHash('', ''), '');
});
