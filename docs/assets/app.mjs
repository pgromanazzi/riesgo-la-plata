import { buildIndex, searchIndex, idOf, protocolUrl, selectionHash, resolveNeighborhoodId, placeLabels } from './data.mjs?v=20261106.309';

const $ = id => document.getElementById(id);
const state = { delegation: '', neighborhood: '', place: '', query: '', basemap: '', config: null, index: null };
let map, partidoLayer, delegationLayer, neighborhoodLayer, placeLayer, allBounds, baseLayer, scaleControl, toastTimer;
const delegationLayers = new Map(), neighborhoodLayers = new Map();
const baseLayers = new Map();
const basemapPreferenceKey = 'prri-la-plata:mapa-base';
const styles = {
  delegation: { color: '#004389', weight: 1.4, fillColor: '#0074bd', fillOpacity: .15 },
  delegationSelected: { color: '#004389', weight: 2.8, fillColor: '#0074bd', fillOpacity: .1 },
  delegationMuted: { color: '#838383', weight: 1, fillColor: '#0074bd', fillOpacity: .04 },
  neighborhood: { color: '#0066ff', weight: 1.25, fillColor: '#0099ff', fillOpacity: .14 },
  neighborhoodSelected: { color: '#003dcc', weight: 2.8, fillColor: '#0066ff', fillOpacity: .24 }
};
const satelliteStyles = {
  delegation: { color: '#8bddff', weight: 1.6, fillColor: '#0074bd', fillOpacity: .03 },
  delegationSelected: { color: '#ffffff', weight: 2.8, fillColor: '#0074bd', fillOpacity: .04 },
  delegationMuted: { color: '#a3bfca', weight: 1, fillColor: '#0074bd', fillOpacity: .02 },
  neighborhood: { color: '#47d0ff', weight: 1.5, fillColor: '#0099ff', fillOpacity: .08 },
  neighborhoodSelected: { color: '#ffffff', weight: 2.8, fillColor: '#00b8ff', fillOpacity: .16 }
};
const mapStyles = () => state.basemap === 'google' ? satelliteStyles : styles;

function selectBasemap(id, { remember = true, clearMessage = true } = {}) {
  const next = baseLayers.get(id);
  if (!next) return;
  if (baseLayer) map.removeLayer(baseLayer);
  state.basemap = id;
  baseLayer = next;
  $('basemap-select').value = id;
  document.querySelector('.map-shell').dataset.basemap = id;
  if (clearMessage) $('map-message').hidden = true;
  baseLayer.addTo(map);
  partidoLayer?.setStyle({ color: id === 'google' ? '#ffffff' : '#173c63' });
  styleDelegations();
  neighborhoodLayers.forEach((layer, other) => layer.setStyle(other === state.neighborhood ? mapStyles().neighborhoodSelected : mapStyles().neighborhood));
  if (remember) {
    try { localStorage.setItem(basemapPreferenceKey, id); } catch { /* Private browsing may disable storage. */ }
  }
}

function setupBasemaps() {
  baseLayers.set('osm', L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    minZoom: 3, maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }));
  // Direct XYZ connection, like QGIS. Availability is controlled by Google;
  // this is not the authenticated Google Maps Platform Map Tiles API.
  baseLayers.set('google', L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=es', {
    minZoom: 3, maxZoom: 19, keepBuffer: 0, updateWhenIdle: true, updateWhenZooming: false,
    attribution: '&copy; <a href="https://maps.google.com/">Google Maps</a> · <a href="https://www.google.com/intl/es/help/terms_maps/">Términos de uso</a>'
  }));
  for (const [id, layer] of baseLayers) {
    let tileErrors = 0;
    layer.on('loading', () => { tileErrors = 0; });
    layer.on('tileerror', () => {
      if (state.basemap !== id || ++tileErrors < 4) return;
      if (id === 'google') {
        selectBasemap('osm', { remember: false, clearMessage: false });
        toast('No se pudo cargar Google Hybrid. Se muestra OpenStreetMap; podés volver a elegir otro fondo.');
      } else {
        $('map-message').textContent = 'El mapa base no está disponible. Las capas y los protocolos siguen accesibles.';
        $('map-message').hidden = false;
      }
    });
    layer.on('load', () => {
      if (state.basemap === id && tileErrors === 0) $('map-message').hidden = true;
    });
  }
  let selected = state.config.mapa_base || 'osm';
  try { selected = localStorage.getItem(basemapPreferenceKey) || selected; } catch { /* Use the configured default. */ }
  // Preserve the imagery preference for visitors upgrading from version 3.03.
  const migrateSatellite = selected === 'satellite';
  if (migrateSatellite) selected = 'google';
  selectBasemap(baseLayers.has(selected) ? selected : 'osm', { remember: migrateSatellite });
  $('basemap-select').disabled = false;
}

function text(tag, value, className = '') {
  const element = document.createElement(tag);
  element.textContent = value ?? '';
  if (className) element.className = className;
  return element;
}

async function jsonFile(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(new URL(path, document.baseURI), { signal: controller.signal, cache: 'no-cache' });
    if (!response.ok) throw new Error(`No se pudo cargar ${path} (HTTP ${response.status}).`);
    return await response.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Se agotó el tiempo de carga de ${path}.`);
    throw e;
  } finally { clearTimeout(timer); }
}

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}

function fit(bounds) {
  if (!bounds?.isValid()) return;
  const showCard = !$('detail').hidden || !$('place-detail').hidden;
  const mobile = matchMedia('(max-width: 700px)').matches;
  const right = showCard && !mobile ? Math.min(420, map.getSize().x * .52) : 40;
  map.fitBounds(bounds, { paddingTopLeft: [30, 70], paddingBottomRight: [right, 50], maxZoom: 16, animate: !matchMedia('(prefers-reduced-motion: reduce)').matches });
}

function fitSelection() {
  if (state.place && !$('place-detail').hidden && placeLayer?.getLayers().length) { fit(placeLayer.getBounds()); return; }
  const bounds = neighborhoodLayers.get(state.neighborhood)?.getBounds() || delegationLayers.get(state.delegation)?.getBounds();
  if (bounds) fit(bounds);
  else fitPartido();
}

function fitPartido() {
  if (!allBounds?.isValid()) return;
  // Fractional zoom avoids jumping a whole level out when the outline almost fits.
  // Symmetric padding keeps the complete partido centered, including on small screens.
  map.fitBounds(allBounds, { padding: [24, 24], maxZoom: state.config.zoom, animate: false });
  // Size the metric bar to a real 5 km at this view, also on narrow screens.
  // Leaflet continues recalculating its distance normally when the user zooms.
  const middle = map.getSize().y / 2;
  const metersPer100Pixels = map.distance(map.containerPointToLatLng([0, middle]), map.containerPointToLatLng([100, middle]));
  scaleControl.options.maxWidth = Math.ceil(5000 / metersPer100Pixels * 100) + 1;
  scaleControl.remove().addTo(map);
}

function writeHash() {
  const value = selectionHash(state.delegation, state.neighborhood, state.place);
  if (location.hash !== value) history.pushState(null, '', location.pathname + location.search + value);
}

function prettyLabel(value) {
  return String(value).toLocaleLowerCase('es').replace(/(^|[\s-])\S/g, char => char.toLocaleUpperCase('es'));
}

function updateBreadcrumb() {
  const node = $('breadcrumb');
  node.replaceChildren(text('span', 'PARTIDO DE LA PLATA'));
  node.firstChild.style.margin = '0';
  node.firstChild.style.color = 'inherit';
  node.append(text('span', '/'), text('strong', state.delegation ? prettyLabel(state.index.byD.get(state.delegation).properties.nombre) : 'Vista general'));
}

function styleDelegations() {
  const palette = mapStyles();
  delegationLayers.forEach((layer, id) => layer.setStyle(state.delegation ? (id === state.delegation ? palette.delegationSelected : palette.delegationMuted) : palette.delegation));
}

function row(feature, kind) {
  const p = feature.properties, id = idOf(feature);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'result-row' + (kind === 'barrio' && state.neighborhood === id ? ' selected' : '');
  if (kind === 'barrio') button.setAttribute('aria-pressed', String(state.neighborhood === id));
  const icon = text('span', '', 'row-icon');
  // Constant SVG only: user-supplied attributes are rendered through textContent.
  icon.innerHTML = kind === 'delegacion'
    ? '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 2 8 8-8 8-8-8Z M6 6l8 8M6 14l8-8"/></svg>'
    : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 9 10 3l7 6v8H3Z M8 17v-6h4v6"/></svg>';
  const body = text('span', '', 'row-text');
  body.append(text('span', kind === 'delegacion' ? prettyLabel(p.nombre) : p.nombre, 'row-title'));
  const subtitle = kind === 'delegacion'
    ? `${state.index.groups.get(id).length} barrios · ${Number.isFinite(p.superficie_km2) ? new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(p.superficie_km2) + ' km²' : 'Ver delegación'}`
    : `${p.id} · ${state.delegation ? (p.cuenca || 'Cuenca sin informar') : prettyLabel(state.index.byD.get(String(p.delegacion_id)).properties.nombre)}`;
  body.append(text('span', subtitle, 'row-subtitle'));
  button.append(icon, body, text('span', '›', 'row-arrow'));
  button.addEventListener('click', () => kind === 'delegacion' ? selectDelegation(id) : selectNeighborhood(id));
  return button;
}

function renderResults() {
  const container = $('results'), fragment = document.createDocumentFragment();
  const { delegations, neighborhoods, places } = searchIndex(state.index, state.query, state.delegation);
  let count = 0;
  if (!state.delegation && !state.query.trim()) {
    $('results-heading').textContent = 'Delegaciones';
    delegations.forEach(f => fragment.append(row(f, 'delegacion')));
    count = delegations.length;
  } else {
    $('results-heading').textContent = state.query ? 'Resultados de búsqueda' : `Barrios (${neighborhoods.length})`;
    if (delegations.length && state.query) {
      fragment.append(text('p', 'DELEGACIONES', 'section-label'));
      delegations.forEach(f => fragment.append(row(f, 'delegacion')));
      count += delegations.length;
    }
    if (neighborhoods.length) {
      if (state.query && !state.delegation) fragment.append(text('p', 'BARRIOS', 'section-label'));
      neighborhoods.forEach(f => fragment.append(row(f, 'barrio')));
      count += neighborhoods.length;
    }
    if (state.query.trim()) {
      for (const [kind, label] of [['educacion', 'EDUCACIÓN'], ['salud', 'SALUD'], ['urbanizacion', 'URBANIZACIONES INFORMALES']]) {
        const matches = places.filter(f => f.properties.tipo === kind);
        if (!matches.length) continue;
        fragment.append(text('p', `${label} (${matches.length})`, 'section-label'));
        matches.forEach(f => fragment.append(placeRow(f)));
        count += matches.length;
      }
    }
  }
  if (!count) fragment.append(text('p', 'No hay coincidencias. Probá con otro nombre, número o código, o presioná «Ver todo» para buscar en todo el partido.', 'empty'));
  container.replaceChildren(fragment);
  $('results-count').textContent = `${count} ${count === 1 ? 'resultado' : 'resultados'}`;
}

function showLayers() {
  if ($('toggle-delegations').checked) delegationLayer.addTo(map);
  else map.removeLayer(delegationLayer);
  if ($('toggle-neighborhoods').checked) neighborhoodLayer.addTo(map);
  else map.removeLayer(neighborhoodLayer);
}

function renderNeighborhoods() {
  neighborhoodLayer.clearLayers();
  neighborhoodLayers.clear();
  const pool = state.delegation ? state.index.groups.get(state.delegation) : [];
  neighborhoodLayer.addData({ type: 'FeatureCollection', features: pool });
  showLayers();
}

function selectDelegation(id, { zoom = true, hash = true, clearQuery = true } = {}) {
  if (id && !state.index.byD.has(id)) return;
  clearPlace();
  state.delegation = id;
  state.neighborhood = '';
  $('detail').hidden = true;
  if (clearQuery) { state.query = ''; $('search').value = ''; }
  $('delegation-select').value = id;
  styleDelegations();
  renderNeighborhoods();
  renderResults();
  updateBreadcrumb();
  if (zoom) fitSelection();
  if (hash) writeHash();
}

function selectNeighborhood(id, { zoom = true, hash = true, keepPlace = !!state.place } = {}) {
  const feature = state.index.byB.get(id);
  if (!feature) return;
  const p = feature.properties, dId = String(p.delegacion_id);
  const placeId = keepPlace && state.index.byP.get(state.place)?.properties.barrio_ids.includes(id) ? state.place : '';
  if (!placeId) clearPlace();
  if (state.delegation !== dId) {
    selectDelegation(dId, { zoom: false, hash: false, clearQuery: false });
    if (placeId) { state.place = placeId; drawPlace(state.index.byP.get(placeId)); }
  }
  $('place-detail').hidden = true;
  $('back-to-place').hidden = !placeId;
  state.neighborhood = id;
  $('toggle-neighborhoods').checked = true;
  showLayers();
  neighborhoodLayers.forEach((layer, other) => layer.setStyle(other === id ? mapStyles().neighborhoodSelected : mapStyles().neighborhood));
  neighborhoodLayers.get(id)?.bringToFront();
  $('detail-code').textContent = id;
  $('detail-name').textContent = p.nombre;
  $('detail-delegation').textContent = state.index.byD.get(dId).properties.nombre;
  $('detail-basin').textContent = p.cuenca || 'Sin informar';
  const url = protocolUrl(p.protocolo, state.config.protocolos_base, document.baseURI);
  $('open-protocol').disabled = !url;
  $('open-protocol').hidden = !url;
  $('protocol-pending').hidden = !!url;
  $('protocol-note').textContent = !url ? 'El protocolo de este barrio se publicará cuando esté disponible.' : new URL(url).origin === location.origin ? 'Archivo incluido en este visor.' : 'Archivo enlazado al sitio de referencia.';
  if (url && p.codigo_protocolo_referencia) $('protocol-note').textContent += ` El documento conserva el código ${p.codigo_protocolo_referencia} de la numeración anterior.`;
  const details = $('recommendation-content');
  details.replaceChildren();
  for (const [key, label] of [['evitar', 'Sectores a evitar'], ['circulacion', 'Circulación recomendada'], ['punto_encuentro', 'Punto de encuentro'], ['observaciones', 'Observaciones']]) {
    if (p[key]) details.append(text('dt', label), text('dd', p[key]));
  }
  $('recommendations').hidden = !details.children.length;
  $('recommendations').open = false;
  $('detail').hidden = false;
  renderResults();
  if (zoom) fitSelection();
  if (zoom && matchMedia('(max-width: 700px)').matches) {
    document.querySelector('.map-shell').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  if (hash) writeHash();
}

function clearPlace() {
  state.place = '';
  placeLayer?.clearLayers();
  $('place-detail').hidden = true;
  $('back-to-place').hidden = true;
}

function placeRow(feature) {
  const p = feature.properties, button = text('button', '', 'result-row place-result' + (state.place === p.id ? ' selected' : ''));
  button.type = 'button';
  button.setAttribute('aria-pressed', String(state.place === p.id));
  const icon = text('span', p.tipo === 'educacion' ? 'E' : p.tipo === 'salud' ? '+' : 'U', 'row-icon place-kind');
  icon.setAttribute('aria-hidden', 'true');
  const body = text('span', '', 'row-text');
  body.append(text('span', p.nombre, 'row-title'));
  const territory = p.delegacion_ids.map(id => prettyLabel(state.index.byD.get(id).properties.nombre)).join(' · ');
  body.append(text('span', `${placeLabels[p.tipo]} · ${feature.geometry ? territory || 'Ubicación en el mapa' : 'Ubicación por verificar'}`, 'row-subtitle'));
  button.append(icon, body, text('span', '›', 'row-arrow'));
  button.addEventListener('click', () => selectPlace(p.id));
  return button;
}

function drawPlace(feature) {
  placeLayer.clearLayers();
  if (feature.geometry) placeLayer.addData(feature);
}

function selectPlace(id, { zoom = true, hash = true } = {}) {
  const feature = state.index.byP.get(id);
  if (!feature) return;
  const p = feature.properties;
  const currentD = p.delegacion_ids.includes(state.delegation) ? state.delegation : p.delegacion_ids.length === 1 ? p.delegacion_ids[0] : '';
  selectDelegation(currentD, { zoom: false, hash: false, clearQuery: false });
  state.place = id;
  // Show every intersected delegation's barrios for an area spanning boundaries.
  if (feature.geometry && p.delegacion_ids.length > 1) {
    neighborhoodLayer.clearLayers();
    neighborhoodLayers.clear();
    const features = p.delegacion_ids.flatMap(d => state.index.groups.get(d));
    neighborhoodLayer.addData({ type: 'FeatureCollection', features });
  }
  $('toggle-neighborhoods').checked = true;
  showLayers();
  drawPlace(feature);
  if (p.barrio_ids.length === 1) neighborhoodLayers.get(p.barrio_ids[0])?.setStyle(mapStyles().neighborhoodSelected);
  $('place-kind').textContent = placeLabels[p.tipo];
  $('place-name').textContent = p.nombre;
  const facts = $('place-facts'); facts.replaceChildren();
  const fact = (label, value) => {
    if (!value) return;
    const item = document.createElement('div'); item.append(text('dt', label), text('dd', value)); facts.append(item);
  };
  fact(p.delegacion_ids.length > 1 ? 'Delegaciones' : 'Delegación', p.delegacion_ids.map(d => prettyLabel(state.index.byD.get(d).properties.nombre)).join(' · '));
  fact('Dirección de referencia', p.direccion);
  if (p.codigo_origen) fact('Código', p.codigo_origen);
  $('place-location-note').textContent = !feature.geometry ? p.ubicacion_nota || 'Ubicación por verificar.' : p.descripcion || '';
  $('place-location-note').hidden = !$('place-location-note').textContent;
  $('place-location-note').className = feature.geometry ? 'protocol-note' : 'location-pending';
  const links = $('place-neighborhoods'); links.replaceChildren();
  if (p.barrio_ids.length) {
    links.append(text('p', p.tipo === 'urbanizacion' ? 'Barrios que intersectan esta área' : 'Barrio de esta ubicación', 'place-section-title'));
    for (const bId of p.barrio_ids) {
      const b = state.index.byB.get(bId).properties;
      const button = text('button', '', 'place-neighborhood-button'); button.type = 'button';
      button.append(text('strong', `${b.id} · ${b.nombre}`));
      const available = protocolUrl(b.protocolo, state.config.protocolos_base, document.baseURI);
      button.append(text('span', available ? 'Ver barrio y protocolo →' : 'Ver barrio · Protocolo en elaboración →'));
      button.addEventListener('click', () => selectNeighborhood(bId, { zoom: true, keepPlace: true }));
      links.append(button);
    }
  } else if (feature.geometry) {
    links.append(text('p', 'Esta ubicación no coincide con un barrio de la cartografía actual. Podés explorar los barrios del mapa.', 'protocol-note'));
  }
  $('place-source').textContent = ['Fuente: ' + p.fuente, p.fuente_direccion ? 'Dirección: ' + p.fuente_direccion : ''].filter(Boolean).join('. ');
  $('detail').hidden = true;
  $('place-detail').hidden = false;
  renderResults();
  if (zoom) { if (feature.geometry) fit(placeLayer.getBounds()); else fitPartido(); }
  if (zoom && matchMedia('(max-width: 700px)').matches) document.querySelector('.map-shell').scrollIntoView({ block: 'start', behavior: 'smooth' });
  if (hash) writeHash();
}

function applyHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const requested = params.get('barrio');
  const b = resolveNeighborhoodId(params, state.index), d = params.get('delegacion'), p = params.get('lugar');
  if (p && state.index.byP.has(p)) {
    selectPlace(p, { hash: false });
    if (b && state.index.byP.get(p).properties.barrio_ids.includes(b)) selectNeighborhood(b, { hash: false, keepPlace: true });
  } else if (b && state.index.byB.has(b)) selectNeighborhood(b, { hash: false });
  else if (d && state.index.byD.has(d)) selectDelegation(d, { hash: false });
  else {
    selectDelegation('', { hash: false });
    if (requested || d || p) toast('La selección del enlace no existe en las capas cargadas.');
  }
  if (requested && b && requested !== b && state.neighborhood === b) toast(`Numeración actualizada: ${requested} ahora es ${b}.`);
}

function openProtocol() {
  const p = state.index.byB.get(state.neighborhood)?.properties;
  if (!p) return;
  const url = protocolUrl(p.protocolo, state.config.protocolos_base, document.baseURI);
  if (!url) return;
  $('protocol-title').textContent = `${p.id} · ${p.nombre}`;
  $('protocol-external').href = url;
  $('protocol-origin').textContent = new URL(url).origin === location.origin ? 'Archivo del visor' : 'Documento del sitio de referencia';
  if (p.codigo_protocolo_referencia) $('protocol-origin').textContent += ` · Código anterior: ${p.codigo_protocolo_referencia}`;
  const body = $('protocol-body');
  body.replaceChildren();
  if (/\.pdf$/i.test(new URL(url).pathname)) {
    body.append(text('p', 'Si el PDF no se visualiza, usá «Abrir archivo».', 'protocol-note'));
    const frame = document.createElement('iframe');
    frame.title = `Protocolo ${p.id}`;
    frame.src = url;
    frame.referrerPolicy = 'no-referrer';
    body.append(frame);
  } else {
    const status = text('p', 'Cargando protocolo…', 'empty');
    const image = document.createElement('img');
    image.alt = `Protocolo del barrio ${p.nombre} (${p.id})`;
    image.addEventListener('load', () => status.remove(), { once: true });
    image.addEventListener('error', () => {
      image.remove();
      status.textContent = 'No se pudo cargar la imagen. Usá «Abrir archivo» para comprobar el enlace.';
    }, { once: true });
    image.src = url;
    body.append(status, image);
  }
  $('protocol-dialog').showModal();
}

function setupEvents() {
  document.querySelector('.skip-link').addEventListener('click', event => { event.preventDefault(); $('search').focus(); });
  $('search').addEventListener('input', e => { state.query = e.target.value; renderResults(); });
  $('delegation-select').addEventListener('change', e => selectDelegation(e.target.value));
  $('reset-button').addEventListener('click', () => selectDelegation(''));
  $('fit-button').addEventListener('click', fitSelection);
  $('close-detail').addEventListener('click', () => selectDelegation(state.delegation, { clearQuery: false }));
  $('close-place').addEventListener('click', () => selectDelegation(state.delegation, { clearQuery: false }));
  $('back-to-place').addEventListener('click', () => selectPlace(state.place));
  $('share-place').addEventListener('click', async () => {
    const url = new URL(location.href); url.hash = selectionHash('', '', state.place);
    try { await navigator.clipboard.writeText(url.href); toast('Enlace al lugar copiado.'); }
    catch { toast('Podés copiar el enlace desde la barra de direcciones.'); }
  });
  $('open-protocol').addEventListener('click', openProtocol);
  $('toggle-delegations').addEventListener('change', showLayers);
  $('toggle-neighborhoods').addEventListener('change', showLayers);
  $('basemap-select').addEventListener('change', event => selectBasemap(event.target.value));
  $('help-button').addEventListener('click', () => $('help-dialog').showModal());
  $('close-help').addEventListener('click', () => $('help-dialog').close());
  $('close-protocol').addEventListener('click', () => $('protocol-dialog').close());
  $('protocol-dialog').addEventListener('close', () => $('protocol-body').replaceChildren());
  $('share-button').addEventListener('click', async () => {
    const url = new URL(location.href);
    url.hash = selectionHash(state.delegation, state.neighborhood, state.place);
    try { await navigator.clipboard.writeText(url.href); toast('Enlace al barrio copiado.'); }
    catch { toast('Podés copiar el enlace desde la barra de direcciones.'); }
  });
  window.addEventListener('popstate', applyHash);
  window.addEventListener('hashchange', applyHash);
  new ResizeObserver(() => map.invalidateSize({ pan: false })).observe($('map'));
}

function renderInstitutionalLayout(config) {
  // Reconcilia también el HTML anterior que pueda conservar el navegador.
  const stylesheet = document.querySelector('link[href*="assets/styles.css"]');
  const stylesheetUrl = new URL('assets/styles.css?v=20261106.310', document.baseURI).href;
  if (stylesheet && stylesheet.href !== stylesheetUrl) stylesheet.href = stylesheetUrl;
  document.querySelectorAll('.version-banner, #data-notice').forEach(element => element.remove());
  document.querySelectorAll('.sidebar-footer .unit-logo').forEach(element => element.remove());
  document.title = config.titulo_pagina || config.titulo;
  $('site-title').textContent = config.titulo;
  const program = text('span', '');
  program.id = 'program-name';
  const initials = new Set(['programa', 'reducción', 'riesgo', 'inundaciones']);
  for (const word of config.subtitulo.split(/(\s+)/)) {
    if (initials.has(word.toLocaleLowerCase('es'))) {
      program.append(text('span', word[0], 'prri-initial'), document.createTextNode(word.slice(1)));
    } else {
      program.append(document.createTextNode(word));
    }
  }
  const programEdition = text('span', `(PRRI – ${config.edicion})`, 'program-edition');
  programEdition.id = 'program-edition';
  $('site-subtitle').replaceChildren(program, document.createTextNode(' '), programEdition);

  const editionBox = document.querySelector('.header-actions .edition');
  editionBox.removeAttribute('id');
  editionBox.setAttribute('aria-label', 'Versión y actualización');
  const edition = text('span', `Versión ${config.version}`);
  edition.id = 'edition';
  const updated = text('small', `Actualizado al ${config.fecha_version}`);
  updated.id = 'updated-date';
  editionBox.replaceChildren(edition, updated);

  const unit = text('strong', config.unidad || 'Unidad de Gestión de Riesgo');
  unit.id = 'unit';
  const organization = text('span', config.institucion);
  organization.id = 'organization';
  document.querySelector('.sidebar-footer .footer-copy').replaceChildren(unit, organization);
}

async function start() {
  if (location.protocol === 'file:') return;
  const config = await jsonFile('config.json');
  renderInstitutionalLayout(config);
  const [delegations, neighborhoods, partido, places] = await Promise.all([jsonFile(config.delegaciones), jsonFile(config.barrios), jsonFile(config.partido), config.lugares ? jsonFile(config.lugares) : { type: 'FeatureCollection', features: [] }]);
  state.config = config;
  state.index = buildIndex(delegations, neighborhoods, places);
  $('help-source').textContent = `${config.aviso || config.edicion}. ${config.fecha_datos}. Los archivos de protocolo se muestran sin modificar su contenido.`;
  const source = new URL(config.fuente, document.baseURI);
  if (source.protocol === 'https:') $('source-link').href = source.href;
  $('totals').replaceChildren(text('strong', state.index.dList.length), document.createTextNode(' delegaciones'), text('span', '  ·  '), text('strong', state.index.bList.length), document.createTextNode(' barrios'));
  for (const feature of state.index.dList) {
    const option = text('option', prettyLabel(feature.properties.nombre));
    option.value = idOf(feature);
    $('delegation-select').append(option);
  }
  $('delegation-select').disabled = false;
  if (!window.L) throw new Error('No se pudo cargar Leaflet. Verificá la carpeta vendor/leaflet.');
  map = L.map('map', { zoomControl: false, doubleClickZoom: false, scrollWheelZoom: true, zoomSnap: .25 });
  L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
  scaleControl = L.control.scale({ position: 'bottomright', imperial: false, maxWidth: 100 }).addTo(map);
  setupBasemaps();
  map.createPane('partido');
  map.getPane('partido').style.zIndex = '420';
  map.getPane('partido').style.pointerEvents = 'none';
  partidoLayer = L.geoJSON(partido, {
    pane: 'partido', interactive: false,
    style: { color: state.basemap === 'google' ? '#ffffff' : '#173c63', weight: 2.3, fill: false }
  }).addTo(map);
  map.createPane('delegations');
  map.getPane('delegations').style.zIndex = '400';
  map.createPane('neighborhoods');
  map.getPane('neighborhoods').style.zIndex = '410';
  delegationLayer = L.geoJSON(delegations, {
    pane: 'delegations', style: () => mapStyles().delegation,
    onEachFeature: (feature, layer) => {
      const id = idOf(feature);
      delegationLayers.set(id, layer);
      layer.bindTooltip(text('span', prettyLabel(feature.properties.nombre)), { sticky: true });
      layer.on('click', () => selectDelegation(id));
      layer.on('mouseover', () => layer.setStyle({ fillOpacity: .3 }));
      layer.on('mouseout', styleDelegations);
    }
  }).addTo(map);
  neighborhoodLayer = L.geoJSON(null, {
    pane: 'neighborhoods', style: () => mapStyles().neighborhood,
    onEachFeature: (feature, layer) => {
      const id = idOf(feature);
      neighborhoodLayers.set(id, layer);
      layer.bindTooltip(text('span', `${id} · ${feature.properties.nombre}`), { sticky: true });
      layer.on('click', () => selectNeighborhood(id));
      layer.on('mouseover', () => layer.setStyle({ fillOpacity: .43 }));
      layer.on('mouseout', () => layer.setStyle(id === state.neighborhood ? mapStyles().neighborhoodSelected : mapStyles().neighborhood));
    }
  }).addTo(map);
  map.createPane('places');
  map.getPane('places').style.zIndex = '430';
  placeLayer = L.geoJSON(null, {
    pane: 'places',
    style: { color: '#005a99', weight: 3, dashArray: '7 4', fillColor: '#29b6e8', fillOpacity: .12, interactive: false },
    pointToLayer: (feature, latlng) => L.marker(latlng, {
      title: feature.properties.nombre, alt: feature.properties.nombre,
      icon: L.divIcon({ className: 'place-map-marker', html: '<span aria-hidden="true">●</span>', iconSize: [30, 30], iconAnchor: [15, 15] })
    }),
    onEachFeature: (feature, layer) => {
      if (feature.geometry.type === 'Point') {
        layer.bindTooltip(text('span', feature.properties.nombre), { direction: 'top', offset: [0, -15] });
        layer.on('click', () => selectPlace(idOf(feature), { zoom: false }));
      }
    }
  }).addTo(map);
  allBounds = partidoLayer.getBounds();
  setupEvents();
  // A refresh returns to the partido; a shared link still opens its barrio on arrival.
  if (performance.getEntriesByType('navigation')[0]?.type === 'reload') {
    history.replaceState(null, '', location.pathname + location.search);
    selectDelegation('', { hash: false });
  } else applyHash();
  $('search').disabled = false;
}

const ready = document.readyState === 'loading' ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true })) : Promise.resolve();
ready.then(start).catch(error => {
  console.error('Visor:', error);
  $('results').replaceChildren(text('p', `No se pudo iniciar el visor. ${error.message}`, 'empty'));
  $('totals').textContent = 'Revisá la configuración y las capas.';
  $('results-count').textContent = 'Error al cargar los datos.';
});

