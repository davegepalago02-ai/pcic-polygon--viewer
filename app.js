/* PCIC offline farm viewer; native SVG. No CDN, map tile, backend, or runtime GeoPackage parser. */
(() => {
  'use strict';
  const dataset = window.PCIC_FARMS;
  if (!dataset || !Array.isArray(dataset.features) || !dataset.features.length) {
    document.body.textContent = 'Unable to load the embedded farm polygon dataset.';
    return;
  }
  const $ = (id) => document.getElementById(id);
  const svg = $('mapSvg');
  const farmLayer = $('farmLayer');
  const labelLayer = $('labelLayer');
  const gridLayer = $('graticuleLayer');
  const results = $('resultList');
  const searchInput = $('searchInput');
  const selectedCard = $('selectedCard');
  const tooltip = $('mapTooltip');
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const [lonMin, latMin, lonMax, latMax] = dataset.bounds;
  const originLon = (lonMin + lonMax) / 2;
  const originLat = (latMin + latMax) / 2;
  const xMetresPerDegree = 111320 * Math.cos(originLat * Math.PI / 180);
  const yMetresPerDegree = 111132;
  const project = ([lon, lat]) => ({x: (lon - originLon) * xMetresPerDegree, y: (originLat - lat) * yMetresPerDegree});
  const pointA = project([lonMin, latMax]);
  const pointB = project([lonMax, latMin]);
  const farmBounds = {x: pointA.x, y: pointA.y, w: pointB.x - pointA.x, h: pointB.y - pointA.y};
  let view = {x: -500, y: -500, w: 1000, h: 1000};
  let currentId = null;
  let labelsVisible = true;
  let visibleFeatures = [];
  let pointerStart = null;
  let wasDragged = false;
  let recentDragTime = 0;

  function createSvg(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
    return node;
  }
  function normalizedId(raw) {
    let id = String(raw || '').toUpperCase().replace(/\s+/g, '');
    // Allow common user spelling RO1, RO01 and R1 for canonical R01.
    const prefix = id.match(/^(?:RO|R)0?(\d{1,2})(?=-)/);
    if (prefix) id = `R${prefix[1].padStart(2, '0')}${id.slice(prefix[0].length)}`;
    return id;
  }
  function suffixOf(id) { return id.split('-').at(-1); }
  function eachPoint(geometry, handler) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    polygons.forEach(polygon => polygon.forEach(ring => ring.forEach(coord => handler(coord))));
  }
  function geometryPath(geometry) {
    const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    let d = '';
    polys.forEach(poly => poly.forEach(ring => {
      ring.forEach((coordinate, idx) => {
        const p = project(coordinate);
        d += `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(3)},${p.y.toFixed(3)}`;
      });
      d += 'Z';
    }));
    return d;
  }
  const farms = dataset.features.map((f, index) => {
    const bbox = {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity};
    eachPoint(f.geometry, coord => {
      const p = project(coord);
      bbox.minX = Math.min(bbox.minX, p.x); bbox.maxX = Math.max(bbox.maxX, p.x);
      bbox.minY = Math.min(bbox.minY, p.y); bbox.maxY = Math.max(bbox.maxY, p.y);
    });
    return {...f, index, suffix: suffixOf(f.id), pos: project(f.labelPoint), bbox};
  });
  const byId = new Map(farms.map(f => [normalizedId(f.id), f]));

  // Accurate coordinate lines form the offline base map; nothing is fetched online.
  function makeGraticule() {
    const step = 0.002;  // two-thousandths of a degree, roughly 200 m here
    const minLon = Math.floor((lonMin - 0.03) / step) * step;
    const maxLon = Math.ceil((lonMax + 0.03) / step) * step;
    const minLat = Math.floor((latMin - 0.03) / step) * step;
    const maxLat = Math.ceil((latMax + 0.03) / step) * step;
    for (let lon = minLon; lon <= maxLon + step / 2; lon += step) {
      const p1 = project([lon, minLat]); const p2 = project([lon, maxLat]);
      gridLayer.appendChild(createSvg('line', {x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y, class:'graticule'}));
    }
    for (let lat = minLat; lat <= maxLat + step / 2; lat += step) {
      const p1 = project([minLon, lat]); const p2 = project([maxLon, lat]);
      gridLayer.appendChild(createSvg('line', {x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y, class:'graticule'}));
    }
  }
  function makeParcels() {
    for (const f of farms) {
      const path = createSvg('path', {'class':'parcel', d: geometryPath(f.geometry), 'fill-rule':'evenodd', 'data-id':f.id, tabindex:'0', role:'button', 'aria-label':`Select parcel ${f.id}`});
      path.addEventListener('click', event => {
        if (performance.now() - recentDragTime < 140) return;
        event.stopPropagation();
        selectFarm(f, true);
      });
      path.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectFarm(f, true); }
      });
      path.addEventListener('pointerenter', event => { if (!pointerStart) showTooltip(event, f); });
      path.addEventListener('pointermove', event => { if (!pointerStart) showTooltip(event, f); });
      path.addEventListener('pointerleave', () => { tooltip.hidden = true; });
      f.node = path;
      farmLayer.appendChild(path);
      const label = createSvg('text', {'class':'farm-label'});
      labelLayer.appendChild(label);
      f.label = label;
    }
  }
  function showTooltip(event, f) {
    tooltip.textContent = f.id;
    tooltip.hidden = false;
    const rect = svg.getBoundingClientRect();
    const x = Math.min(event.clientX - rect.left + 12, rect.width - tooltip.offsetWidth - 8);
    const y = Math.max(event.clientY - rect.top - 39, 8);
    tooltip.style.left = `${Math.max(8, x)}px`;
    tooltip.style.top = `${y}px`;
  }
  function aspect() { return Math.max(.4, svg.clientWidth / Math.max(1, svg.clientHeight)); }
  function constrain(v) {
    // Prevent extreme zoom or losing every parcel in unlimited empty space.
    const h = Math.max(24, Math.min(22000, v.h));
    const w = h * aspect();
    const cx = Math.max(-10000, Math.min(10000, v.x + v.w / 2));
    const cy = Math.max(-10000, Math.min(10000, v.y + v.h / 2));
    return {x:cx-w/2,y:cy-h/2,w,h};
  }
  function updateView(v) {
    view = constrain(v);
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    drawLabels();
    drawScale();
  }
  function getPixelScale() { return view.h / Math.max(1, svg.clientHeight); }
  function drawLabels() {
    const size = getPixelScale();
    const occupied = [];
    const isZoomedIn = view.h < 470;
    const ordered = farms.slice().sort((a, b) => (b.id === currentId) - (a.id === currentId));
    ordered.forEach(f => {
      const selected = f.id === currentId;
      const text = selected || isZoomedIn ? f.id : f.suffix;
      const px = (f.pos.x - view.x) / view.w * svg.clientWidth;
      const py = (f.pos.y - view.y) / view.h * svg.clientHeight;
      const textW = text.length * (selected ? 7.25 : 6.5) + 6;
      const box = {l:px-textW/2, r:px+textW/2, t:py-10, b:py+10};
      const inside = box.r >= 0 && box.l <= svg.clientWidth && box.b >= 0 && box.t <= svg.clientHeight;
      const intersects = occupied.some(b => box.l < b.r && box.r > b.l && box.t < b.b && box.b > b.t);
      const display = labelsVisible && inside && (selected || !intersects);
      f.label.style.display = display ? '' : 'none';
      if (!display) return;
      if (!selected) occupied.push(box);
      else occupied.unshift(box);
      f.label.textContent = text;
      f.label.setAttribute('x', f.pos.x);
      f.label.setAttribute('y', f.pos.y);
      f.label.setAttribute('font-size', size * (selected ? 12 : 11));
      f.label.setAttribute('stroke-width', size * (selected ? 4 : 3));
      f.label.classList.toggle('selected', selected);
    });
  }
  function drawScale() {
    const metresPerPixel = getPixelScale();
    const targetMetres = 105 * metresPerPixel;
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(.0001, targetMetres))));
    const options = [1,2,5,10].map(n => n * magnitude);
    const nice = options.filter(v => v <= targetMetres).at(-1) || magnitude;
    $('scaleLine').style.width = `${Math.max(25, nice / metresPerPixel)}px`;
    $('scaleLabel').textContent = nice >= 1000 ? `${nice / 1000} km` : `${Math.round(nice * 100) / 100} m`;
  }
  function fitAll() {
    const margin = 140;
    const h = Math.max(farmBounds.h + margin * 2, (farmBounds.w + margin * 2) / aspect());
    const w = h * aspect();
    const cx = farmBounds.x + farmBounds.w / 2;
    const cy = farmBounds.y + farmBounds.h / 2;
    updateView({x:cx-w/2,y:cy-h/2,w,h});
  }
  function fitFarm(f) {
    const b = f.bbox;
    const bw = b.maxX - b.minX;
    const bh = b.maxY - b.minY;
    const h = Math.max(90, bh * 3.1, bw * 3.1 / aspect());
    const w = h * aspect();
    const cx = (b.minX + b.maxX)/2;
    const cy = (b.minY + b.maxY)/2;
    updateView({x:cx-w/2,y:cy-h/2,w,h});
  }
  function zoomAround(x, y, multiplier) {
    const m = Math.max(.15, Math.min(5, multiplier));
    updateView({x:x+(view.x-x)*m,y:y+(view.y-y)*m,w:view.w*m,h:view.h*m});
  }
  function screenToWorld(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return {x:view.x + (clientX-r.left)/r.width*view.w, y:view.y + (clientY-r.top)/r.height*view.h};
  }
  function centerZoom(multiplier) { zoomAround(view.x+view.w/2,view.y+view.h/2,multiplier); }
  function selectFarm(f, focus) {
    currentId = f.id;
    farms.forEach(farm => farm.node.classList.toggle('selected', farm === f));
    selectedCard.hidden = false;
    $('selectedId').textContent = f.id;
    updateResults();
    if (focus) fitFarm(f); else drawLabels();
    if (window.matchMedia('(max-width:670px)').matches) $('sidebar').classList.remove('open');
    try { history.replaceState(null,'',`#id=${encodeURIComponent(f.id)}`); } catch (_) { /* file:// preview */ }
  }
  function clearSelected() {
    currentId = null;
    farms.forEach(farm => farm.node.classList.remove('selected'));
    selectedCard.hidden = true;
    updateResults();
    drawLabels();
    try { history.replaceState(null,'',location.pathname + location.search); } catch (_) { /* file:// preview */ }
  }
  function queryMatches(q) {
    q = normalizedId(q);
    if (!q) return farms;
    if (/^\d+$/.test(q)) {
      const matchesExact = farms.filter(f => BigInt(f.suffix) === BigInt(q));
      if (matchesExact.length) return matchesExact;
      return farms.filter(f => f.suffix.includes(q));
    }
    if (q.includes('-')) return farms.filter(f => normalizedId(f.id).includes(q));
    return farms.filter(f => normalizedId(f.id).includes(q));
  }
  function updateResults() {
    visibleFeatures = queryMatches(searchInput.value);
    $('resultHeading').textContent = searchInput.value.trim() ? 'MATCHING GEOREF IDs' : 'ALL GEOREF IDs';
    $('resultCount').textContent = `${visibleFeatures.length} result${visibleFeatures.length !== 1 ? 's' : ''}`;
    $('noResults').hidden = visibleFeatures.length !== 0;
    results.replaceChildren();
    visibleFeatures.forEach((f, idx) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'result-button' + (f.id === currentId ? ' selected' : '');
      item.setAttribute('role', 'listitem');
      item.setAttribute('aria-label', `Zoom to ${f.id}`);
      const num = document.createElement('span'); num.className='result-number'; num.textContent = String(f.index + 1).padStart(2,'0');
      const name = document.createElement('span'); name.className='result-name'; name.textContent=f.id;
      const arrow = document.createElement('span'); arrow.className='result-arrow'; arrow.setAttribute('aria-hidden','true'); arrow.textContent='›';
      item.append(num,name,arrow);
      item.addEventListener('click', () => selectFarm(f, true));
      results.appendChild(item);
    });
  }
  function submitSearch(event) {
    event.preventDefault();
    const matches = queryMatches(searchInput.value);
    if (matches.length === 1) selectFarm(matches[0], true);
    else if (matches.length > 1 && searchInput.value.trim()) {
      // A partial ID may refer to multiple farms: let the user choose from the list.
      $('resultList').querySelector('.result-button')?.focus();
    } else if (!searchInput.value.trim()) {
      clearSelected(); fitAll();
    }
  }
  function handlePointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pointerStart = {id:e.pointerId,x:e.clientX,y:e.clientY,startX:view.x,startY:view.y};
    wasDragged = false;
    tooltip.hidden = true;
  }
  function handlePointerMove(e) {
    if (!pointerStart || e.pointerId !== pointerStart.id) return;
    const dx = e.clientX-pointerStart.x, dy = e.clientY-pointerStart.y;
    if (Math.hypot(dx,dy)>4) wasDragged = true;
    if (wasDragged) {
      if (!svg.hasPointerCapture(e.pointerId)) svg.setPointerCapture(e.pointerId);
      svg.classList.add('dragging');
      updateView({x:pointerStart.startX-dx*view.w/svg.clientWidth, y:pointerStart.startY-dy*view.h/svg.clientHeight,w:view.w,h:view.h});
    }
  }
  function handlePointerUp(e) {
    if (!pointerStart || pointerStart.id !== e.pointerId) return;
    if (wasDragged) recentDragTime=performance.now();
    pointerStart = null;
    svg.classList.remove('dragging');
    try { if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId); } catch (_){}
  }
  function start() {
    makeGraticule(); makeParcels(); fitAll();
    $('countBadge').textContent = `${farms.length} polygons`;
    $('footerCount').textContent = `${farms.length} / ${farms.length}`;
    updateResults();
    searchInput.addEventListener('input', updateResults);
    $('searchForm').addEventListener('submit', submitSearch);
    for (const [btn,sample] of [['example084','000084'],['example84','84']]) {
      $(btn).addEventListener('click', () => {searchInput.value=sample;updateResults();submitSearch(new Event('submit'));});
    }
    $('clearSelection').addEventListener('click',clearSelected);
    $('zoomIn').addEventListener('click',()=>centerZoom(.75));
    $('zoomOut').addEventListener('click',()=>centerZoom(1/.75));
    $('fitMap').addEventListener('click',()=>{clearSelected();fitAll();});
    $('toggleLabels').addEventListener('click',()=>{labelsVisible=!labelsVisible;$('toggleLabels').setAttribute('aria-pressed',String(labelsVisible));drawLabels();});
    $('mobileToggle').addEventListener('click',()=>$('sidebar').classList.toggle('open'));
    svg.addEventListener('pointerdown',handlePointerDown);
    svg.addEventListener('pointermove',handlePointerMove);
    svg.addEventListener('pointerup',handlePointerUp);
    svg.addEventListener('pointercancel',handlePointerUp);
    svg.addEventListener('wheel',e=>{e.preventDefault();const p=screenToWorld(e.clientX,e.clientY);zoomAround(p.x,p.y,e.deltaY<0?.79:1/.79);},{passive:false});
    svg.addEventListener('dblclick',e=>{e.preventDefault();const p=screenToWorld(e.clientX,e.clientY);zoomAround(p.x,p.y,.65);});
    svg.addEventListener('keydown',e=>{
      if (e.key==='Escape') {clearSelected();return;}
      const unit = view.h * .12;
      const moves={ArrowLeft:[-unit,0],ArrowRight:[unit,0],ArrowUp:[0,-unit],ArrowDown:[0,unit]};
      if(moves[e.key]){e.preventDefault();const [x,y]=moves[e.key];updateView({...view,x:view.x+x,y:view.y+y});}
      if(e.key==='+'||e.key==='='){e.preventDefault();centerZoom(.77);}
      if(e.key==='-'){e.preventDefault();centerZoom(1/.77);}
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape' && document.activeElement!==svg){$('sidebar').classList.remove('open');clearSelected();}});
    let lastSize={w:svg.clientWidth,h:svg.clientHeight};
    new ResizeObserver(()=>{const w=svg.clientWidth,h=svg.clientHeight;if(!w||!h)return;if(w!==lastSize.w||h!==lastSize.h){const cx=view.x+view.w/2,cy=view.y+view.h/2;lastSize={w,h};const width=view.h*aspect();updateView({x:cx-width/2,y:cy-view.h/2,w:width,h:view.h});}}).observe(svg);
    const urlId = new URLSearchParams(location.hash.slice(1)).get('id');
    if(urlId && byId.has(normalizedId(urlId))) selectFarm(byId.get(normalizedId(urlId)),true);
    requestAnimationFrame(() => document.querySelector('.app-shell').classList.add('ready'));
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
    }
  }
  start();
})();
