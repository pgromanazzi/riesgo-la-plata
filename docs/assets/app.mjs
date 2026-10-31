import { buildIndex, searchIndex, idOf, protocolUrl, selectionHash } from './data.mjs';

const $ = id => document.getElementById(id);
const state = { delegation: '', neighborhood: '', query: '', config: null, index: null };
let map, delegationLayer, neighborhoodLayer, allBounds, baseLayer, scaleControl, toastTimer;
const delegationLayers = new Map(), neighborhoodLayers = new Map();
const styles = {
  delegation: { color: '#004389', weight: 1.4, fillColor: '#0074bd', fillOpacity: .15 },
  delegationSelected: { color: '#004389', weight: 2.8, fillColor: '#0074bd', fillOpacity: .1 },
  delegationMuted: { color: '#838383', weight: 1, fillColor: '#0074bd', fillOpacity: .04 },
  neighborhood: { color: '#0066ff', weight: 1.25, fillColor: '#0099ff', fillOpacity: .14 },
  neighborhoodSelected: { color: '#003dcc', weight: 2.8, fillColor: '#0066ff', fillOpacity: .24 }
};

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
  const showCard = !$('detail').hidden;
  const mobile = matchMedia('(max-width: 700px)').matches;
  const right = showCard && !mobile ? Math.min(420, map.getSize().x * .52) : 40;
  map.fitBounds(bounds, { paddingTopLeft: [30, 70], paddingBottomRight: [right, 50], maxZoom: 16, animate: !matchMedia('(prefers-reduced-motion: reduce)').matches });
}

function fitSelection() {
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
  const value = selectionHash(state.delegation, state.neighborhood);
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
  delegationLayers.forEach((layer, id) => layer.setStyle(state.delegation ? (id === state.delegation ? styles.delegationSelected : styles.delegationMuted) : styles.delegation));
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
  const { delegations, neighborhoods } = searchIndex(state.index, state.query, state.delegation);
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
  }
  if (!count) fragment.append(text('p', 'No hay coincidencias. Probá con otro nombre, código o cuenca, o presioná «Ver todo» para buscar en todo el partido.', 'empty'));
  container.replaceChildren(fragment);
  $('results-count').textContent = `${count} resultados`;
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

function selectNeighborhood(id, { zoom = true, hash = true } = {}) {
  const feature = state.index.byB.get(id);
  if (!feature) return;
  const p = feature.properties, dId = String(p.delegacion_id);
  if (state.delegation !== dId) selectDelegation(dId, { zoom: false, hash: false });
  state.neighborhood = id;
  $('toggle-neighborhoods').checked = true;
  showLayers();
  neighborhoodLayers.forEach((layer, other) => layer.setStyle(other === id ? styles.neighborhoodSelected : styles.neighborhood));
  neighborhoodLayers.get(id)?.bringToFront();
  $('detail-code').textContent = id;
  $('detail-name').textContent = p.nombre;
  $('detail-delegation').textContent = state.index.byD.get(dId).properties.nombre;
  $('detail-basin').textContent = p.cuenca || 'Sin informar';
  const url = protocolUrl(p.protocolo, state.config.protocolos_base, document.baseURI);
  $('open-protocol').disabled = !url;
  $('open-protocol').replaceChildren(text('span', url ? 'Ver protocolo' : 'Protocolo no disponible'), text('span', '↗'));
  $('protocol-note').textContent = !url ? 'Este barrio todavía no tiene un archivo de protocolo vinculado.' : new URL(url).origin === location.origin ? 'Archivo incluido en este visor.' : 'Archivo enlazado al sitio de referencia.';
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

function applyHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const b = params.get('barrio'), d = params.get('delegacion');
  if (b && state.index.byB.has(b)) selectNeighborhood(b, { hash: false });
  else if (d && state.index.byD.has(d)) selectDelegation(d, { hash: false });
  else {
    selectDelegation('', { hash: false });
    if (b || d) toast('La selección del enlace no existe en las capas cargadas.');
  }
}

function openProtocol() {
  const p = state.index.byB.get(state.neighborhood)?.properties;
  if (!p) return;
  const url = protocolUrl(p.protocolo, state.config.protocolos_base, document.baseURI);
  if (!url) return;
  $('protocol-title').textContent = `${p.id} · ${p.nombre}`;
  $('protocol-external').href = url;
  $('protocol-origin').textContent = new URL(url).origin === location.origin ? 'Archivo del visor' : 'Documento del sitio de referencia';
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
  $('open-protocol').addEventListener('click', openProtocol);
  $('toggle-delegations').addEventListener('change', showLayers);
  $('toggle-neighborhoods').addEventListener('change', showLayers);
  $('help-button').addEventListener('click', () => $('help-dialog').showModal());
  $('close-help').addEventListener('click', () => $('help-dialog').close());
  $('close-protocol').addEventListener('click', () => $('protocol-dialog').close());
  $('protocol-dialog').addEventListener('close', () => $('protocol-body').replaceChildren());
  $('share-button').addEventListener('click', async () => {
    const url = new URL(location.href);
    url.hash = selectionHash(state.delegation, state.neighborhood);
    try { await navigator.clipboard.writeText(url.href); toast('Enlace al barrio copiado.'); }
    catch { toast('Podés copiar el enlace desde la barra de direcciones.'); }
  });
  window.addEventListener('popstate', applyHash);
  window.addEventListener('hashchange', applyHash);
  new ResizeObserver(() => map.invalidateSize({ pan: false })).observe($('map'));
}

async function start() {
  if (location.protocol === 'file:') return;
  const config = await jsonFile('config.json');
  const [delegations, neighborhoods] = await Promise.all([jsonFile(config.delegaciones), jsonFile(config.barrios)]);
  state.config = config;
  state.index = buildIndex(delegations, neighborhoods);
  document.title = config.titulo;
  $('site-title').textContent = config.titulo;
  $('site-subtitle').textContent = config.subtitulo;
  $('edition').textContent = `Versión ${config.version}`;
  $('data-notice').textContent = `${config.edicion} del ${config.subtitulo} · Actualizado al ${config.fecha_version} - v. ${config.version}`;
  $('data-notice').hidden = false;
  $('organization').textContent = `${config.institucion} - ${config.edicion}`;
  $('author').textContent = `Responsable: ${config.autor}`;
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
  baseLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    minZoom: 3, maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  let tileErrors = 0;
  baseLayer.on('tileerror', () => {
    if (++tileErrors >= 4) { $('map-message').textContent = 'El mapa base no está disponible. Las capas y los protocolos siguen accesibles.'; $('map-message').hidden = false; }
  });
  baseLayer.on('tileload', () => { tileErrors = 0; $('map-message').hidden = true; });
  map.createPane('delegations');
  map.getPane('delegations').style.zIndex = '400';
  map.createPane('neighborhoods');
  map.getPane('neighborhoods').style.zIndex = '410';
  delegationLayer = L.geoJSON(delegations, {
    pane: 'delegations', style: styles.delegation,
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
    pane: 'neighborhoods', style: styles.neighborhood,
    onEachFeature: (feature, layer) => {
      const id = idOf(feature);
      neighborhoodLayers.set(id, layer);
      layer.bindTooltip(text('span', `${id} · ${feature.properties.nombre}`), { sticky: true });
      layer.on('click', () => selectNeighborhood(id));
      layer.on('mouseover', () => layer.setStyle({ fillOpacity: .43 }));
      layer.on('mouseout', () => layer.setStyle(id === state.neighborhood ? styles.neighborhoodSelected : styles.neighborhood));
    }
  }).addTo(map);
  allBounds = delegationLayer.getBounds();
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
