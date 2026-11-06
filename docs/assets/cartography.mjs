export const basemapIds = Object.freeze(['osm', 'google', 'topo']);

// Split preferences saved by v3.11 into an independent background and overlay.
export function mapPreferences(savedBase, savedBasins) {
  const basemap = basemapIds.includes(savedBase) ? savedBase : ['satellite', 'google-cuencas'].includes(savedBase) ? 'google' : 'osm';
  const legacyBasins = ['osm-cuencas', 'google-cuencas'].includes(savedBase);
  const basins = savedBasins === 'true' ? true : savedBasins === 'false' ? false : legacyBasins;
  return { basemap, basins };
}

function inRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function insideBasin(point, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(p => inRing(point, p[0]) && !p.slice(1).some(ring => inRing(point, ring)));
}

export function validateBasins(fc) {
  if (fc?.type !== 'FeatureCollection' || !Array.isArray(fc.features) || !fc.features.length) return ['La capa de cuencas está vacía o no es GeoJSON.'];
  const errors = [], ids = new Set();
  for (const f of fc.features) {
    const p = f.properties;
    if (!p?.id || ids.has(p.id) || !p.nombre) { errors.push('Cuenca sin nombre o con identificador inválido.'); continue; }
    ids.add(p.id);
    if (!f.geometry || !['Polygon', 'MultiPolygon'].includes(f.geometry.type)) { errors.push(`${p.id}: geometría de cuenca inválida.`); continue; }
    if (!Array.isArray(p.etiquetas_alternativas) || !p.etiquetas_alternativas.length) { errors.push(`${p.id}: falta posición de la etiqueta.`); continue; }
    for (const point of [p.etiqueta, ...p.etiquetas_alternativas]) {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90 || !insideBasin(point, f.geometry)) {
        errors.push(`${p.id}: etiqueta fuera de la cuenca o coordenadas inválidas.`); break;
      }
    }
  }
  return errors;
}

const overlaps = (a, b, padding = 5) => a.left < b.right + padding && a.right > b.left - padding && a.top < b.bottom + padding && a.bottom > b.top - padding;

export function layoutBasinLabels(items, size, obstacles = []) {
  const occupied = [...obstacles], result = [];
  // Small basins have fewer viable positions, so give them priority.
  for (const item of [...items].sort((a, b) => a.area - b.area)) {
    let chosen = null;
    for (const candidate of item.candidates) {
      const [x, y] = candidate.screen;
      const box = { left: x - item.width / 2, right: x + item.width / 2, top: y - item.height / 2, bottom: y + item.height / 2 };
      if (box.left < 7 || box.top < 7 || box.right > size.x - 7 || box.bottom > size.y - 7 || occupied.some(other => overlaps(box, other))) continue;
      chosen = { id: item.id, candidate, box };
      occupied.push(box);
      break;
    }
    if (chosen) result.push(chosen);
  }
  return result;
}
