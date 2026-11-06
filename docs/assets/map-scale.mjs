// Distances are ground metres at the map centre, not EPSG:3857 plane metres.
export function scaleDimensions(metresPerPixel, maxWidth = 160) {
  if (!Number.isFinite(metresPerPixel) || metresPerPixel <= 0 || !Number.isFinite(maxWidth) || maxWidth <= 0) return null;
  const maxMetres = metresPerPixel * maxWidth;
  const power = 10 ** Math.floor(Math.log10(maxMetres));
  const factor = [5, 2, 1].find(n => n * power <= maxMetres * (1 + 1e-10));
  const metres = factor * power;
  const unit = metres >= 1000 ? 'km' : 'm', divisor = unit === 'km' ? 1000 : 1;
  const number = value => (value / divisor).toLocaleString('es-AR', { maximumFractionDigits: 3, useGrouping: false });
  return { metres, width: metres / metresPerPixel, start: '0', middle: number(metres / 2), end: `${number(metres)} ${unit}`, segment: `${number(metres / 4)} ${unit}` };
}

export function createGraphicScale(L, options = {}) {
  const GraphicScale = L.Control.extend({
    options: { position: 'bottomright', maxWidth: 160 },
    onAdd(map) {
      this._container = L.DomUtil.create('div', 'leaflet-control-scale graphic-scale');
      this._container.setAttribute('role', 'img');
      this._container.innerHTML = '<div class="graphic-scale-labels" aria-hidden="true"><span>0</span><span></span><span></span></div><div class="graphic-scale-bar" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
      this._labels = this._container.querySelectorAll('.graphic-scale-labels span');
      L.DomEvent.disableClickPropagation(this._container);
      map.on('moveend zoomend resize', this._update, this);
      map.whenReady(this._update, this);
      return this._container;
    },
    onRemove(map) {
      map.off('moveend zoomend resize load', this._update, this);
    },
    _update() {
      const map = this._map;
      if (!map || map.getZoom() === undefined) return;
      const y = map.getSize().y / 2;
      const metresPerPixel = map.distance(map.containerPointToLatLng([0, y]), map.containerPointToLatLng([100, y])) / 100;
      const scale = scaleDimensions(metresPerPixel, this.options.maxWidth);
      if (!scale) return;
      this._container.style.setProperty('--scale-width', `${scale.width}px`);
      this._container.dataset.metres = String(scale.metres);
      this._labels[1].textContent = scale.middle;
      this._labels[2].textContent = scale.end;
      this._labels[1].hidden = false;
      const middleWidth = this._labels[1].getBoundingClientRect().width || scale.middle.length * 6;
      const endWidth = this._labels[2].getBoundingClientRect().width || scale.end.length * 6;
      // Keep the four segments even when a short bar only has room for its ends.
      this._labels[1].hidden = scale.width / 2 - middleWidth / 2 < 10 || scale.width / 2 + middleWidth / 2 + 5 > scale.width - endWidth;
      this._container.setAttribute('aria-label', `Escala gráfica de 0 a ${scale.end}; cuatro segmentos de ${scale.segment}, calculada a la latitud del centro del mapa.`);
    }
  });
  return new GraphicScale(options);
}
