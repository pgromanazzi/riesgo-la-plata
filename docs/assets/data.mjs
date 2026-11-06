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

export const placeLabels = { educacion: 'Educación', salud: 'Salud', urbanizacion: 'Urbanización informal' };

export function validatePlaces(places, dIds, bIds) {
  const errors = [], ids = new Set();
  if (places?.type !== 'FeatureCollection' || !Array.isArray(places.features)) return ['lugares: se requiere FeatureCollection.'];
  for (const f of places.features) {
    const p = f?.properties;
    if (f?.type !== 'Feature' || !p || typeof p.id !== 'string' || !p.id || typeof p.nombre !== 'string' || !p.nombre.trim()) {
      errors.push('Lugar sin ID o nombre válido.'); continue;
    }
    if (ids.has(p.id)) errors.push(`Lugar duplicado: ${p.id}.`);
    ids.add(p.id);
    if (!Object.hasOwn(placeLabels, p.tipo)) errors.push(`${p.id}: tipo de lugar desconocido.`);
    for (const [key, known] of [['delegacion_ids', dIds], ['barrio_ids', bIds]]) {
      if (!Array.isArray(p[key]) || p[key].some(id => !known.has(String(id)))) errors.push(`${p.id}: ${key} contiene referencias inválidas.`);
    }
    if (!f.geometry) {
      if (p.ubicacion_estado !== 'por_verificar' || p.delegacion_ids?.length || p.barrio_ids?.length) errors.push(`${p.id}: una ubicación pendiente no puede tener asignación territorial.`);
    } else if (f.geometry.type === 'Point') {
      const c = f.geometry.coordinates;
      if (!Array.isArray(c) || c.length !== 2 || !c.every(Number.isFinite) || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) errors.push(`${p.id}: punto fuera de WGS84.`);
    } else {
      const e = polygonError(f.geometry);
      if (e) errors.push(`${p.id}: ${e}`);
    }
  }
  return errors;
}

function placeTerms(value) {
  return normalize(value).replace(/[.°º]/g, '').replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/\b(?:n|nro|numero)\s*(?=\d)/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter(Boolean).map(term => /^\d+$/.test(term) ? term.replace(/^0+(?=\d)/, '') : term);
}

export function buildIndex(delegations, neighborhoods, places = { type: 'FeatureCollection', features: [] }) {
  const errors = validateData(delegations, neighborhoods);
  if (errors.length) throw new Error(errors.slice(0, 8).join('\n') + (errors.length > 8 ? `\n… y ${errors.length - 8} errores más.` : ''));
  const dList = [...delegations.features].sort(compareNames), bList = [...neighborhoods.features].sort(compareNames);
  const byD = new Map(dList.map(f => [idOf(f), f]));
  const byB = new Map(bList.map(f => [idOf(f), f]));
  const groups = new Map(dList.map(f => [idOf(f), []]));
  bList.forEach(f => groups.get(String(f.properties.delegacion_id)).push(f));
  const placeErrors = validatePlaces(places, new Set(byD.keys()), new Set(byB.keys()));
  if (placeErrors.length) throw new Error(placeErrors.slice(0, 8).join('\n'));
  const pList = [...places.features].sort(compareNames), byP = new Map(pList.map(f => [idOf(f), f]));
  const placeSearch = new Map(pList.map(f => {
    const p = f.properties;
    const identityTerms = placeTerms([p.id, p.nombre, p.codigo_origen, ...(p.aliases || [])].join(' '));
    const terms = placeTerms([p.id, p.nombre, p.codigo_origen, placeLabels[p.tipo], p.direccion, ...(p.aliases || []),
      ...p.delegacion_ids.map(id => byD.get(String(id)).properties.nombre),
      ...p.barrio_ids.flatMap(id => [id, byB.get(String(id)).properties.nombre])].join(' '));
    return [p.id, { text: terms.join(' '), numbers: new Set(identityTerms.filter(t => /^\d+$/.test(t))), allNumbers: new Set(terms.filter(t => /^\d+$/.test(t))) }];
  }));
  return { dList, bList, byD, byB, groups, pList, byP, placeSearch };
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
  const pTerms = placeTerms(query);
  const numberedInstitution = pTerms.some(t => ['escuela', 'colegio', 'primaria', 'secundaria', 'jardin', 'caps', 'centro', 'sanitaria', 'ep', 'ees', 'eest', 'ji'].includes(t));
  const ps = index.pList.filter(f => {
    if (delegationId && !f.properties.delegacion_ids.includes(String(delegationId))) return false;
    const entry = index.placeSearch.get(idOf(f));
    return pTerms.every(t => /^\d+$/.test(t) ? (numberedInstitution ? entry.numbers : entry.allNumbers).has(t) : entry.text.includes(t));
  });
  return { delegations: ds, neighborhoods: bs, places: ps };
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

export function selectionHash(delegationId, neighborhoodId, placeId = '') {
  const params = new URLSearchParams();
  if (placeId) params.set('lugar', placeId);
  if (neighborhoodId) params.set('barrio', neighborhoodId);
  else if (delegationId) params.set('delegacion', delegationId);
  // Los códigos LO-B03 a LO-B28 existen en las dos numeraciones.
  // La edición en enlaces nuevos permite conservar los enlaces anteriores.
  if (/^LO-B\d{2}$/.test(neighborhoodId)) params.set('numeracion', '20261106');
  return params.size ? '#' + params.toString() : '';
}

export function resolveNeighborhoodId(params, index) {
  const id = params.get('barrio');
  if (!id) return null;
  if (!params.has('numeracion')) {
    const previous = index.bList.find(f => f.properties.codigo_anterior === id);
    if (previous) return idOf(previous);
  } else if (/^LO-B\d{2}$/.test(id) && params.get('numeracion') !== '20261106') {
    return null;
  }
  return id;
}
