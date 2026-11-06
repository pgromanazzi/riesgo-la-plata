import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildIndex, searchIndex, validatePlaces, selectionHash } from '../docs/assets/data.mjs';

const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const d = read('../docs/data/delegaciones.geojson');
const b = read('../docs/data/barrios.geojson');
const p = read('../docs/data/lugares.geojson');
const idx = buildIndex(d, b, p);

test('la ampliación mantiene barrios y delegaciones y conserva los lugares únicos', () => {
  assert.equal(idx.dList.length, 23);
  assert.equal(idx.bList.length, 735);
  assert.equal(idx.pList.length, 850);
  for (const [kind, count] of [['educacion', 658], ['salud', 64], ['urbanizacion', 128]]) {
    assert.equal(idx.pList.filter(f => f.properties.tipo === kind).length, count);
  }
  assert.equal(searchIndex(idx, 'LP-B01').neighborhoods[0].properties.nombre, 'La Loma');
});

test('un mismo buscador resuelve nombres, acentos, siglas y números completos', () => {
  const ids = query => searchIndex(idx, query).places.map(f => f.properties.id);
  assert.deepEqual(ids('jardín 959'), ['EDU-1']);
  assert.deepEqual(ids('JI959'), ['EDU-1']);
  assert.deepEqual(ids('secundaria 123'), ['EDU-2']);
  assert.deepEqual(ids('EES123'), ['EDU-2']);
  assert.deepEqual(ids('CAPS N° 9'), ['CAPS-9']);
  assert.deepEqual(ids('caps1'), ['CAPS-1']);
  assert.ok(!ids('escuela 12').includes('EDU-2'));
  assert.ok(ids('ludovica').includes('SAL-343'));
  assert.deepEqual(ids('0550080'), ['UI-0550080']);
});

test('la delegación filtra lugares por geometría y nunca asigna pendientes por proximidad', () => {
  const school = idx.byP.get('EDU-1');
  const own = school.properties.delegacion_ids[0];
  assert.ok(own);
  assert.ok(searchIndex(idx, 'jardin 959', own).places.some(f => f.properties.id === 'EDU-1'));
  const other = idx.dList.find(f => f.properties.id !== own).properties.id;
  assert.equal(searchIndex(idx, 'jardin 959', other).places.length, 0);
  assert.equal(searchIndex(idx, 'caps 9', own).places.length, 0);
  const pending = idx.pList.filter(f => !f.geometry);
  assert.equal(pending.length, 13);
  for (const f of pending) {
    assert.equal(f.properties.ubicacion_estado, 'por_verificar');
    assert.deepEqual(f.properties.barrio_ids, []);
    assert.deepEqual(f.properties.delegacion_ids, []);
  }
});

test('las áreas con varios barrios mantienen todas las opciones de protocolo', () => {
  const areas = idx.pList.filter(f => f.properties.tipo === 'urbanizacion');
  assert.ok(areas.some(f => f.properties.barrio_ids.length > 1));
  assert.ok(areas.some(f => f.geometry.type === 'MultiPolygon'));
  for (const f of areas) {
    assert.ok(f.properties.codigo_origen.startsWith('055'));
    for (const id of f.properties.barrio_ids) assert.ok(idx.byB.has(id));
  }
});

test('las referencias inválidas y los puntos proyectados fallan antes de iniciar el mapa', () => {
  const check = x => validatePlaces(x, new Set(idx.byD.keys()), new Set(idx.byB.keys()));
  const duplicate = structuredClone(p); duplicate.features.push(structuredClone(p.features[0]));
  assert.ok(check(duplicate).some(e => e.includes('duplicado')));
  const wrong = structuredClone(p); wrong.features[0].properties.barrio_ids = ['NO-EXISTE'];
  assert.ok(check(wrong).some(e => e.includes('referencias inválidas')));
  const projected = structuredClone(p); projected.features[0].geometry.coordinates = [5600000, 6100000];
  assert.ok(check(projected).some(e => e.includes('WGS84')));
  const pending = structuredClone(p); pending.features.find(f => !f.geometry).properties.barrio_ids = ['LP-B01'];
  assert.ok(check(pending).some(e => e.includes('pendiente')));
});

test('los enlaces conservan el lugar y el barrio sin romper enlaces anteriores', () => {
  assert.equal(selectionHash('D-14', 'LP-B01'), '#barrio=LP-B01');
  const hash = new URLSearchParams(selectionHash('', 'LP-B01', 'EDU-1').slice(1));
  assert.equal(hash.get('lugar'), 'EDU-1');
  assert.equal(hash.get('barrio'), 'LP-B01');
  assert.equal(selectionHash('', '', 'CAPS-9'), '#lugar=CAPS-9');
});
