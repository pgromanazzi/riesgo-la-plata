// Contrato común del visor y del validador: GeoJSON WGS84 + relaciones por ID.
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
export const compareNames = (a, b) => String(a.properties.nombre).localeCompare(String(b.properties.nombre), 'es', { sensitivity: 'base', numeric: true });
export const idOf = feature => String(feature.properties.id);

function polygonError(geometry) {
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return 'Se requiere Polygon o MultiPolygon.';
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || !polygons.length) return 'Geometría vacía.';
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) return 'Polígono sin anillos.';
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) return 'Anillo con menos de cuatro posiciones.';
      for (const c of ring) {
        if (!Array.isArray(c) || c.length < 2 || !c.every(Number.isFinite)) return 'Coordenadas no numéricas.';
        if (c[0] < -180 || c[0] > 180 || c[1] < -90 || c[1] > 90) return 'Coordenadas fuera de WGS84; exportar como EPSG:4326.';
      }
      const first = ring[0], last = ring.at(-1);
      if (first[0] !== last[0] || first[1] !== last[1]) return 'Anillo no cerrado.';
    }
  }
  return '';
}

export function validateData(delegations, neighborhoods) {
  const errors = [], dIds = new Set(), bIds = new Set();
  for (const [name, fc, ids] of [['delegaciones', delegations, dIds], ['barrios', neighborhoods, bIds]]) {
    if (fc?.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
      errors.push(`${name}: se requiere FeatureCollection.`);
      continue;
    }
    if (!fc.features.length) errors.push(`${name}: la capa está vacía.`);
    if (fc.crs && !/4326|CRS84/i.test(JSON.stringify(fc.crs))) errors.push(`${name}: exportar como WGS84 / EPSG:4326.`);
    fc.features.forEach((f, index) => {
      const p = f?.properties, label = `${name}[${index + 1}]`;
      if (f?.type !== 'Feature' || !p) { errors.push(`${label}: Feature inválida.`); return; }
      if (!['string', 'number'].includes(typeof p.id) || !String(p.id).trim()) errors.push(`${label}: falta id.`);
      else if (ids.has(String(p.id))) errors.push(`${label}: id duplicado ${p.id}.`);
      else ids.add(String(p.id));
      if (typeof p.nombre !== 'string' || !p.nombre.trim()) errors.push(`${label}: falta nombre.`);
      const e = polygonError(f.geometry);
      if (e) errors.push(`${label} (${p.id ?? ''}): ${e}`);
    });
  }
  if (Array.isArray(neighborhoods?.features)) {
    for (const f of neighborhoods.features) {
      const p = f?.properties;
      if (p && !dIds.has(String(p.delegacion_id))) errors.push(`Barrio ${p.id}: delegacion_id inexistente (${p.delegacion_id ?? 'vacío'}).`);
    }
  }
  return errors;
}

export function buildIndex(delegations, neighborhoods) {
  const errors = validateData(delegations, neighborhoods);
  if (errors.length) throw new Error(errors.slice(0, 8).join('\n') + (errors.length > 8 ? `\n… y ${errors.length - 8} errores más.` : ''));
  const dList = [...delegations.features].sort(compareNames), bList = [...neighborhoods.features].sort(compareNames);
  const byD = new Map(dList.map(f => [idOf(f), f]));
  const byB = new Map(bList.map(f => [idOf(f), f]));
  const groups = new Map(dList.map(f => [idOf(f), []]));
  bList.forEach(f => groups.get(String(f.properties.delegacion_id)).push(f));
  return { dList, bList, byD, byB, groups };
}

export function searchIndex(index, query, delegationId = '') {
  const terms = normalize(query).split(' ').filter(Boolean);
  const matches = text => terms.every(term => normalize(text).includes(term));
  const ds = delegationId ? [] : index.dList.filter(f => matches(`${f.properties.id} ${f.properties.nombre}`));
  const pool = delegationId ? (index.groups.get(String(delegationId)) || []) : index.bList;
  const bs = pool.filter(f => {
    const p = f.properties;
    return matches([p.id, p.nombre, p.cuenca, index.byD.get(String(p.delegacion_id))?.properties.nombre].join(' '));
  });
  return { delegations: ds, neighborhoods: bs };
}

export function protocolUrl(value, base, pageHref) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { return null; }
  if (/[\\\x00-\x1f]/.test(decoded) || decoded.split('/').includes('..') || raw.startsWith('/')) return null;
  try {
    const page = new URL(pageHref);
    const folder = new URL(base || 'protocolos/', page);
    const url = new URL(raw, folder);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.origin === page.origin)) return null;
    if (!/\.(pdf|jpe?g|png|webp)$/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function selectionHash(delegationId, neighborhoodId) {
  const params = new URLSearchParams();
  if (neighborhoodId) params.set('barrio', neighborhoodId);
  else if (delegationId) params.set('delegacion', delegationId);
  return params.size ? '#' + params.toString() : '';
}
