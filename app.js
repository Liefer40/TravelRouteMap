  function enrichLineWithPassengerName(lineObj) {
    const rawName = (lineObj.name || '').trim();
    // 末尾の「 (〜1988廃止)」「 (〜2024部分廃止)」などを分離
    const suffixMatch = rawName.match(/(\s*\(〜.*?\))$/);
    const suffix = suffixMatch ? suffixMatch[1] : '';
    const core = suffix ? rawName.slice(0, -suffix.length).trim() : rawName;

    // 会社名と路線名を文字列自体から確実に分割（全角・半角スペース両対応）
    const spIdx = core.search(/[\s ]/);
    const compPart = spIdx >= 0 ? core.slice(0, spIdx).trim() : (lineObj.company || '');
    const linePart = spIdx >= 0 ? core.slice(spIdx).trim()     : (lineObj.lineName || core);

    let passengerLinePart = null;
    const extraAliases = [];

    for (const rule of PASSENGER_LINE_NAME_RULES) {
      if (compPart.includes(rule.comp) && linePart === rule.line) {
        passengerLinePart = rule.passenger;
        if (rule.alias) extraAliases.push(rule.alias);
        break;
      }
    }

    // 地下鉄などの「3号線銀座線」「4号線丸ノ内線」「1号線浅草線」から「〇号線」を自動除去
    if (!passengerLinePart && /^[0-9０-９]+号線/.test(linePart)) {
      const cleaned = linePart.replace(/^[0-9０-９]+号線\s*/, '');
      if (cleaned && cleaned !== linePart) {
        passengerLinePart = cleaned;
        extraAliases.push(cleaned);
      }
    }

    // 会社名の「（旧国鉄）」も、旅客案内モードではスッキリ見やすい「JR北海道 / JR東日本…」に変換！
    const cleanComp = compPart
      .replace('北海道旅客鉄道（旧国鉄）', 'JR北海道')
      .replace('東日本旅客鉄道（旧国鉄）', 'JR東日本')
      .replace('東海旅客鉄道（旧国鉄）', 'JR東海')
      .replace('西日本旅客鉄道（旧国鉄）', 'JR西日本')
      .replace('四国旅客鉄道（旧国鉄）', 'JR四国')
      .replace('九州旅客鉄道（旧国鉄）', 'JR九州')
      .replace('北海道旅客鉄道', 'JR北海道')
      .replace('東日本旅客鉄道', 'JR東日本')
      .replace('東海旅客鉄道', 'JR東海')
      .replace('西日本旅客鉄道', 'JR西日本')
      .replace('四国旅客鉄道', 'JR四国')
      .replace('九州旅客鉄道', 'JR九州');

    const finalLinePart = passengerLinePart || linePart;

    // 1. 正式名称モード（N05原典そのまま：例「東日本旅客鉄道（旧国鉄） 赤羽線」）
    lineObj.officialName = rawName;

    // 2. 旅客案内名モード（スッキリした案内表記：例「JR東日本 埼京線（赤羽線：池袋〜赤羽）」）
    lineObj.passengerName = cleanComp ? `${cleanComp} ${finalLinePart}${suffix}` : `${finalLinePart}${suffix}`;

    // 3. 併記モード（案内名と正式名の違いが一目でわかる表記）
    if (passengerLinePart && passengerLinePart !== linePart) {
      lineObj.bothName = `${cleanComp} ${passengerLinePart} ［正式: ${linePart}］${suffix}`;
    } else {
      lineObj.bothName = lineObj.passengerName;
    }

    lineObj.searchText = normalizeKanji(`${rawName} ${lineObj.passengerName} ${lineObj.bothName} ${extraAliases.join(' ')}`);
  }

  function getLineDisplayName(line) {
    if (!line) return '';
    // もし未計算の路線オブジェクトがあればその場で計算（確実動作の安全装置！）
    if (!line.officialName) enrichLineWithPassengerName(line);
    const mode = document.getElementById('rail-name-mode-select')?.value || 'PASSENGER_BOTH';
    if (mode === 'OFFICIAL') return line.officialName;
    if (mode === 'PASSENGER') return line.passengerName;
    return line.bothName;
  }

  function onRailNameModeChange() {
    renderRailLineList();
    if (selectedRailLineName) renderRailDetail(selectedRailLineName);
    if (mapLockedLineName) {
      const disp = getLineDisplayName(railLineMap.get(mapLockedLineName)) || mapLockedLineName;
      document.getElementById('rail-lock-text').textContent = `🎯 路線絞り込み中: ${disp}`;
    }
  }

  let map, geojsonLayer;
  let railActiveGroup, railAbandonedGroup, railStationsGroup;
  let airRoutesGroup, airAirportsGroup;
  let seaRoutesGroup, seaPortsGroup;
  let busRoutesGroup, busStopsGroup;

  let muniRenderer, railAbandonedRenderer, railActiveRenderer, airRenderer, seaRenderer, busRenderer;
  let currentMainTab = 'muni'; // 'muni' | 'rail' | 'air' | 'sea' | 'bus'

  let municipalities = [];
  let muniLookup = new Map();
  let spatialPolygons = [];
  let userRecords = {};
  let selectedCode = null;
  let fillOpacitySetting = 0.45;
  let hintTimer = null;

  // 鉄道状態
  let baseRawRailLines = [];
  let isCurrentN05Mode = false;
  let railLines = [];
  let railLineMap = new Map();
  let stationLayerMap = new Map();
  let riddenSegments = {};
  let stationRecords = {};
  let selectedRailLineName = null;
  let mapLockedLineName = null;
  let currentRailFilter = 'ALL';
  let currentRailEraFilter = 'ALL';

  // ✈️ 空路状態
  let airportLookup = new Map();
  let airportMarkers = new Map();
  let airRoutes = [];
  let airRouteMap = new Map();
  let airUserRecords = { airports: {}, routes: {}, customPairs: [] }; // airports: {code: 0..3}, routes: {id: true}
  let currentAirViewMode = 'ROUTES'; // 'ROUTES' | 'AIRPORTS' | 'RIDDEN_ONLY'
  let selectedAirRouteId = null;

  // ⛴️ 航路状態
  let seaRoutes = [];
  let seaRouteMap = new Map();
  let seaPortLayerMap = new Map();
  let seaUserRecords = { segments: {}, ports: {}, customRoutes: [] };
  let currentSeaFilter = 'ALL';
  let selectedSeaRouteName = null;

  // 🚌 バス状態
  let busRoutes = [];
  let busRouteMap = new Map();
  let busStopLayerMap = new Map();
  let busUserRecords = { segments: {}, stops: {}, customRoutes: [] };
  let currentBusFilter = 'ALL';
  let selectedBusRouteName = null;

  // =========================================================
  // 初期化
  // =========================================================
  window.addEventListener('DOMContentLoaded', async () => {
    loadStorage();
    initMap();
    initControls();

    await loadMapData('s0010');
    await initRailwaySystem();
    initAirSystem();
    initSeaSystem();
    initBusSystem();
    applyTabInteractionMode();
  });

  function initControls() {
    document.getElementById('pref-select').addEventListener('change', onFilterChange);
    document.getElementById('search-input').addEventListener('input', renderList);
    document.getElementById('merge-designated-toggle').addEventListener('change', () => {
      updateAllStyles();
      updateStats();
      renderList();
    });

    document.getElementById('resolution-select').addEventListener('change', async (e) => {
      await loadMapData(e.target.value, true);
    });

    document.getElementById('fill-opacity-slider').addEventListener('input', (e) => {
      fillOpacitySetting = Number(e.target.value) / 100;
      document.getElementById('fill-opacity-val').textContent = `${e.target.value}%`;
      updateAllStyles();
    });

    document.getElementById('map-opacity-slider').addEventListener('input', (e) => {
      const val = Number(e.target.value);
      document.getElementById('map-opacity-val').textContent = `${val}%`;
      document.documentElement.style.setProperty('--map-tile-opacity', val / 100);
    });

    document.getElementById('map-saturate-slider').addEventListener('input', (e) => {
      const val = Number(e.target.value);
      document.getElementById('map-saturate-val').textContent = `${val}%`;
      document.documentElement.style.setProperty('--map-tile-saturate', `${val}%`);
    });

    document.getElementById('strong-border-toggle').addEventListener('change', () => {
      updateAllStyles();
    });

    const railPrefSelect = document.getElementById('rail-pref-select');
    PREF_NAMES.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      railPrefSelect.appendChild(opt);
    });

    document.getElementById('gist-token-input').value = localStorage.getItem(GIST_TOKEN_STORAGE_KEY) || '';
    updateSyncStatus();
  }

  function toggleMapSettings() {
    const el = document.getElementById('map-settings-panel');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }

  function toggleSyncPanel() {
    const el = document.getElementById('sync-panel');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }

  // スマホ表示時：全画面地図の上に記録パネルを重ねる／閉じる
  function toggleMobilePanel() {
    const isOpen = document.body.classList.toggle('mobile-panel-open');
    document.getElementById('mobile-view-toggle').textContent = isOpen ? '🗺️ 地図に戻る' : '📋 記録パネル';
  }

  // =========================================================
  // 5タブ切替 ＆ 排他クリック制御
  // =========================================================
  function switchMainTab(tab) {
    currentMainTab = tab;
    ['muni', 'rail', 'air', 'sea', 'bus'].forEach(t => {
      document.getElementById(`tab-btn-${t}`).classList.toggle('active', t === tab);
      document.getElementById(`pane-${t}`).classList.toggle('active', t === tab);
    });

    const badge = document.getElementById('mode-badge');
    const modeInfo = {
      muni: { text: '🏙️ 現在：市区町村クリックモード（他レイヤーは反応しません）', bg: 'rgba(15, 23, 42, 0.9)' },
      rail: { text: '🚃 現在：鉄道路線・駅クリックモード（他レイヤーは反応しません）', bg: 'rgba(159, 18, 57, 0.92)' },
      air:  { text: '✈️ 現在：空路・国内空港クリックモード（他レイヤーは反応しません）', bg: 'rgba(2, 132, 199, 0.92)' },
      sea:  { text: '⛴️ 現在：航路・港クリックモード（他レイヤーは反応しません）', bg: 'rgba(79, 70, 229, 0.92)' },
      bus:  { text: '🚌 現在：バス路線・停留所クリックモード（他レイヤーは反応しません）', bg: 'rgba(5, 150, 105, 0.92)' }
    };
    badge.textContent = modeInfo[tab].text;
    badge.style.background = modeInfo[tab].bg;

    applyTabInteractionMode();
  }

  function setPaneInteractive(paneName, renderer, isEnabled) {
    const ptr = isEnabled ? 'auto' : 'none';
    const paneEl = map?.getPane(paneName);
    if (paneEl) paneEl.style.pointerEvents = ptr;
    if (renderer?._container) renderer._container.style.pointerEvents = ptr;
  }

  function applyTabInteractionMode() {
    setPaneInteractive('muniPane', muniRenderer, currentMainTab === 'muni');
    setPaneInteractive('railAbandonedPane', railAbandonedRenderer, currentMainTab === 'rail');
    setPaneInteractive('railActivePane', railActiveRenderer, currentMainTab === 'rail');
    setPaneInteractive('airPane', airRenderer, currentMainTab === 'air');
    setPaneInteractive('seaPane', seaRenderer, currentMainTab === 'sea');
    setPaneInteractive('busPane', busRenderer, currentMainTab === 'bus');
  }

  function toggleLayers() {
    const showMuni      = document.getElementById('show-muni-layer').checked;
    const showRail      = document.getElementById('show-rail-layer').checked;
    const showAbandoned = document.getElementById('show-abandoned-layer').checked;
    const showAir       = document.getElementById('show-air-layer').checked;
    const showSea       = document.getElementById('show-sea-layer').checked;
    const showBus       = document.getElementById('show-bus-layer').checked;
    const showSt        = document.getElementById('show-station-layer').checked;

    const syncGroup = (grp, show) => {
      if (!grp) return;
      if (show && !map.hasLayer(grp)) map.addLayer(grp);
      if (!show && map.hasLayer(grp)) map.removeLayer(grp);
    };

    syncGroup(geojsonLayer, showMuni);
    syncGroup(railActiveGroup, showRail);
    syncGroup(railAbandonedGroup, showAbandoned);
    syncGroup(airRoutesGroup, showAir);
    syncGroup(seaRoutesGroup, showSea);
    syncGroup(busRoutesGroup, showBus);

    syncGroup(railStationsGroup, showSt && (showRail || showAbandoned));
    syncGroup(airAirportsGroup, showSt && showAir);
    syncGroup(seaPortsGroup, showSt && showSea);
    syncGroup(busStopsGroup, showSt && showBus);

    applyTabInteractionMode();
  }

  // =========================================================
  // ストレージ読み書き
  // =========================================================
  function loadStorage() {
    try {
      const savedMuni = localStorage.getItem(STORAGE_KEY);
      if (savedMuni) userRecords = JSON.parse(savedMuni);

      const savedSeg = localStorage.getItem(RAIL_SEG_STORAGE_KEY);
      if (savedSeg) riddenSegments = JSON.parse(savedSeg);

      const savedSt = localStorage.getItem(RAIL_ST_STORAGE_KEY);
      if (savedSt) stationRecords = JSON.parse(savedSt);

      const savedAir = localStorage.getItem(AIR_STORAGE_KEY);
      if (savedAir) airUserRecords = { airports: {}, routes: {}, customPairs: [], ...JSON.parse(savedAir) };

      const savedSea = localStorage.getItem(SEA_STORAGE_KEY);
      if (savedSea) seaUserRecords = { segments: {}, ports: {}, customRoutes: [], ...JSON.parse(savedSea) };

      const savedBus = localStorage.getItem(BUS_STORAGE_KEY);
      if (savedBus) busUserRecords = { segments: {}, stops: {}, customRoutes: [], ...JSON.parse(savedBus) };
    } catch (e) {
      console.error(e);
    }
  }

  function saveStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userRecords));
    localStorage.setItem(RAIL_SEG_STORAGE_KEY, JSON.stringify(riddenSegments));
    localStorage.setItem(RAIL_ST_STORAGE_KEY, JSON.stringify(stationRecords));
    localStorage.setItem(AIR_STORAGE_KEY, JSON.stringify(airUserRecords));
    localStorage.setItem(SEA_STORAGE_KEY, JSON.stringify(seaUserRecords));
    localStorage.setItem(BUS_STORAGE_KEY, JSON.stringify(busUserRecords));
  }

  function resetAllData() {
    if (confirm('市区町村・鉄道・空路・航路・バスのすべての記録をリセットしますか？\n※この操作は元に戻せません。')) {
      userRecords = {};
      riddenSegments = {};
      stationRecords = {};
      airUserRecords = { airports: {}, routes: {}, customPairs: [] };
      seaUserRecords = { segments: {}, ports: {}, customRoutes: [] };
      busUserRecords = { segments: {}, stops: {}, customRoutes: [] };
      saveStorage();

      updateAllStyles();
      updateAllRailStyles();
      initAirSystem();
      initSeaSystem();
      initBusSystem();
      updateStats();
      updateRailStats();
      renderList();
      renderRailLineList();
      alert('すべての記録をリセットしました！');
    }
  }

  // =========================================================
  // マップ初期化（5種類の専用Paneを構築）
  // =========================================================
  function initMap() {
    const googleStreets = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ja', {
      maxZoom: 20,
      attribution: '&copy; Google Maps | 国土数値情報 (N03/N05/N07/N09/C28)'
    });
    const osmStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
    const gsiPale = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', { maxZoom: 18 });
    const cartoLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', { maxZoom: 19 });

    map = L.map('map', {
      preferCanvas: true,
      layers: [googleStreets],
      doubleClickZoom: false,
      scrollWheelZoom: false,
      zoomControl: true
    }).setView([36.20, 138.00], 6);

    map.createPane('muniPane');          map.getPane('muniPane').style.zIndex = 400;
    map.createPane('seaPane');           map.getPane('seaPane').style.zIndex  = 430;
    map.createPane('busPane');           map.getPane('busPane').style.zIndex  = 450;
    map.createPane('railAbandonedPane'); map.getPane('railAbandonedPane').style.zIndex = 460;
    map.createPane('railActivePane');    map.getPane('railActivePane').style.zIndex = 460;
    map.createPane('airPane');           map.getPane('airPane').style.zIndex  = 470;

    muniRenderer          = L.canvas({ pane: 'muniPane', padding: 0.5 });
    seaRenderer           = L.canvas({ pane: 'seaPane', padding: 0.5, tolerance: 6 });
    busRenderer           = L.canvas({ pane: 'busPane', padding: 0.5, tolerance: 6 });
    railActiveRenderer    = L.canvas({ pane: 'railActivePane', padding: 0.5, tolerance: 7 });
    railAbandonedRenderer = railActiveRenderer;
    airRenderer           = L.canvas({ pane: 'airPane', padding: 0.5, tolerance: 6 });

    seaRoutesGroup     = L.featureGroup().addTo(map);
    seaPortsGroup      = L.featureGroup().addTo(map);
    railAbandonedGroup = L.featureGroup().addTo(map);
    busRoutesGroup     = L.featureGroup().addTo(map);
    busStopsGroup      = L.featureGroup().addTo(map);
    railActiveGroup    = L.featureGroup().addTo(map);
    railStationsGroup  = L.featureGroup().addTo(map);
    airRoutesGroup     = L.featureGroup().addTo(map);
    airAirportsGroup   = L.featureGroup().addTo(map);

    const mapEl = document.getElementById('map');
    const hintEl = document.getElementById('zoom-hint');

    mapEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        hintEl.classList.remove('show');
        const mouseLatLng = map.mouseEventToLatLng(e);
        const delta = e.deltaY < 0 ? 1 : -1;
        map.setZoomAround(mouseLatLng, map.getZoom() + delta);
      } else {
        hintEl.classList.add('show');
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => hintEl.classList.remove('show'), 1400);
      }
    }, { passive: false });

    const baseMaps = {
      "Google マップ（駅・施設・路線）": googleStreets,
      "OpenStreetMap（鉄道路線くっきり）": osmStandard,
      "国土地理院 淡色地図（見やすい背景）": gsiPale,
      "シンプル白地図（文字なし）": cartoLight
    };
    // スマホ幅（style.css の @media と同じ 768px）では背景地図の切替を折りたたむ
    const isMobileLayout = window.matchMedia('(max-width: 768px)').matches;
    L.control.layers(baseMaps, null, { collapsed: isMobileLayout, position: 'topright' }).addTo(map);
  }

  // =========================================================
  // ✈️ 空路（国内空港＆放物線アーチ搭乗ルート）システム
  // =========================================================
  function generateArcPoints(lat1, lng1, lat2, lng2, numPoints = 32) {
    const pts = [];
    const dLat = lat2 - lat1;
    const dLng = lng2 - lng1;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    // 2点間の距離に応じた滑らかなアーチオフセット（西側・北西側へ膨らむ美しいフライト曲線）
    const offsetMag = dist * 0.14;
    const midLat = (lat1 + lat2) / 2 + (Math.abs(dLng) / (dist || 1)) * offsetMag * 0.6;
    const midLng = (lng1 + lng2) / 2 - (Math.abs(dLat) / (dist || 1)) * offsetMag;

    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const u = 1 - t;
      const lat = u * u * lat1 + 2 * u * t * midLat + t * t * lat2;
      const lng = u * u * lng1 + 2 * u * t * midLng + t * t * lng2;
      pts.push([lat, lng]);
    }
    return pts;
  }

  function initAirSystem() {
    airRoutesGroup.clearLayers();
    airAirportsGroup.clearLayers();
    airportLookup.clear();
    airportMarkers.clear();
    airRoutes = [];
    airRouteMap.clear();

    const fromSel = document.getElementById('air-from-select');
    const toSel   = document.getElementById('air-to-select');
    fromSel.innerHTML = '';
    toSel.innerHTML = '';

    JAPAN_AIRPORTS.forEach((ap, idx) => {
      airportLookup.set(ap.code, ap);
      const opt1 = document.createElement('option');
      opt1.value = ap.code;
      opt1.textContent = `${ap.name} (${ap.code}) - ${ap.pref}`;
      fromSel.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = ap.code;
      opt2.textContent = `${ap.name} (${ap.code}) - ${ap.pref}`;
      if (idx === 9) opt2.selected = true; // デフォルト新千歳
      toSel.appendChild(opt2);
    });
    fromSel.value = 'HND';

    // デフォルト路線＋ユーザーが追加したカスタムペアを合算
    const allPairs = [...DEFAULT_AIR_ROUTE_PAIRS, ...(airUserRecords.customPairs || [])];
    const seenRouteIds = new Set();

    allPairs.forEach(([c1, c2]) => {
      const ap1 = airportLookup.get(c1);
      const ap2 = airportLookup.get(c2);
      if (!ap1 || !ap2 || c1 === c2) return;
      const sorted = [c1, c2].sort();
      const routeId = `AIR::${sorted[0]}_${sorted[1]}`;
      if (seenRouteIds.has(routeId)) return;
      seenRouteIds.add(routeId);

      const arcCoords = generateArcPoints(ap1.lat, ap1.lng, ap2.lat, ap2.lng);
      const poly = L.polyline(arcCoords, {
        renderer: airRenderer,
        pane: 'airPane',
        ...getAirRouteStyle(routeId)
      });

      poly.on('click', (e) => {
        if (currentMainTab !== 'air') return;
        L.DomEvent.stopPropagation(e);
        toggleAirRoute(routeId);
      });

      poly.bindTooltip(() => {
        if (currentMainTab !== 'air') return '';
        const isRidden = !!airUserRecords.routes[routeId];
        return `✈️ <strong>${ap1.name} (${c1}) ⇔ ${ap2.name} (${c2})</strong><br>ステータス: 【${isRidden ? '搭乗済' : '未乗'}】`;
      }, { sticky: true });

      airRoutesGroup.addLayer(poly);

      const rObj = {
        id: routeId,
        code1: c1,
        code2: c2,
        ap1,
        ap2,
        name: `${ap1.name} ⇔ ${ap2.name}`,
        layer: poly
      };
      airRoutes.push(rObj);
      airRouteMap.set(routeId, rObj);
    });

    // 空港マーカー描画
    JAPAN_AIRPORTS.forEach(ap => {
      const marker = L.circleMarker([ap.lat, ap.lng], {
        renderer: airRenderer,
        pane: 'airPane',
        ...getAirportMarkerStyle(ap.code)
      });

      marker.on('click', (e) => {
        if (currentMainTab !== 'air') return;
        L.DomEvent.stopPropagation(e);
        cycleAirportStatus(ap.code);
      });

      marker.bindTooltip(() => {
        if (currentMainTab !== 'air') return '';
        const st = airUserRecords.airports[ap.code] || 0;
        return `🛫 <strong>${ap.name} (${ap.code})</strong> [${ap.pref}]<br>ステータス: 【${st}: ${AIRPORT_STATUS_LABELS[st]}】<br><small>クリックで 未訪→通過→利用→御翔印済 を切替</small>`;
      });

      airAirportsGroup.addLayer(marker);
      airportMarkers.set(ap.code, marker);
    });

    updateAirStats();
    renderAirList();
  }

  function getAirRouteStyle(routeId) {
    const isRidden = !!airUserRecords.routes[routeId];
    const isSelected = routeId === selectedAirRouteId;
    if (isRidden) {
      return {
        color: '#0284c7',
        weight: isSelected ? 5.0 : 3.5,
        opacity: 0.92,
        dashArray: null
      };
    } else {
      return {
        color: isSelected ? '#2563eb' : '#38bdf8',
        weight: isSelected ? 3.5 : 1.5,
        opacity: isSelected ? 0.85 : 0.35,
        dashArray: '4, 6'
      };
    }
  }

  function getAirportMarkerStyle(code) {
    const st = airUserRecords.airports[code] || 0;
    return {
      radius: st > 0 ? 6.5 : 4.8,
      fillColor: AIRPORT_STATUS_COLORS[st] || '#ffffff',
      fillOpacity: 0.95,
      color: st === 3 ? '#581c87' : '#0369a1',
      weight: st > 0 ? 2.2 : 1.5
    };
  }

  function toggleAirRoute(routeId) {
    if (airUserRecords.routes[routeId]) {
      delete airUserRecords.routes[routeId];
    } else {
      airUserRecords.routes[routeId] = true;
      // 搭乗済にした際、両端の空港が未訪(0)なら自動的に「2:利用(乗降)」へ引き上げる便利連動
      const r = airRouteMap.get(routeId);
      if (r) {
        if (!airUserRecords.airports[r.code1]) airUserRecords.airports[r.code1] = 2;
        if (!airUserRecords.airports[r.code2]) airUserRecords.airports[r.code2] = 2;
        updateAirportMarker(r.code1);
        updateAirportMarker(r.code2);
      }
    }
    selectedAirRouteId = routeId;
    saveStorage();
    airRoutes.forEach(r => r.layer.setStyle(getAirRouteStyle(r.id)));
    updateAirStats();
    renderAirList();
    renderAirDetail(routeId);
  }

  function addOrRideAirRoute() {
    const c1 = document.getElementById('air-from-select').value;
    const c2 = document.getElementById('air-to-select').value;
    if (!c1 || !c2 || c1 === c2) {
      alert('異なる出発空港と到着空港を選択してください。');
      return;
    }
    const sorted = [c1, c2].sort();
    const routeId = `AIR::${sorted[0]}_${sorted[1]}`;

    if (!airRouteMap.has(routeId)) {
      if (!airUserRecords.customPairs) airUserRecords.customPairs = [];
      airUserRecords.customPairs.push(sorted);
      initAirSystem();
    }
    airUserRecords.routes[routeId] = true;
    if (!airUserRecords.airports[c1]) airUserRecords.airports[c1] = 2;
    if (!airUserRecords.airports[c2]) airUserRecords.airports[c2] = 2;
    selectedAirRouteId = routeId;
    saveStorage();

    airRoutes.forEach(r => r.layer.setStyle(getAirRouteStyle(r.id)));
    updateAirportMarker(c1);
    updateAirportMarker(c2);
    updateAirStats();
    renderAirList();
    renderAirDetail(routeId);

    const r = airRouteMap.get(routeId);
    if (r) map.fitBounds(r.layer.getBounds(), { padding: [50, 50] });
  }

  function updateAirportMarker(code) {
    const m = airportMarkers.get(code);
    if (m) {
      const style = getAirportMarkerStyle(code);
      m.setStyle(style);
      m.setRadius(style.radius);
    }
  }

  function cycleAirportStatus(code) {
    const cur = airUserRecords.airports[code] || 0;
    const next = (cur + 1) % 4; // 0:未訪 -> 1:通過 -> 2:利用 -> 3:御翔印済 -> 0
    if (next === 0) delete airUserRecords.airports[code];
    else airUserRecords.airports[code] = next;
    saveStorage();
    updateAirportMarker(code);
    updateAirStats();
    renderAirList();
    if (selectedAirRouteId) renderAirDetail(selectedAirRouteId);
  }

  function setAirViewMode(mode) {
    currentAirViewMode = mode;
    document.querySelectorAll('[data-amode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.amode === mode);
    });
    renderAirList();
  }

  function updateAirStats() {
    const totalAp = JAPAN_AIRPORTS.length;
    let visitedAp = 0, goshoinAp = 0;
    JAPAN_AIRPORTS.forEach(ap => {
      const st = airUserRecords.airports[ap.code] || 0;
      if (st > 0) visitedAp++;
      if (st === 3) goshoinAp++;
    });
    const apPct = totalAp ? ((visitedAp / totalAp) * 100).toFixed(1) : '0.0';
    document.getElementById('air-airport-stats').textContent = `${visitedAp} / ${totalAp} 空港 (💮御翔印: ${goshoinAp})`;
    document.getElementById('air-airport-bar').style.width = `${apPct}%`;

    const totalRt = airRoutes.length;
    const riddenRt = airRoutes.filter(r => !!airUserRecords.routes[r.id]).length;
    const rtPct = totalRt ? ((riddenRt / totalRt) * 100).toFixed(1) : '0.0';
    document.getElementById('air-route-stats').textContent = `${riddenRt} / ${totalRt} 路線 (${rtPct}%)`;
    document.getElementById('air-route-bar').style.width = `${rtPct}%`;
  }

  function renderAirList() {
    const listEl = document.getElementById('air-list');
    const kw = document.getElementById('air-search-input').value.trim().toUpperCase();
    listEl.innerHTML = '';

    if (currentAirViewMode === 'AIRPORTS') {
      const filteredAp = JAPAN_AIRPORTS.filter(ap => {
        if (!kw) return true;
        return ap.name.includes(kw) || ap.code.includes(kw) || ap.pref.includes(kw);
      });
      filteredAp.forEach(ap => {
        const st = airUserRecords.airports[ap.code] || 0;
        const badgeCls = st === 3 ? 'badge-4' : (st === 2 ? 'badge-2' : (st === 1 ? 'badge-1' : 'badge-0'));
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
          <span>🛫 <strong>${ap.name}</strong> <small style="color:#64748b">(${ap.code} / ${ap.pref})</small></span>
          <span class="badge ${badgeCls}">${st === 3 ? '💮 ' : ''}${AIRPORT_STATUS_LABELS[st]}</span>
        `;
        item.onclick = () => {
          cycleAirportStatus(ap.code);
          map.setView([ap.lat, ap.lng], 10);
        };
        listEl.appendChild(item);
      });
    } else {
      const filteredRt = airRoutes.filter(r => {
        if (currentAirViewMode === 'RIDDEN_ONLY' && !airUserRecords.routes[r.id]) return false;
        if (!kw) return true;
        return r.name.includes(kw) || r.code1.includes(kw) || r.code2.includes(kw) || r.ap1.pref.includes(kw) || r.ap2.pref.includes(kw);
      });
      filteredRt.forEach(r => {
        const isRidden = !!airUserRecords.routes[r.id];
        const item = document.createElement('div');
        item.className = 'list-item' + (r.id === selectedAirRouteId ? ' active' : '');
        item.innerHTML = `
          <span>✈️ ${r.name} <small style="color:#64748b">(${r.code1}-${r.code2})</small></span>
          <span class="badge ${isRidden ? 'badge-1' : 'badge-0'}">${isRidden ? '搭乗済' : '未乗'}</span>
        `;
        item.onclick = () => {
          selectedAirRouteId = r.id;
          airRoutes.forEach(rt => rt.layer.setStyle(getAirRouteStyle(rt.id)));
          renderAirList();
          renderAirDetail(r.id);
          map.fitBounds(r.layer.getBounds(), { padding: [50, 50] });
        };
        listEl.appendChild(item);
      });
    }
  }

  function renderAirDetail(routeId) {
    const panel = document.getElementById('air-detail-panel');
    const r = airRouteMap.get(routeId);
    if (!r) return;
    const isRidden = !!airUserRecords.routes[r.id];
    const st1 = airUserRecords.airports[r.code1] || 0;
    const st2 = airUserRecords.airports[r.code2] || 0;

    panel.innerHTML = `
      <div class="section-title" style="margin-bottom:6px;">
        <span style="font-size:13px; color:#0f172a;">✈️ ${r.name}</span>
        <span class="badge ${isRidden ? 'badge-1' : 'badge-0'}">${isRidden ? '搭乗済' : '未乗'}</span>
      </div>
      <div class="station-row">
        <span>🛫 <strong>${r.ap1.name} (${r.code1})</strong> [${r.ap1.pref}]</span>
        <button class="st-status-btn st-btn-${st1}" onclick="cycleAirportStatus('${r.code1}')">
          ${st1 === 3 ? '💮 ' : ''}${AIRPORT_STATUS_LABELS[st1]}
        </button>
      </div>
      <div class="segment-row ${isRidden ? 'ridden-air' : ''}" onclick="toggleAirRoute('${r.id}')">
        <span>↕ フライト区間（クリックで搭乗済 ⇔ 未乗 切替）</span>
        <span>${isRidden ? '● 搭乗済' : '○ 未乗'}</span>
      </div>
      <div class="station-row">
        <span>🛬 <strong>${r.ap2.name} (${r.code2})</strong> [${r.ap2.pref}]</span>
        <button class="st-status-btn st-btn-${st2}" onclick="cycleAirportStatus('${r.code2}')">
          ${st2 === 3 ? '💮 ' : ''}${AIRPORT_STATUS_LABELS[st2]}
        </button>
      </div>
    `;
  }

  // =========================================================
  // ⛴️ 航路（国内フェリー・離島航路）システム
  // =========================================================
  function initSeaSystem() {
    seaRoutesGroup.clearLayers();
    seaPortsGroup.clearLayers();
    seaRoutes = [];
    seaRouteMap.clear();
    seaPortLayerMap.clear();

    const allSeaRaw = [...BUILTIN_SEA_ROUTES, ...(seaUserRecords.customRoutes || [])];

    allSeaRaw.forEach(raw => {
      const rName = raw.name;
      const stations = (raw.stations || []).map((s, idx) => ({
        ...s,
        idx,
        stKey: `PORT_${s.name}_${Number(s.lat).toFixed(2)}_${Number(s.lng).toFixed(2)}`
      }));

      const segments = [];
      (raw.segments || []).forEach(sg => {
        const segId = `SEA::${rName}::${sg.from}::${sg.to}`;
        const poly = L.polyline(sg.path, {
          renderer: seaRenderer,
          pane: 'seaPane',
          ...getSeaSegmentStyle(segId, rName)
        });

        poly.on('click', (e) => {
          if (currentMainTab !== 'sea') return;
          L.DomEvent.stopPropagation(e);
          toggleSeaSegment(segId, rName);
        });

        poly.bindTooltip(() => {
          if (currentMainTab !== 'sea') return '';
          const isRidden = !!seaUserRecords.segments[segId];
          return `⛴️ <strong>${rName}</strong><br>${sg.from} ⇔ ${sg.to} 【${isRidden ? '乗船済' : '未乗'}】`;
        }, { sticky: true });

        seaRoutesGroup.addLayer(poly);
        segments.push({ id: segId, routeName: rName, from: sg.from, to: sg.to, layer: poly });
      });

      stations.forEach(st => {
        const marker = L.circleMarker([st.lat, st.lng], {
          renderer: seaRenderer,
          pane: 'seaPane',
          ...getSeaPortMarkerStyle(st.stKey)
        });
        marker.on('click', (e) => {
          if (currentMainTab !== 'sea') return;
          L.DomEvent.stopPropagation(e);
          cycleSeaPortStatus(st.stKey, rName);
        });
        marker.bindTooltip(() => {
          if (currentMainTab !== 'sea') return '';
          const stStatus = seaUserRecords.ports[st.stKey] || 0;
          return `⚓ <strong>${st.name}</strong>（${rName}）<br>港ステータス: 【${stStatus}: ${ST_STATUS_LABELS[stStatus]}】`;
        });
        seaPortsGroup.addLayer(marker);
        if (!seaPortLayerMap.has(st.stKey)) seaPortLayerMap.set(st.stKey, []);
        seaPortLayerMap.get(st.stKey).push(marker);
      });

      const obj = { name: rName, stations, segments };
      seaRoutes.push(obj);
      seaRouteMap.set(rName, obj);
    });

    updateSeaStats();
    renderSeaList();
  }

  function getSeaSegmentStyle(segId, rName) {
    const isRidden = !!seaUserRecords.segments[segId];
    const isSelected = rName === selectedSeaRouteName;
    if (isRidden) {
      return { color: '#4f46e5', weight: isSelected ? 5.5 : 4.0, opacity: 0.95, dashArray: null };
    } else {
      return { color: isSelected ? '#2563eb' : '#6366f1', weight: isSelected ? 3.5 : 2.0, opacity: 0.7, dashArray: '4, 6' };
    }
  }

  function getSeaPortMarkerStyle(stKey) {
    const st = seaUserRecords.ports[stKey] || 0;
    return {
      radius: st > 0 ? 5.5 : 4.0,
      fillColor: ST_STATUS_COLORS[st] || '#e0e7ff',
      fillOpacity: 0.95,
      color: '#3730a3',
      weight: st > 0 ? 2.0 : 1.2
    };
  }

  function toggleSeaSegment(segId, rName) {
    if (seaUserRecords.segments[segId]) delete seaUserRecords.segments[segId];
    else seaUserRecords.segments[segId] = true;
    selectedSeaRouteName = rName;
    saveStorage();
    seaRoutes.forEach(r => r.segments.forEach(s => s.layer.setStyle(getSeaSegmentStyle(s.id, r.name))));
    updateSeaStats();
    renderSeaList();
    renderSeaDetail(rName);
  }

  function cycleSeaPortStatus(stKey, rName) {
    const cur = seaUserRecords.ports[stKey] || 0;
    const next = (cur + 1) % 3;
    if (next === 0) delete seaUserRecords.ports[stKey];
    else seaUserRecords.ports[stKey] = next;
    saveStorage();
    (seaPortLayerMap.get(stKey) || []).forEach(m => {
      const style = getSeaPortMarkerStyle(stKey);
      m.setStyle(style);
      m.setRadius(style.radius);
    });
    updateSeaStats();
    if (rName) renderSeaDetail(rName);
  }

  function getSeaRouteState(r) {
    const total = r.segments.length;
    if (total === 0) return { state: 'UNRIDDEN', ridden: 0, total: 0 };
    const ridden = r.segments.filter(s => !!seaUserRecords.segments[s.id]).length;
    const state = ridden === 0 ? 'UNRIDDEN' : (ridden === total ? 'COMPLETE' : 'PARTIAL');
    return { state, ridden, total };
  }

  function setSeaFilter(f) {
    currentSeaFilter = f;
    document.querySelectorAll('[data-sfilter]').forEach(b => b.classList.toggle('active', b.dataset.sfilter === f));
    renderSeaList();
  }

  function updateSeaStats() {
    let total = seaRoutes.length, comp = 0;
    seaRoutes.forEach(r => { if (getSeaRouteState(r).state === 'COMPLETE') comp++; });
    const pct = total ? ((comp / total) * 100).toFixed(1) : '0.0';
    document.getElementById('sea-route-stats').textContent = `${comp} / ${total} 航路 (${pct}%)`;
    document.getElementById('sea-route-bar').style.width = `${pct}%`;

    let alight = 0, pass = 0;
    Object.values(seaUserRecords.ports).forEach(v => { if (v === 2) alight++; else if (v === 1) pass++; });
    document.getElementById('sea-port-stats').textContent = `乗下船: ${alight} / 寄港: ${pass} 港`;
  }

  function renderSeaList() {
    const listEl = document.getElementById('sea-list');
    const kw = document.getElementById('sea-search-input').value.trim();
    listEl.innerHTML = '';

    seaRoutes.filter(r => {
      const { state } = getSeaRouteState(r);
      if (currentSeaFilter !== 'ALL' && state !== currentSeaFilter) return false;
      if (kw && !r.name.includes(kw) && !r.stations.some(s => s.name.includes(kw))) return false;
      return true;
    }).forEach(r => {
      const { state, ridden, total } = getSeaRouteState(r);
      const badgeCls = state === 'COMPLETE' ? 'badge-2' : (state === 'PARTIAL' ? 'badge-3' : 'badge-0');
      const badgeTxt = state === 'COMPLETE' ? '完乗 100%' : (state === 'PARTIAL' ? `一部 ${ridden}/${total}` : `未乗 0/${total}`);
      const item = document.createElement('div');
      item.className = 'list-item' + (r.name === selectedSeaRouteName ? ' active' : '');
      item.innerHTML = `<span>⛴️ ${r.name}</span><span class="badge ${badgeCls}">${badgeTxt}</span>`;
      item.onclick = () => {
        selectedSeaRouteName = r.name;
        seaRoutes.forEach(rt => rt.segments.forEach(s => s.layer.setStyle(getSeaSegmentStyle(s.id, rt.name))));
        renderSeaList();
        renderSeaDetail(r.name);
        if (r.segments.length > 0) {
          map.fitBounds(L.featureGroup(r.segments.map(s => s.layer)).getBounds(), { padding: [40, 40] });
        }
      };
      listEl.appendChild(item);
    });
  }

  function renderSeaDetail(rName) {
    const panel = document.getElementById('sea-detail-panel');
    const r = seaRouteMap.get(rName);
    if (!r) return;
    let html = `<div class="section-title" style="margin-bottom:6px;"><span>⛴️ ${r.name}</span></div>`;
    r.stations.forEach(st => {
      const stStatus = seaUserRecords.ports[st.stKey] || 0;
      html += `
        <div class="station-row">
          <span>⚓ <strong>${st.name}</strong></span>
          <button class="st-status-btn st-btn-${stStatus}" onclick="cycleSeaPortStatus('${st.stKey}', '${r.name}')">
            港: ${ST_STATUS_LABELS[stStatus]}
          </button>
        </div>
      `;
    });
    r.segments.forEach(sg => {
      const isRidden = !!seaUserRecords.segments[sg.id];
      html += `
        <div class="segment-row ${isRidden ? 'ridden-sea' : ''}" onclick="toggleSeaSegment('${sg.id}', '${r.name}')">
          <span>🌊 ${sg.from} ⇔ ${sg.to}</span>
          <span>${isRidden ? '● 乗船済' : '○ 未乗'}</span>
        </div>
      `;
    });
    panel.innerHTML = html;
  }

  // =========================================================
  // 🚌 バス路線（BRT・連絡バス・マイバス追加）システム
  // =========================================================
  function initBusSystem() {
    busRoutesGroup.clearLayers();
    busStopsGroup.clearLayers();
    busRoutes = [];
    busRouteMap.clear();
    busStopLayerMap.clear();

    const allBusRaw = [...BUILTIN_BUS_ROUTES, ...(busUserRecords.customRoutes || [])];

    allBusRaw.forEach(raw => {
      const rName = raw.name;
      const stations = (raw.stations || []).map((s, idx) => ({
        ...s,
        idx,
        stKey: `BUSSTOP_${s.name}_${Number(s.lat).toFixed(2)}_${Number(s.lng).toFixed(2)}`
      }));

      const segments = [];
      const rawSegs = raw.segments || [];
      if (rawSegs.length === 0 && stations.length >= 2) {
        for (let i = 0; i < stations.length - 1; i++) {
          rawSegs.push({
            from: stations[i].name,
            to: stations[i + 1].name,
            path: [[stations[i].lat, stations[i].lng], [stations[i + 1].lat, stations[i + 1].lng]]
          });
        }
      }

      rawSegs.forEach(sg => {
        const segId = `BUS::${rName}::${sg.from}::${sg.to}`;
        const poly = L.polyline(sg.path, {
          renderer: busRenderer,
          pane: 'busPane',
          ...getBusSegmentStyle(segId, rName)
        });
        poly.on('click', (e) => {
          if (currentMainTab !== 'bus') return;
          L.DomEvent.stopPropagation(e);
          toggleBusSegment(segId, rName);
        });
        poly.bindTooltip(() => {
          if (currentMainTab !== 'bus') return '';
          const isRidden = !!busUserRecords.segments[segId];
          return `🚌 <strong>${rName}</strong><br>${sg.from} ⇔ ${sg.to} 【${isRidden ? '乗車済' : '未乗'}】`;
        }, { sticky: true });
        busRoutesGroup.addLayer(poly);
        segments.push({ id: segId, routeName: rName, from: sg.from, to: sg.to, layer: poly });
      });

      stations.forEach(st => {
        const marker = L.circleMarker([st.lat, st.lng], {
          renderer: busRenderer,
          pane: 'busPane',
          ...getBusStopMarkerStyle(st.stKey)
        });
        marker.on('click', (e) => {
          if (currentMainTab !== 'bus') return;
          L.DomEvent.stopPropagation(e);
          cycleBusStopStatus(st.stKey, rName);
        });
        marker.bindTooltip(() => {
          if (currentMainTab !== 'bus') return '';
          const stStatus = busUserRecords.stops[st.stKey] || 0;
          return `🚏 <strong>${st.name}</strong>（${rName}）<br>停留所ステータス: 【${stStatus}: ${ST_STATUS_LABELS[stStatus]}】`;
        });
        busStopsGroup.addLayer(marker);
        if (!busStopLayerMap.has(st.stKey)) busStopLayerMap.set(st.stKey, []);
        busStopLayerMap.get(st.stKey).push(marker);
      });

      const obj = { name: rName, stations, segments };
      busRoutes.push(obj);
      busRouteMap.set(rName, obj);
    });

    updateBusStats();
    renderBusList();
  }

  function getBusSegmentStyle(segId, rName) {
    const isRidden = !!busUserRecords.segments[segId];
    const isSelected = rName === selectedBusRouteName;
    if (isRidden) {
      return { color: '#059669', weight: isSelected ? 5.5 : 4.0, opacity: 0.95, dashArray: null };
    } else {
      return { color: isSelected ? '#2563eb' : '#10b981', weight: isSelected ? 3.5 : 2.2, opacity: 0.75, dashArray: '3, 5' };
    }
  }

  function getBusStopMarkerStyle(stKey) {
    const st = busUserRecords.stops[stKey] || 0;
    return {
      radius: st > 0 ? 5.5 : 3.8,
      fillColor: ST_STATUS_COLORS[st] || '#d1fae5',
      fillOpacity: 0.95,
      color: '#065f46',
      weight: st > 0 ? 2.0 : 1.2
    };
  }

  function toggleBusSegment(segId, rName) {
    if (busUserRecords.segments[segId]) delete busUserRecords.segments[segId];
    else busUserRecords.segments[segId] = true;
    selectedBusRouteName = rName;
    saveStorage();
    busRoutes.forEach(r => r.segments.forEach(s => s.layer.setStyle(getBusSegmentStyle(s.id, r.name))));
    updateBusStats();
    renderBusList();
    renderBusDetail(rName);
  }

  function cycleBusStopStatus(stKey, rName) {
    const cur = busUserRecords.stops[stKey] || 0;
    const next = (cur + 1) % 3;
    if (next === 0) delete busUserRecords.stops[stKey];
    else busUserRecords.stops[stKey] = next;
    saveStorage();
    (busStopLayerMap.get(stKey) || []).forEach(m => {
      const style = getBusStopMarkerStyle(stKey);
      m.setStyle(style);
      m.setRadius(style.radius);
    });
    updateBusStats();
    if (rName) renderBusDetail(rName);
  }

  // 登録されている全国の駅・空港・港・自治体から名称で座標を検索してマイバス区間を追加する
  function findLocationByName(nameQuery) {
    const q = normalizeKanji(nameQuery.replace(/駅|空港|港|バス停/g, '').trim());
    if (!q) return null;
    for (const ap of JAPAN_AIRPORTS) {
      if (normalizeKanji(ap.name).includes(q)) return { name: nameQuery, lat: ap.lat, lng: ap.lng };
    }
    for (const line of railLines) {
      for (const st of line.stations) {
        if (normalizeKanji(st.name) === q) return { name: nameQuery, lat: st.lat, lng: st.lng };
      }
    }
    for (const line of railLines) {
      for (const st of line.stations) {
        if (normalizeKanji(st.name).includes(q)) return { name: nameQuery, lat: st.lat, lng: st.lng };
      }
    }
    return null;
  }

  function addCustomBusRoute() {
    const rName = document.getElementById('custom-bus-name').value.trim() || 'マイバス路線';
    const fromName = document.getElementById('custom-bus-from').value.trim();
    const toName   = document.getElementById('custom-bus-to').value.trim();
    if (!fromName || !toName) {
      alert('乗車停留所/駅名と降車停留所/駅名を入力してください。');
      return;
    }
    const loc1 = findLocationByName(fromName);
    const loc2 = findLocationByName(toName);
    if (!loc1 || !loc2) {
      alert('指定された駅・空港・停留所の座標が見つかりませんでした（実在する鉄道駅名や空港名を入力すると自動で座標が繋がります）。');
      return;
    }

    if (!busUserRecords.customRoutes) busUserRecords.customRoutes = [];
    const newRoute = {
      name: rName,
      stations: [loc1, loc2],
      segments: [{ from: loc1.name, to: loc2.name, path: [[loc1.lat, loc1.lng], [loc2.lat, loc2.lng]] }]
    };
    busUserRecords.customRoutes.push(newRoute);
    const segId = `BUS::${rName}::${loc1.name}::${loc2.name}`;
    busUserRecords.segments[segId] = true;
    selectedBusRouteName = rName;
    saveStorage();

    initBusSystem();
    renderBusDetail(rName);
    map.fitBounds([[loc1.lat, loc1.lng], [loc2.lat, loc2.lng]], { padding: [50, 50] });
  }

  function getBusRouteState(r) {
    const total = r.segments.length;
    if (total === 0) return { state: 'UNRIDDEN', ridden: 0, total: 0 };
    const ridden = r.segments.filter(s => !!busUserRecords.segments[s.id]).length;
    const state = ridden === 0 ? 'UNRIDDEN' : (ridden === total ? 'COMPLETE' : 'PARTIAL');
    return { state, ridden, total };
  }

  function setBusFilter(f) {
    currentBusFilter = f;
    document.querySelectorAll('[data-bfilter]').forEach(b => b.classList.toggle('active', b.dataset.bfilter === f));
    renderBusList();
  }

  function updateBusStats() {
    let total = busRoutes.length, comp = 0, totalSeg = 0, riddenSeg = 0;
    busRoutes.forEach(r => {
      const st = getBusRouteState(r);
      totalSeg += st.total;
      riddenSeg += st.ridden;
      if (st.state === 'COMPLETE') comp++;
    });
    const rPct = total ? ((comp / total) * 100).toFixed(1) : '0.0';
    const sPct = totalSeg ? ((riddenSeg / totalSeg) * 100).toFixed(1) : '0.0';
    document.getElementById('bus-route-stats').textContent = `${comp} / ${total} 路線 (${rPct}%)`;
    document.getElementById('bus-route-bar').style.width = `${rPct}%`;
    document.getElementById('bus-seg-stats').textContent = `${riddenSeg} / ${totalSeg} 区間 (${sPct}%)`;
    document.getElementById('bus-seg-bar').style.width = `${sPct}%`;
  }

  function renderBusList() {
    const listEl = document.getElementById('bus-list');
    const kw = document.getElementById('bus-search-input').value.trim();
    listEl.innerHTML = '';

    busRoutes.filter(r => {
      const { state } = getBusRouteState(r);
      if (currentBusFilter !== 'ALL' && state !== currentBusFilter) return false;
      if (kw && !r.name.includes(kw) && !r.stations.some(s => s.name.includes(kw))) return false;
      return true;
    }).forEach(r => {
      const { state, ridden, total } = getBusRouteState(r);
      const badgeCls = state === 'COMPLETE' ? 'badge-2' : (state === 'PARTIAL' ? 'badge-3' : 'badge-0');
      const badgeTxt = state === 'COMPLETE' ? '完乗 100%' : (state === 'PARTIAL' ? `一部 ${ridden}/${total}` : `未乗 0/${total}`);
      const item = document.createElement('div');
      item.className = 'list-item' + (r.name === selectedBusRouteName ? ' active' : '');
      item.innerHTML = `<span>🚌 ${r.name}</span><span class="badge ${badgeCls}">${badgeTxt}</span>`;
      item.onclick = () => {
        selectedBusRouteName = r.name;
        busRoutes.forEach(rt => rt.segments.forEach(s => s.layer.setStyle(getBusSegmentStyle(s.id, rt.name))));
        renderBusList();
        renderBusDetail(r.name);
        if (r.segments.length > 0) {
          map.fitBounds(L.featureGroup(r.segments.map(s => s.layer)).getBounds(), { padding: [40, 40] });
        }
      };
      listEl.appendChild(item);
    });
  }

  function renderBusDetail(rName) {
    const panel = document.getElementById('bus-detail-panel');
    const r = busRouteMap.get(rName);
    if (!r) return;
    let html = `<div class="section-title" style="margin-bottom:6px;"><span>🚌 ${r.name}</span></div>`;
    for (let i = 0; i < r.stations.length; i++) {
      const st = r.stations[i];
      const stStatus = busUserRecords.stops[st.stKey] || 0;
      html += `
        <div class="station-row">
          <span>🚏 <strong>${st.name}</strong></span>
          <button class="st-status-btn st-btn-${stStatus}" onclick="cycleBusStopStatus('${st.stKey}', '${r.name}')">
            停留所: ${ST_STATUS_LABELS[stStatus]}
          </button>
        </div>
      `;
      if (i < r.segments.length) {
        const sg = r.segments[i];
        const isRidden = !!busUserRecords.segments[sg.id];
        html += `
          <div class="segment-row ${isRidden ? 'ridden-bus' : ''}" onclick="toggleBusSegment('${sg.id}', '${r.name}')">
            <span>↕ ${sg.from} ⇔ ${sg.to}</span>
            <span>${isRidden ? '● 乗車済' : '○ 未乗'}</span>
          </div>
        `;
      }
    }
    panel.innerHTML = html;
  }

  // 外部JSON（N09航路・N07バス）読込用共通関数
  function importCustomNetFile(event, mode) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        const list = parsed.lines || parsed.routes || [];
        if (mode === 'sea') {
          seaUserRecords.customRoutes = list;
          saveStorage();
          initSeaSystem();
          alert(`航路データ (${list.length} 件) を追加しました！`);
        }
      } catch (err) {
        alert('JSONファイルの形式が正しくありません。');
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  // =========================================================
  // 🚃 鉄道路線データ管理 ＆ 最新廃線パッチエンジン（既存機能維持）
  // =========================================================
  function getRailCacheDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('JapanRailMapCacheDB', 2);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('store')) db.createObjectStore('store');
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e);
    });
  }

  async function loadCachedDataByKey(key) {
    try {
      const db = await getRailCacheDB();
      return new Promise(resolve => {
        const tx = db.transaction('store', 'readonly');
        const req = tx.objectStore('store').get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async function saveCachedDataByKey(key, data) {
    try {
      const db = await getRailCacheDB();
      const tx = db.transaction('store', 'readwrite');
      tx.objectStore('store').put(data, key);
    } catch (e) {
      console.warn('Cache save failed:', e);
    }
  }

  function applyRecentAbolishedPatches(sourceLines) {
    const enable2024_2026 = document.getElementById('patch-2024-2026-toggle')?.checked ?? true;
    const enable2027      = document.getElementById('patch-2027-scheduled-toggle')?.checked ?? false;

    const activePatches = RECENT_ABANDONED_PATCHES.filter(p => {
      if (p.group === '2024_2026') return enable2024_2026;
      if (p.group === '2027_SCHEDULED') return enable2027;
      return false;
    });

    const clonedLines = JSON.parse(JSON.stringify(sourceLines));
    if (activePatches.length === 0) return clonedLines;

    const resultLines = [];
    for (const line of clonedLines) {
      if (line.isAbandoned) {
        resultLines.push(line);
        continue;
      }
      const normName = normalizeKanji(line.name || '');
      const normLine = normalizeKanji(line.lineName || '');
      const matchedPatch = activePatches.find(p => {
        const kw1 = normalizeKanji(p.matchLineKeyword);
        const kw2 = p.altKeyword ? normalizeKanji(p.altKeyword) : null;
        return normName.includes(kw1) || normLine.includes(kw1) || (kw2 && (normName.includes(kw2) || normLine.includes(kw2)));
      });

      if (!matchedPatch) {
        resultLines.push(line);
        continue;
      }

      if (matchedPatch.type === 'FULL_LINE') {
        const oldName = line.name;
        const newName = oldName.includes('廃止') ? oldName : `${oldName}${matchedPatch.suffix}`;
        line.isAbandoned = true;
        line.endYear = matchedPatch.endYear;
        line.name = newName;
        if (Array.isArray(line.segments)) {
          line.segments.forEach(sg => {
            sg.isAbandoned = true;
            sg.endYear = matchedPatch.endYear;
            const oldSegId = `${oldName}::${sg.from}::${sg.to}`;
            const newSegId = `${newName}::${sg.from}::${sg.to}`;
            if (riddenSegments[oldSegId]) riddenSegments[newSegId] = true;
          });
        }
        resultLines.push(line);
      } else if (matchedPatch.type === 'PARTIAL_SPLIT') {
        const abSet = new Set(matchedPatch.abandonedStations);
        const boundSet = new Set(matchedPatch.boundaryStations);
        if (!Array.isArray(line.segments) || line.segments.length === 0) {
          line.segments = [];
          const sts = line.stations || [];
          for (let i = 0; i < sts.length - 1; i++) {
            line.segments.push({
              from: sts[i].name,
              to: sts[i + 1].name,
              path: [[Number(sts[i].lat), Number(sts[i].lng)], [Number(sts[i + 1].lat), Number(sts[i + 1].lng)]]
            });
          }
        }
        const activeSegments = [], abandonedSegments = [];
        for (const sg of line.segments) {
          const fromAb = abSet.has(sg.from), toAb = abSet.has(sg.to);
          const bothBound = boundSet.has(sg.from) && boundSet.has(sg.to);
          if (fromAb || toAb || bothBound) {
            abandonedSegments.push({ ...sg, isAbandoned: true, endYear: matchedPatch.endYear });
          } else {
            activeSegments.push({ ...sg, isAbandoned: false });
          }
        }
        if (activeSegments.length > 0) {
          resultLines.push({
            ...line,
            isAbandoned: false,
            stations: (line.stations || []).filter(s => !abSet.has(s.name)),
            segments: activeSegments
          });
        }
        if (abandonedSegments.length > 0) {
          const oldName = line.name;
          const abLineName = `${oldName}${matchedPatch.suffix}`;
          const abStations = (line.stations || []).filter(s => abSet.has(s.name) || boundSet.has(s.name));
          abandonedSegments.forEach(sg => {
            const oldSegId = `${oldName}::${sg.from}::${sg.to}`;
            const newSegId = `${abLineName}::${sg.from}::${sg.to}`;
            if (riddenSegments[oldSegId]) riddenSegments[newSegId] = true;
          });
          resultLines.push({
            ...line,
            id: `${line.id || line.name}_patch_${matchedPatch.endYear}`,
            name: abLineName,
            isAbandoned: true,
            endYear: matchedPatch.endYear,
            stations: abStations,
            segments: abandonedSegments
          });
        }
      }
    }
    return resultLines;
  }

  function reapplyRailPatches() {
    if (!baseRawRailLines || baseRawRailLines.length === 0) return;
    const patched = applyRecentAbolishedPatches(baseRawRailLines);
    buildRailwayLayers(patched, isCurrentN05Mode);
    updateRailStats();
    renderRailLineList();
    if (selectedRailLineName && railLineMap.has(selectedRailLineName)) renderRailDetail(selectedRailLineName);
  }

  // rail_master_n05.json の中身に都道府県を付与し、キャッシュ保存して描画する（手動読込・自動取得で共通）
  async function applyN05MasterData(parsed) {
    parsed.lines.forEach(line => {
      const prefs = new Set();
      (line.stations || []).forEach(st => {
        const code = findMunicipalityCodeByLatLng(st.lat, st.lng);
        const muni = code ? muniLookup.get(code) : null;
        if (muni?.pref) prefs.add(muni.pref);
      });
      line.prefs = Array.from(prefs);
    });
    await saveCachedDataByKey('n05_master_v1', parsed.lines);
    baseRawRailLines = parsed.lines;
    isCurrentN05Mode = true;
    const patched = applyRecentAbolishedPatches(baseRawRailLines);
    buildRailwayLayers(patched, true);
    updateRailStats();
    renderRailLineList();
  }

  function importN05MasterFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const overlay = document.getElementById('loading-overlay');
    overlay.style.display = 'flex';
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        await applyN05MasterData(JSON.parse(e.target.result));
        overlay.style.display = 'none';
        alert('N05高精細データの読み込みが完了しました！');
      } catch (err) {
        overlay.style.display = 'none';
        alert('読み込みエラー: ' + err.message);
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  async function initRailwaySystem() {
    const overlay = document.getElementById('loading-overlay');
    overlay.style.display = 'flex';
    try {
      const n05Lines = await loadCachedDataByKey('n05_master_v1');
      if (n05Lines && n05Lines.length > 0) {
        baseRawRailLines = n05Lines;
        isCurrentN05Mode = true;
        buildRailwayLayers(applyRecentAbolishedPatches(baseRawRailLines), true);
        updateRailStats();
        renderRailLineList();
        overlay.style.display = 'none';
        return;
      }
      let rawLines = await loadCachedDataByKey('all_lines_v1');
      if (rawLines) {
        baseRawRailLines = rawLines;
        isCurrentN05Mode = false;
        buildRailwayLayers(applyRecentAbolishedPatches(baseRawRailLines), false);
        updateRailStats();
        renderRailLineList();
      } else if (location.protocol !== 'file:') {
        // サーバー配信時：端末にキャッシュが無ければ同じサーバーの rail_master_n05.json を自動取得（初回のみ約10MB）
        // ※N05は再配布不可のためGitHub Pagesには置かない。そこでは404になり、従来どおり手動読込に任せる
        const sub = document.getElementById('loading-sub');
        const prevSub = sub.textContent;
        sub.textContent = '（初回のみ鉄道データ 約10MB をダウンロードしています）';
        try {
          const res = await fetch('rail_master_n05.json');
          if (res.ok) await applyN05MasterData(await res.json());
        } finally {
          sub.textContent = prevSub;
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      overlay.style.display = 'none';
    }
  }

  function getStationKey(stName, lat, lng) {
    return `${stName}_${lat.toFixed(3)}_${lng.toFixed(3)}`;
  }

  function makeSegPairKey(comp, lineName, stA, stB) {
    const pair = [stA, stB].sort().join('__');
    return `${comp || ''}::${lineName || ''}::${pair}`;
  }

  function buildRailwayLayers(rawLines, isN05Mode = false) {
    railActiveGroup.clearLayers();
    railAbandonedGroup.clearLayers();
    railStationsGroup.clearLayers();
    railLines = [];
    railLineMap.clear();
    stationLayerMap.clear();

    const modeBadge = document.getElementById('rail-data-mode-badge');
    if (isN05Mode) {
      modeBadge.textContent = '★ N05実曲線＋2026最新廃線';
      modeBadge.className = 'badge badge-2';
    } else {
      modeBadge.textContent = '標準データ＋2026パッチ';
      modeBadge.className = 'badge badge-0';
    }

    const activeSegmentPairs = new Set();
    const activeStationKeys  = new Set();

    rawLines.forEach(raw => {
      if (raw.isAbandoned) return;
      const comp = raw.company || '';
      const lName = raw.lineName || raw.name;
      (raw.stations || []).forEach(s => activeStationKeys.add(getStationKey(s.name, Number(s.lat), Number(s.lng))));
      if (Array.isArray(raw.segments)) {
        raw.segments.forEach(sg => activeSegmentPairs.add(makeSegPairKey(comp, lName, sg.from, sg.to)));
      }
    });

    rawLines.forEach(raw => {
      const lineName = raw.name;
      const comp = raw.company || '';
      const baseLName = raw.lineName || raw.name;
      const isAbandoned = !!raw.isAbandoned;
      const endYear = raw.endYear || (isAbandoned ? 2000 : 9999);

      const stations = (raw.stations || []).map((s, idx) => ({
        ...s,
        idx,
        stKey: getStationKey(s.name, Number(s.lat), Number(s.lng))
      }));

      const nameToStation = new Map();
      stations.forEach(s => { if (!nameToStation.has(s.name)) nameToStation.set(s.name, s); });

      const segments = [];
      const usedStationNamesInLine = new Set();

      if (Array.isArray(raw.segments) && raw.segments.length > 0) {
        raw.segments.forEach(sg => {
          const pairKey = makeSegPairKey(comp, baseLName, sg.from, sg.to);
          const isSegAbandoned = sg.isAbandoned !== undefined ? !!sg.isAbandoned : isAbandoned;
          if (isSegAbandoned && activeSegmentPairs.has(pairKey)) return;

          const fromSt = nameToStation.get(sg.from) || { name: sg.from, lat: sg.path[0][0], lng: sg.path[0][1] };
          const toSt   = nameToStation.get(sg.to)   || { name: sg.to,   lat: sg.path[sg.path.length - 1][0], lng: sg.path[sg.path.length - 1][1] };
          const segId  = `${lineName}::${fromSt.name}::${toSt.name}`;

          usedStationNamesInLine.add(fromSt.name);
          usedStationNamesInLine.add(toSt.name);

          const targetGroup    = isSegAbandoned ? railAbandonedGroup : railActiveGroup;
          const targetRenderer = isSegAbandoned ? railAbandonedRenderer : railActiveRenderer;
          const targetPane     = isSegAbandoned ? 'railAbandonedPane' : 'railActivePane';

          const poly = L.polyline(sg.path, {
            renderer: targetRenderer,
            pane: targetPane,
            smoothFactor: 0.4,
            ...getRailSegmentStyle(segId, lineName, isSegAbandoned)
          });

          poly.on('click', (e) => {
            if (currentMainTab !== 'rail') return;
            L.DomEvent.stopPropagation(e);
            onMapRailSegmentClick(segId, lineName);
          });

          poly.bindTooltip(() => {
            if (currentMainTab !== 'rail') return '';
            const isRidden = !!riddenSegments[segId];
            const dispLineName = getLineDisplayName(railLineMap.get(lineName)) || lineName;
            const eraTag = isSegAbandoned ? `<span style="color:#d97706;">[廃線 〜${sg.endYear || endYear}]</span> ` : `<span style="color:#0284c7;">[現役]</span> `;
            return `🚃 ${eraTag}<strong>${dispLineName}</strong><br>${fromSt.name} ⇔ ${toSt.name} 【${isRidden ? '乗車済' : '未乗'}】`;
          }, { sticky: true });

          targetGroup.addLayer(poly);
          segments.push({ id: segId, lineName, isAbandoned: isSegAbandoned, fromSt, toSt, layer: poly });
        });
      }

      if (segments.length === 0) return;

      const validStations = stations.filter(st => usedStationNamesInLine.has(st.name));
      const finalStations = validStations.length > 0 ? validStations : stations;

      finalStations.forEach(st => {
        const isStAbandoned = isAbandoned && !activeStationKeys.has(st.stKey);
        const targetRenderer = isStAbandoned ? railAbandonedRenderer : railActiveRenderer;
        const targetPane     = isStAbandoned ? 'railAbandonedPane' : 'railActivePane';

        const marker = L.circleMarker([st.lat, st.lng], {
          renderer: targetRenderer,
          pane: targetPane,
          ...getStationMarkerStyle(st.stKey, isStAbandoned)
        });

        marker.on('click', (e) => {
          if (currentMainTab !== 'rail') return;
          L.DomEvent.stopPropagation(e);
          cycleStationStatus(st.stKey, lineName);
        });

        marker.bindTooltip(() => {
          if (currentMainTab !== 'rail') return '';
          const stStatus = stationRecords[st.stKey] || 0;
          const dispLineName = getLineDisplayName(railLineMap.get(lineName)) || lineName;
          return `🚉 <strong>${st.name}駅</strong>（${dispLineName}）<br>駅ステータス: 【${stStatus}: ${ST_STATUS_LABELS[stStatus]}】`;
        });
        railStationsGroup.addLayer(marker);
        if (!stationLayerMap.has(st.stKey)) stationLayerMap.set(st.stKey, []);
        stationLayerMap.get(st.stKey).push({ marker, isAbandoned: isStAbandoned });
      });

      const lineObj = { name: lineName, company: comp, lineName: baseLName, isAbandoned, endYear, prefs: new Set(raw.prefs || []), stations: finalStations, segments };
      enrichLineWithPassengerName(lineObj, comp, baseLName);
      railLines.push(lineObj);
      railLineMap.set(lineName, lineObj);
    });

    railLines.sort((a, b) => {
      if (a.isAbandoned !== b.isAbandoned) return a.isAbandoned ? 1 : -1;
      return a.name.localeCompare(b.name, 'ja');
    });
  }

  function getRailSegmentStyle(segId, lineName, isAbandoned = false) {
    const isRidden = !!riddenSegments[segId];
    const isSelectedLine = lineName === selectedRailLineName;
    if (isAbandoned) {
      return isRidden
        ? { color: '#d97706', weight: isSelectedLine ? 6.0 : 4.2, opacity: 0.95, dashArray: null }
        : { color: isSelectedLine ? '#2563eb' : '#a16207', weight: isSelectedLine ? 4.0 : 2.2, opacity: 0.7, dashArray: '2, 5' };
    } else {
      return isRidden
        ? { color: '#e11d48', weight: isSelectedLine ? 6.0 : 4.2, opacity: 0.95, dashArray: null }
        : { color: isSelectedLine ? '#2563eb' : '#475569', weight: isSelectedLine ? 4.0 : 2.4, opacity: 0.75, dashArray: '5, 5' };
    }
  }

  function getStationMarkerStyle(stKey, isAbandoned = false) {
    const stStatus = stationRecords[stKey] || 0;
    return {
      radius: stStatus > 0 ? 5.5 : (isAbandoned ? 3.3 : 4.0),
      fillColor: ST_STATUS_COLORS[stStatus] || (isAbandoned ? '#fef3c7' : '#ffffff'),
      fillOpacity: 0.95,
      color: stStatus === 2 ? '#9a3412' : (isAbandoned ? '#92400e' : '#334155'),
      weight: stStatus > 0 ? 2.0 : 1.2
    };
  }

// ▼ updateAllRailStyles 関数を以下に差し替え ▼
  function updateAllRailStyles() {
    // 1. まず廃線のスタイルを更新
    railLines.forEach(line => {
      if (!line.isAbandoned) return;
      line.segments.forEach(seg => seg.layer.setStyle(getRailSegmentStyle(seg.id, line.name, seg.isAbandoned)));
    });
    // 2. 次に現役路線のスタイルを更新し、必ず廃線より前面（上）に持ってくる
    railLines.forEach(line => {
      if (line.isAbandoned) return;
      line.segments.forEach(seg => {
        seg.layer.setStyle(getRailSegmentStyle(seg.id, line.name, seg.isAbandoned));
        seg.layer.bringToFront();
      });
    });
    // 3. 選択中の路線があれば最前面へ
    if (selectedRailLineName && railLineMap.has(selectedRailLineName)) {
      railLineMap.get(selectedRailLineName).segments.forEach(seg => seg.layer.bringToFront());
    }
    // 4. 駅マーカーを最前面へ
    for (const [stKey, list] of stationLayerMap.entries()) {
      list.forEach(({ marker, isAbandoned }) => {
        const style = getStationMarkerStyle(stKey, isAbandoned);
        marker.setStyle(style);
        marker.setRadius(style.radius);
        marker.bringToFront();
      });
    }
  }

  function onMapRailSegmentClick(segId, lineName) {
    if (currentMainTab !== 'rail') return;
    if (document.getElementById('map-seg-direct-toggle').checked) {
      if (riddenSegments[segId]) delete riddenSegments[segId];
      else riddenSegments[segId] = true;
      saveStorage();
    }
    selectedRailLineName = lineName;
    mapLockedLineName = lineName;
    document.getElementById('rail-lock-banner').style.display = 'flex';
    const dispLineName = getLineDisplayName(railLineMap.get(lineName)) || lineName;
    document.getElementById('rail-lock-text').textContent = `🎯 路線絞り込み中: ${dispLineName}`;
    updateAllRailStyles();
    updateRailStats();
    renderRailLineList();
    renderRailDetail(lineName, segId);
  }

  function toggleRailSegmentFromList(segId, lineName) {
    if (riddenSegments[segId]) delete riddenSegments[segId];
    else riddenSegments[segId] = true;
    saveStorage();
    const line = railLineMap.get(lineName);
    if (line) {
      const seg = line.segments.find(s => s.id === segId);
      if (seg) seg.layer.setStyle(getRailSegmentStyle(seg.id, lineName, seg.isAbandoned));
    }
    selectedRailLineName = lineName;
    updateRailStats();
    renderRailLineList();
    renderRailDetail(lineName, segId);
  }

  function clearMapLineLock() {
    mapLockedLineName = null;
    document.getElementById('rail-lock-banner').style.display = 'none';
    renderRailLineList();
  }

  function onRailSearchInput() {
    if (mapLockedLineName) clearMapLineLock();
    else renderRailLineList();
  }

  function cycleStationStatus(stKey, lineName = null) {
    if (currentMainTab !== 'rail') return;
    const current = stationRecords[stKey] || 0;
    const next = (current + 1) % 3;
    if (next === 0) delete stationRecords[stKey];
    else stationRecords[stKey] = next;
    saveStorage();
    (stationLayerMap.get(stKey) || []).forEach(({ marker, isAbandoned }) => {
      const style = getStationMarkerStyle(stKey, isAbandoned);
      marker.setStyle(style);
      marker.setRadius(style.radius);
    });
    updateRailStats();
    if (selectedRailLineName) renderRailDetail(selectedRailLineName);
  }

  function getLineRideState(line) {
    const total = line.segments.length;
    if (total === 0) return { state: 'UNRIDDEN', ridden: 0, total: 0 };
    let ridden = 0;
    for (const seg of line.segments) if (riddenSegments[seg.id]) ridden++;
    return { state: ridden === 0 ? 'UNRIDDEN' : (ridden === total ? 'COMPLETE' : 'PARTIAL'), ridden, total };
  }

  function setRailEraFilter(eraType) {
    currentRailEraFilter = eraType;
    mapLockedLineName = null;
    document.getElementById('rail-lock-banner').style.display = 'none';
    document.querySelectorAll('[data-efilter]').forEach(btn => btn.classList.toggle('era-active', btn.dataset.efilter === eraType));
    updateRailStats();
    renderRailLineList();
  }

  function setRailFilter(filterType) {
    currentRailFilter = filterType;
    mapLockedLineName = null;
    document.getElementById('rail-lock-banner').style.display = 'none';
    document.querySelectorAll('[data-rfilter]').forEach(btn => btn.classList.toggle('active', btn.dataset.rfilter === filterType));
    renderRailLineList();
  }

  function renderRailLineList() {
    const listEl = document.getElementById('rail-line-list');
    const pref = document.getElementById('rail-pref-select').value;
    const kw = normalizeKanji(document.getElementById('rail-search-input').value.trim());

    const filtered = railLines.filter(line => {
      if (mapLockedLineName) return line.name === mapLockedLineName;
      if (currentRailEraFilter === 'ACTIVE' && line.isAbandoned) return false;
      if (currentRailEraFilter === 'ABANDONED' && !line.isAbandoned) return false;
      if (pref !== 'ALL' && line.prefs.size > 0 && !line.prefs.has(pref)) return false;
      const { state } = getLineRideState(line);
      if (currentRailFilter !== 'ALL' && state !== currentRailFilter) return false;
      // 正式名称・旅客案内名・別名（埼京線/赤羽線、学園都市線/札沼線など）のどれでもヒット！
      if (kw && !(line.searchText || normalizeKanji(line.name)).includes(kw) && !line.stations.some(s => normalizeKanji(s.name).includes(kw))) return false;
      return true;
    });

    // 現在選択中の表記モードの表示名で綺麗にソート
    filtered.sort((a, b) => {
      if (a.isAbandoned !== b.isAbandoned) return a.isAbandoned ? 1 : -1;
      return getLineDisplayName(a).localeCompare(getLineDisplayName(b), 'ja');
    });

    document.getElementById('rail-filtered-count').textContent = `${filtered.length} 路線`;
    listEl.innerHTML = '';

    filtered.slice(0, 350).forEach(line => {
      const { state, ridden, total } = getLineRideState(line);
      const pct = total ? Math.round((ridden / total) * 100) : 0;
      const badgeClass = state === 'COMPLETE' ? 'badge-2' : (state === 'PARTIAL' ? 'badge-3' : 'badge-0');
      const badgeText  = state === 'COMPLETE' ? `完乗 100%` : (state === 'PARTIAL' ? `一部 ${ridden}/${total} (${pct}%)` : `未乗 0/${total}`);
      const eraBadge   = line.isAbandoned ? `<span class="badge badge-abandoned">廃線</span> ` : '';
      const dispName   = getLineDisplayName(line);

      const item = document.createElement('div');
      item.className = 'list-item' + (line.isAbandoned ? ' abandoned-item' : '') + (line.name === selectedRailLineName ? ' active' : '');
      item.innerHTML = `<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${dispName}">${eraBadge}${dispName}</span><span class="badge ${badgeClass}">${badgeText}</span>`;
      item.onclick = () => selectRailLine(line.name, true);
      listEl.appendChild(item);
    });
  }

  function selectRailLine(lineName, zoomTo = false) {
    selectedRailLineName = lineName;
    const line = railLineMap.get(lineName);
    if (!line) return;
    updateAllRailStyles();
    renderRailLineList();
    renderRailDetail(lineName);
    if (zoomTo && line.segments.length > 0) {
      map.fitBounds(L.featureGroup(line.segments.map(s => s.layer)).getBounds(), { maxZoom: 12, padding: [30, 30] });
    }
  }

  function renderRailDetail(lineName, highlightSegId = null) {
    const panel = document.getElementById('rail-detail-panel');
    const line = railLineMap.get(lineName);
    if (!line) return;
    const { ridden, total } = getLineRideState(line);
    const pct = total ? ((ridden / total) * 100).toFixed(1) : '0.0';
    const stOptions = line.stations.map((s, i) => `<option value="${i}">${s.name}駅</option>`).join('');
    const lastIdx = Math.max(0, line.stations.length - 1);
    const eraLabel = line.isAbandoned ? `<span class="badge badge-abandoned">🕰️ 廃線 (〜${line.endYear})</span>` : `<span class="badge badge-1">現役</span>`;

    let html = `
      <div class="section-title" style="margin-bottom:6px;">
        <span style="font-size:12px; color:#0f172a;">${eraLabel} ${getLineDisplayName(line)}</span>
        <span style="color:#e11d48; white-space:nowrap;">${ridden}/${total} (${pct}%)</span>
      </div>
      <div class="range-fill-box" style="${line.isAbandoned ? 'background:#fefce8; border-color:#fde68a;' : ''}">
        <div style="font-size:11px; font-weight:bold; color:${line.isAbandoned ? '#92400e' : '#9f1239'}; margin-bottom:4px;">指定した駅間の区間を一括変更（支線分岐も自動経路探索）</div>
        <div class="range-select-row">
          <select id="range-start-st">${stOptions}</select><span>〜</span><select id="range-end-st">${stOptions}</select>
        </div>
        <div class="btn-row">
          <button class="btn ${line.isAbandoned ? 'btn-n05' : 'btn-rail'}" onclick="applySegmentRange('${line.name}', true)">選択区間を「乗車済」</button>
          <button class="btn" onclick="applySegmentRange('${line.name}', false)">「未乗」に戻す</button>
        </div>
        <div class="btn-row" style="margin-top:4px;">
          <button class="btn" style="background:#ffe4e6; color:#9f1239;" onclick="setAllLineSegments('${line.name}', true)">★ この路線を全区間「完乗」にする</button>
        </div>
      </div>
    `;

    const renderedSegIds = new Set();

    // 1. まず駅の順番に沿って駅と隣接区間を表示
    for (let i = 0; i < line.stations.length; i++) {
      const st = line.stations[i];
      const stStatus = stationRecords[st.stKey] || 0;
      html += `
        <div class="station-row">
          <span>🚉 <strong>${st.name}</strong></span>
          <button class="st-status-btn st-btn-${stStatus}" onclick="cycleStationStatus('${st.stKey}', '${line.name}')">駅: ${ST_STATUS_LABELS[stStatus]}</button>
        </div>
      `;
      if (i + 1 < line.stations.length) {
        const nextSt = line.stations[i + 1];
        const seg = line.segments.find(sg =>
          (sg.fromSt.name === st.name && sg.toSt.name === nextSt.name) ||
          (sg.fromSt.name === nextSt.name && sg.toSt.name === st.name)
        );
        if (seg) {
          renderedSegIds.add(seg.id);
          const isRidden = !!riddenSegments[seg.id];
          const isClicked = seg.id === highlightSegId;
          const riddenClass = isRidden ? (seg.isAbandoned ? 'ridden-abandoned' : 'ridden') : (seg.isAbandoned ? 'abandoned-seg' : '');
          html += `
            <div class="segment-row ${riddenClass} ${isClicked ? 'just-clicked' : ''}" onclick="toggleRailSegmentFromList('${seg.id}', '${line.name}')">
              <span>↕ ${st.name} ⇔ ${nextSt.name}</span><span>${isRidden ? '● 乗車済' : '○ 未乗'}</span>
            </div>
          `;
        }
      }
    }

    // 2. 分岐する支線の区間（浅野⇔新芝浦、安善⇔大川、尻手⇔八丁畷など）で未表示のものをすべて表示！
    const branchSegs = line.segments.filter(sg => !renderedSegIds.has(sg.id));
    if (branchSegs.length > 0) {
      html += `<div style="margin:8px 0 4px; font-size:11px; font-weight:bold; color:#475569;">🔀 分岐・支線区間</div>`;
      branchSegs.forEach(seg => {
        const isRidden = !!riddenSegments[seg.id];
        const isClicked = seg.id === highlightSegId;
        const riddenClass = isRidden ? (seg.isAbandoned ? 'ridden-abandoned' : 'ridden') : (seg.isAbandoned ? 'abandoned-seg' : '');
        html += `
          <div class="segment-row ${riddenClass} ${isClicked ? 'just-clicked' : ''}" onclick="toggleRailSegmentFromList('${seg.id}', '${line.name}')">
            <span>↳ ${seg.fromSt.name} ⇔ ${seg.toSt.name}</span><span>${isRidden ? '● 乗車済' : '○ 未乗'}</span>
          </div>
        `;
      });
    }

    panel.innerHTML = html;
    const endSel = document.getElementById('range-end-st');
    if (endSel) endSel.value = String(lastIdx);

    if (highlightSegId) {
      const targetEl = panel.querySelector('.just-clicked');
      if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function applySegmentRange(lineName, toRidden) {
    const line = railLineMap.get(lineName);
    if (!line) return;
    const idxA = Number(document.getElementById('range-start-st').value);
    const idxB = Number(document.getElementById('range-end-st').value);
    const startName = line.stations[idxA]?.name;
    const endName   = line.stations[idxB]?.name;
    if (!startName || !endName) return;

    // 駅間の接続グラフからBFS（幅優先探索）で始発駅〜終着駅の正確な経路に含まれる区間だけを特定する（支線巻き込み防止）
    const adj = new Map();
    line.segments.forEach(seg => {
      const u = seg.fromSt.name, v = seg.toSt.name;
      if (!adj.has(u)) adj.set(u, []);
      if (!adj.has(v)) adj.set(v, []);
      adj.get(u).push({ to: v, seg });
      adj.get(v).push({ to: u, seg });
    });

    const queue = [startName];
    const parentSeg = new Map();
    const visited = new Set([startName]);
    let found = false;

    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur === endName) { found = true; break; }
      for (const edge of (adj.get(cur) || [])) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          parentSeg.set(edge.to, { prevSt: cur, seg: edge.seg });
          queue.push(edge.to);
        }
      }
    }

    if (found) {
      let curr = endName;
      while (curr !== startName) {
        const step = parentSeg.get(curr);
        if (!step) break;
        if (toRidden) riddenSegments[step.seg.id] = true;
        else delete riddenSegments[step.seg.id];
        step.seg.layer.setStyle(getRailSegmentStyle(step.seg.id, lineName, step.seg.isAbandoned));
        curr = step.prevSt;
      }
    } else {
      // 万が一グラフが離れている場合はインデックス範囲でフォールバック
      const targetNames = new Set(line.stations.slice(Math.min(idxA, idxB), Math.max(idxA, idxB) + 1).map(s => s.name));
      line.segments.forEach(seg => {
        if (targetNames.has(seg.fromSt.name) && targetNames.has(seg.toSt.name)) {
          if (toRidden) riddenSegments[seg.id] = true;
          else delete riddenSegments[seg.id];
          seg.layer.setStyle(getRailSegmentStyle(seg.id, lineName, seg.isAbandoned));
        }
      });
    }

    saveStorage();
    updateRailStats();
    renderRailLineList();
    renderRailDetail(lineName);
  }

  function setAllLineSegments(lineName, toRidden) {
    const line = railLineMap.get(lineName);
    if (!line) return;
    line.segments.forEach(seg => {
      if (toRidden) riddenSegments[seg.id] = true;
      else delete riddenSegments[seg.id];
      seg.layer.setStyle(getRailSegmentStyle(seg.id, lineName, seg.isAbandoned));
    });
    saveStorage();
    updateRailStats();
    renderRailLineList();
    renderRailDetail(lineName);
  }

  function updateRailStats() {
    const targetLines = railLines.filter(line => {
      if (currentRailEraFilter === 'ACTIVE') return !line.isAbandoned;
      if (currentRailEraFilter === 'ABANDONED') return line.isAbandoned;
      return true;
    });
    let totalLines = targetLines.length, completeLines = 0, partialLines = 0, totalSegs = 0, riddenSegs = 0;
    targetLines.forEach(line => {
      const { state, ridden, total } = getLineRideState(line);
      totalSegs += total; riddenSegs += ridden;
      if (state === 'COMPLETE') completeLines++;
      else if (state === 'PARTIAL') partialLines++;
    });
    const linePct = totalLines ? ((completeLines / totalLines) * 100).toFixed(1) : '0.0';
    document.getElementById('rail-line-stats').textContent = `${completeLines} / ${totalLines} 路線 (一部: ${partialLines})`;
    document.getElementById('rail-line-bar').style.width = `${linePct}%`;
    const segPct = totalSegs ? ((riddenSegs / totalSegs) * 100).toFixed(1) : '0.0';
    document.getElementById('rail-seg-stats').textContent = `${riddenSegs} / ${totalSegs} 区間 (${segPct}%)`;
    document.getElementById('rail-seg-bar').style.width = `${segPct}%`;

    let alightCount = 0, passStCount = 0;
    Object.values(stationRecords).forEach(v => { if (v === 2) alightCount++; else if (v === 1) passStCount++; });
    document.getElementById('rail-station-stats').textContent = `乗降: ${alightCount} / 通過: ${passStCount} 駅`;
  }

  // =========================================================
  // 🏙️ 市区町村データ読み込み・描画
  // =========================================================
  async function fetchTopoJsonWithFallback(resKey) {
    const urls = TOPOJSON_SOURCES[resKey] || TOPOJSON_SOURCES.s0010;
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.ok) return await res.json();
      } catch {}
    }
    throw new Error('TopoJSON load failed');
  }

  function registerSpatialFeature(code, geometry) {
    if (!geometry) return;
    const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : (geometry.type === 'MultiPolygon' ? geometry.coordinates : []);
    for (const rings of polys) {
      if (!rings || !rings[0] || rings[0].length === 0) continue;
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      for (const pt of rings[0]) {
        const lng = pt[0], lat = pt[1];
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
      }
      spatialPolygons.push({ code, minLat, maxLat, minLng, maxLng, rings });
    }
  }

  async function loadMapData(resKey = 's0010', isReload = false) {
    const overlay = document.getElementById('loading-overlay');
    overlay.style.display = 'flex';
    try {
      const topoData = await fetchTopoJsonWithFallback(resKey);
      const objName = Object.keys(topoData.objects)[0];
      const geoData = topojson.feature(topoData, topoData.objects[objName]);
      if (geojsonLayer) map.removeLayer(geojsonLayer);

      const prefSet = new Set();
      muniLookup.clear();
      spatialPolygons = [];

      geojsonLayer = L.geoJSON(geoData, {
        renderer: muniRenderer,
        pane: 'muniPane',
        style: () => ({ smoothFactor: 0.3 }),
        onEachFeature: (feature, layer) => {
          layer.options.smoothFactor = 0.3;
          const p = feature.properties || {};
          const code = p.N03_007;
          if (!code) return;
          registerSpatialFeature(code, feature.geometry);
          const pref = p.N03_001 || '', city = p.N03_003 || '', ward = p.N03_004 || '';
          const isDesignatedWard = city.endsWith('市') && ward.endsWith('区');
          const name = isDesignatedWard ? `${city}${ward}` : (ward || city);
          if (pref) prefSet.add(pref);

          if (!muniLookup.has(code)) {
            muniLookup.set(code, { code, pref, name, parentCity: isDesignatedWard ? `${pref}${city}` : null, layers: [layer] });
          } else {
            muniLookup.get(code).layers.push(layer);
          }

          layer.on('click', (e) => {
            if (currentMainTab !== 'muni') return;
            L.DomEvent.stopPropagation(e);
            onMapPolygonClick(code);
          });
          layer.bindTooltip(() => {
            if (currentMainTab !== 'muni') return '';
            const st = userRecords[code]?.status || 0;
            return `${pref} ${name} 【${st}: ${STATUS_LABELS[st]}】`;
          }, { sticky: true });
        }
      }).addTo(map);

      municipalities = Array.from(muniLookup.values()).sort((a, b) => a.code.localeCompare(b.code));
      updateAllStyles();

      if (!isReload) {
        const prefSelect = document.getElementById('pref-select');
        Array.from(prefSet).forEach(pref => {
          const opt = document.createElement('option');
          opt.value = pref; opt.textContent = pref;
          prefSelect.appendChild(opt);
        });
      }
      updateStats();
      renderList();
    } catch (err) {
      console.error(err);
    } finally {
      overlay.style.display = 'none';
    }
  }

  function onMapPolygonClick(code) {
    if (currentMainTab !== 'muni') return;
    if (document.getElementById('cycle-click-toggle').checked) {
      const currentStatus = userRecords[code]?.status || 0;
      selectedCode = code;
      setStatus((currentStatus + 1) % (MAX_STATUS + 1));
      selectMunicipality(code, false);
    } else {
      selectMunicipality(code, false);
    }
  }

  function getEffectiveStatus(muni) {
    if (!document.getElementById('merge-designated-toggle').checked || !muni.parentCity) {
      return userRecords[muni.code]?.status || 0;
    }
    let maxStatus = 0;
    for (const m of municipalities) {
      if (m.parentCity === muni.parentCity) {
        const s = userRecords[m.code]?.status || 0;
        if (s > maxStatus) maxStatus = s;
      }
    }
    return maxStatus;
  }

  function getFeatureStyle(feature) {
    const code = feature.properties?.N03_007;
    const muni = muniLookup.get(code);
    const status = muni ? getEffectiveStatus(muni) : (userRecords[code]?.status || 0);
    const isSelected = code === selectedCode;
    const strongBorder = document.getElementById('strong-border-toggle')?.checked;
    return {
      smoothFactor: 0.3,
      fillColor: STATUS_COLORS[status] || 'transparent',
      fillOpacity: status === 0 ? 0.02 : fillOpacitySetting,
      color: isSelected ? '#dc2626' : (strongBorder ? '#334155' : '#94a3b8'),
      weight: isSelected ? 3.0 : (strongBorder ? 1.1 : 0.5),
      dashArray: (!isSelected && status === 0 && strongBorder) ? '3, 3' : null
    };
  }

  function updateAllStyles() {
    if (geojsonLayer) geojsonLayer.setStyle(feature => getFeatureStyle(feature));
  }

  function selectMunicipality(code, zoomTo = false) {
    selectedCode = code;
    const muni = muniLookup.get(code);
    if (!muni) return;
    document.getElementById('selected-name').textContent = `${muni.pref} ${muni.name}`;
    document.getElementById('selected-code').textContent = `コード: ${muni.code}`;
    const rec = userRecords[code] || { status: 0, date: '', memo: '' };
    document.getElementById('visit-date').disabled = false;
    document.getElementById('visit-memo').disabled = false;
    document.getElementById('open-gmap-btn').disabled = false;
    document.getElementById('visit-date').value = rec.date || '';
    document.getElementById('visit-memo').value = rec.memo || '';
    updateStatusButtons(rec.status || 0);
    updateAllStyles();
    renderList();
    if (zoomTo && muni.layers.length > 0) {
      map.fitBounds(L.featureGroup(muni.layers).getBounds(), { maxZoom: 12, padding: [40, 40] });
    }
  }

  function openInGoogleMaps() {
    if (!selectedCode) return;
    const muni = muniLookup.get(selectedCode);
    if (muni) window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(muni.pref + muni.name)}`, '_blank');
  }

  function updateStatusButtons(activeStatus) {
    document.querySelectorAll('.status-btn').forEach(btn => {
      const s = Number(btn.dataset.status);
      btn.className = 'status-btn' + (s === activeStatus ? ` active-${s}` : '');
    });
  }

  function setStatus(status) {
    if (!selectedCode) return;
    if (!userRecords[selectedCode]) userRecords[selectedCode] = { status: 0, date: '', memo: '' };
    userRecords[selectedCode].status = status;
    if (status > 0 && !userRecords[selectedCode].date) {
      const today = new Date().toISOString().split('T')[0];
      userRecords[selectedCode].date = today;
      document.getElementById('visit-date').value = today;
    }
    saveStorage();
    updateStatusButtons(status);
    updateAllStyles();
    updateStats();
    renderList();
  }

  function saveCurrentDetails() {
    if (!selectedCode) return;
    if (!userRecords[selectedCode]) userRecords[selectedCode] = { status: 0, date: '', memo: '' };
    userRecords[selectedCode].date = document.getElementById('visit-date').value;
    userRecords[selectedCode].memo = document.getElementById('visit-memo').value;
    saveStorage();
  }

  function onFilterChange() {
    const pref = document.getElementById('pref-select').value;
    if (pref !== 'ALL') {
      const prefLayers = municipalities.filter(m => m.pref === pref).flatMap(m => m.layers);
      if (prefLayers.length > 0) map.fitBounds(L.featureGroup(prefLayers).getBounds(), { padding: [20, 20] });
    }
    updateStats();
    renderList();
  }

  function renderList() {
    const listEl = document.getElementById('muni-list');
    const pref = document.getElementById('pref-select').value;
    const keyword = document.getElementById('search-input').value.trim();
    const filtered = municipalities.filter(m => {
      if (pref !== 'ALL' && m.pref !== pref) return false;
      if (keyword && !(`${m.pref}${m.name}`).includes(keyword)) return false;
      return true;
    });
    listEl.innerHTML = '';
    filtered.slice(0, 300).forEach(m => {
      const status = getEffectiveStatus(m);
      const item = document.createElement('div');
      item.className = 'list-item' + (m.code === selectedCode ? ' active' : '');
      item.innerHTML = `<span>${pref === 'ALL' ? `<small style="color:#64748b">${m.pref}</small> ` : ''}${m.name}</span><span class="badge badge-${status}">${STATUS_LABELS[status]}</span>`;
      item.onclick = () => selectMunicipality(m.code, true);
      listEl.appendChild(item);
    });
  }

  function calcGroupStats(targetMunis) {
    if (!document.getElementById('merge-designated-toggle').checked) {
      return { visited: targetMunis.filter(m => (userRecords[m.code]?.status || 0) > 0).length, total: targetMunis.length };
    }
    const unitMap = new Map();
    targetMunis.forEach(m => {
      const key = m.parentCity || m.code;
      unitMap.set(key, Math.max(unitMap.get(key) || 0, userRecords[m.code]?.status || 0));
    });
    return { visited: Array.from(unitMap.values()).filter(s => s > 0).length, total: unitMap.size };
  }

  function updateStats() {
    const nat = calcGroupStats(municipalities);
    const natPct = nat.total ? ((nat.visited / nat.total) * 100).toFixed(1) : '0.0';
    document.getElementById('national-stats').textContent = `${nat.visited} / ${nat.total} (${natPct}%)`;
    document.getElementById('national-bar').style.width = `${natPct}%`;

    const pref = document.getElementById('pref-select').value;
    const prefTitle = document.getElementById('pref-progress-title');
    if (pref === 'ALL') {
      prefTitle.innerHTML = `<strong>都道府県別制覇率</strong>（県を選択）`;
      document.getElementById('pref-stats').textContent = `- / -`;
      document.getElementById('pref-bar').style.width = `0%`;
    } else {
      const st = calcGroupStats(municipalities.filter(m => m.pref === pref));
      const pct = st.total ? ((st.visited / st.total) * 100).toFixed(1) : '0.0';
      prefTitle.innerHTML = `<strong>${pref} 制覇率</strong>`;
      document.getElementById('pref-stats').textContent = `${st.visited} / ${st.total} (${pct}%)`;
      document.getElementById('pref-bar').style.width = `${pct}%`;
    }
  }

  // =========================================================
  // 全5タブ統合 JSONバックアップ出力・読込
  // =========================================================
  function buildBackupPayload() {
    return {
      version: 3,
      municipalities: userRecords,
      riddenSegments,
      stationRecords,
      airUserRecords,
      seaUserRecords,
      busUserRecords
    };
  }

  // バックアップJSONで全記録を上書きし、画面を再描画する（ファイル読込・クラウド取得で共通）
  function applyBackupPayload(parsed) {
    if (parsed.version >= 2 || parsed.municipalities) {
      userRecords    = parsed.municipalities || {};
      riddenSegments = parsed.riddenSegments || {};
      stationRecords = parsed.stationRecords || {};
      if (parsed.airUserRecords) airUserRecords = parsed.airUserRecords;
      if (parsed.seaUserRecords) seaUserRecords = parsed.seaUserRecords;
      if (parsed.busUserRecords) busUserRecords = parsed.busUserRecords;
    } else {
      userRecords = parsed;
    }
    saveStorage();
    updateAllStyles();
    updateAllRailStyles();
    initAirSystem();
    initSeaSystem();
    initBusSystem();
    updateStats();
    updateRailStats();
    renderList();
    renderRailLineList();
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(buildBackupPayload(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `japan_all_travel_log_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        applyBackupPayload(JSON.parse(e.target.result));
        alert('全データを読み込みました！');
      } catch {
        alert('JSONファイルの形式が正しくありません。');
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  // =========================================================
  // ☁ GitHub Gist 同期（非公開Gistに全データJSONを保存・取得）
  // =========================================================
  function saveGistToken() {
    const token = document.getElementById('gist-token-input').value.trim();
    if (token) localStorage.setItem(GIST_TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(GIST_TOKEN_STORAGE_KEY);
    updateSyncStatus();
  }

  function loadGistSyncState() {
    try {
      return JSON.parse(localStorage.getItem(GIST_SYNC_STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveGistSyncState(gist) {
    localStorage.setItem(GIST_SYNC_STORAGE_KEY, JSON.stringify({ gistId: gist.id, remoteUpdatedAt: gist.updated_at }));
  }

  function updateSyncStatus(message) {
    const el = document.getElementById('sync-status');
    if (message) {
      el.textContent = message;
      return;
    }
    const state = loadGistSyncState();
    if (!localStorage.getItem(GIST_TOKEN_STORAGE_KEY)) el.textContent = 'トークン未設定';
    else if (state.remoteUpdatedAt) el.textContent = `最終同期: ${new Date(state.remoteUpdatedAt).toLocaleString('ja-JP')}`;
    else el.textContent = 'トークン設定済（この端末ではまだ同期していません）';
  }

  async function gistApi(path, options = {}) {
    const token = localStorage.getItem(GIST_TOKEN_STORAGE_KEY);
    if (!token) throw new Error('GitHubトークンが未設定です。');
    const res = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      }
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      const err = new Error(`GitHub API ${res.status}: ${detail.message || res.statusText}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  // 同期先Gistを取得する。この端末に記録が無ければ、自分のGist一覧からファイル名で探す
  async function findSyncGist() {
    const state = loadGistSyncState();
    if (state.gistId) {
      try {
        return await gistApi(`/gists/${state.gistId}`);
      } catch (err) {
        if (err.status !== 404) throw err; // Gistが削除済みなら一覧から探し直す
      }
    }
    const list = await gistApi('/gists?per_page=100');
    const hit = list.find(g => g.files && g.files[GIST_FILE_NAME]);
    return hit ? gistApi(`/gists/${hit.id}`) : null;
  }

  async function pushToGist() {
    try {
      updateSyncStatus('☁ 保存中...');
      const remote = await findSyncGist();
      // 最後に保存した方が勝つため、この端末の最終同期より後に別端末で保存されていたら確認する
      if (remote && remote.updated_at !== loadGistSyncState().remoteUpdatedAt &&
          !confirm(`クラウドには、この端末が最後に同期した後の保存があります（${new Date(remote.updated_at).toLocaleString('ja-JP')}）。\nこの端末の記録で上書きしますか？`)) {
        updateSyncStatus();
        return;
      }
      const files = { [GIST_FILE_NAME]: { content: JSON.stringify(buildBackupPayload(), null, 2) } };
      const saved = remote
        ? await gistApi(`/gists/${remote.id}`, { method: 'PATCH', body: JSON.stringify({ files }) })
        : await gistApi('/gists', { method: 'POST', body: JSON.stringify({ description: '旅の軌跡マップ 同期データ', public: false, files }) });
      saveGistSyncState(saved);
      updateSyncStatus();
      alert('クラウド（非公開Gist）に保存しました！');
    } catch (err) {
      updateSyncStatus();
      alert('クラウド保存エラー: ' + err.message);
    }
  }

  async function pullFromGist() {
    try {
      updateSyncStatus('☁ 取得中...');
      const remote = await findSyncGist();
      if (!remote) {
        updateSyncStatus();
        alert('クラウドに同期データがまだありません。先にどこかの端末で「クラウドに保存」してください。');
        return;
      }
      const file = remote.files[GIST_FILE_NAME];
      const content = file.truncated ? await (await fetch(file.raw_url)).text() : file.content; // 1MB超は本文が省略される
      if (!confirm(`クラウドの記録（${new Date(remote.updated_at).toLocaleString('ja-JP')} 保存）で、この端末の記録を上書きします。よろしいですか？`)) {
        updateSyncStatus();
        return;
      }
      applyBackupPayload(JSON.parse(content));
      saveGistSyncState(remote);
      updateSyncStatus();
      alert('クラウドから全データを取得しました！');
    } catch (err) {
      updateSyncStatus();
      alert('クラウド取得エラー: ' + err.message);
    }
  }

  // =========================================================
  // Googleタイムライン取込（市区町村のみ反映）
  // =========================================================
  function parseLatLngString(str) {
    if (!str || typeof str !== 'string') return null;
    const parts = str.replace(/geo:/i, '').replace(/°/g, '').trim().split(',');
    if (parts.length < 2) return null;
    const lat = parseFloat(parts[0].trim()), lng = parseFloat(parts[1].trim());
    return (isNaN(lat) || isNaN(lng)) ? null : { lat, lng };
  }

  function collectCoordsDeep(obj, results = []) {
    if (!obj || typeof obj !== 'object') return results;
    if (Array.isArray(obj)) { for (const item of obj) collectCoordsDeep(item, results); return results; }
    for (const key of ['latLng', 'LatLng', 'point']) {
      if (typeof obj[key] === 'string') { const pt = parseLatLngString(obj[key]); if (pt) results.push(pt); }
    }
    if (typeof obj.latitudeE7 === 'number' && typeof obj.longitudeE7 === 'number') results.push({ lat: obj.latitudeE7 / 1e7, lng: obj.longitudeE7 / 1e7 });
    if (typeof obj.latitude === 'number' && typeof obj.longitude === 'number') results.push({ lat: obj.latitude, lng: obj.longitude });
    for (const k of Object.keys(obj)) {
      if (k !== 'latLng' && k !== 'LatLng' && k !== 'point' && typeof obj[k] === 'object') collectCoordsDeep(obj[k], results);
    }
    return results;
  }

  function isPointInRing(lat, lng, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi)) inside = !inside;
    }
    return inside;
  }

  function isPointInPolygonRings(lat, lng, rings) {
    if (!isPointInRing(lat, lng, rings[0])) return false;
    for (let k = 1; k < rings.length; k++) if (isPointInRing(lat, lng, rings[k])) return false;
    return true;
  }

  function findMunicipalityCodeByLatLng(lat, lng) {
    for (let i = 0; i < spatialPolygons.length; i++) {
      const sp = spatialPolygons[i];
      if (lat < sp.minLat || lat > sp.maxLat || lng < sp.minLng || lng > sp.maxLng) continue;
      if (isPointInPolygonRings(lat, lng, sp.rings)) return sp.code;
    }
    return null;
  }

  function extractPointsFromTimeline(data, upgradeVisit) {
    const gridMap = new Map();
    let rawVisitCoordCount = 0;
    function addCoord(pt, timeStr, isVisitPoint) {
      if (!pt || isNaN(pt.lat) || isNaN(pt.lng) || pt.lat < 20 || pt.lat > 46 || pt.lng < 122 || pt.lng > 154) return;
      if (isVisitPoint) rawVisitCoordCount++;
      const key = `${pt.lat.toFixed(3)},${pt.lng.toFixed(3)}`;
      const dateStr = (timeStr && typeof timeStr === 'string') ? timeStr.slice(0, 10) : '';
      const statusToSet = (upgradeVisit && isVisitPoint) ? 2 : 1;
      const existing = gridMap.get(key);
      if (!existing) gridMap.set(key, { lat: pt.lat, lng: pt.lng, date: dateStr, suggestedStatus: statusToSet });
      else {
        if (dateStr && (!existing.date || dateStr < existing.date)) existing.date = dateStr;
        if (statusToSet > existing.suggestedStatus) existing.suggestedStatus = statusToSet;
      }
    }
    const segments = Array.isArray(data.semanticSegments) ? data.semanticSegments : (Array.isArray(data.timelineObjects) ? data.timelineObjects : []);
    for (const seg of segments) {
      const segTime = seg.startTime || seg.endTime || '';
      const visitObj = seg.visit || seg.placeVisit;
      if (visitObj) for (const pt of collectCoordsDeep(visitObj)) addCoord(pt, visitObj.duration?.startTimestamp || segTime, true);
      if (Array.isArray(seg.timelinePath)) for (const tp of seg.timelinePath) for (const pt of collectCoordsDeep(tp)) addCoord(pt, tp.time || segTime, false);
      const actObj = seg.activity || seg.activitySegment;
      if (actObj) {
        if (actObj.start) for (const pt of collectCoordsDeep(actObj.start)) addCoord(pt, seg.startTime || segTime, false);
        if (actObj.end) for (const pt of collectCoordsDeep(actObj.end)) addCoord(pt, seg.endTime || segTime, false);
        if (actObj.parking) for (const pt of collectCoordsDeep(actObj.parking)) addCoord(pt, actObj.parking.startTime || segTime, true);
      }
    }
    if (Array.isArray(data.rawSignals)) for (const sig of data.rawSignals) for (const pt of collectCoordsDeep(sig)) addCoord(pt, sig.position?.timestamp || sig.timestamp || '', false);
    return { points: Array.from(gridMap.values()), rawVisitCoordCount };
  }

  function importTimelineData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const upgradeVisit = document.getElementById('timeline-visit-upgrade').checked;
    const allowPromote = document.getElementById('timeline-allow-promote').checked;
    const overlay = document.getElementById('loading-overlay');
    overlay.style.display = 'flex';
    const reader = new FileReader();
    reader.onload = e => {
      setTimeout(() => {
        try {
          const json = JSON.parse(e.target.result);
          const { points, rawVisitCoordCount } = extractPointsFromTimeline(json, upgradeVisit);
          const detectedMunis = new Map();
          for (const pt of points) {
            const code = findMunicipalityCodeByLatLng(pt.lat, pt.lng);
            if (!code) continue;
            const prev = detectedMunis.get(code);
            if (!prev) detectedMunis.set(code, { status: pt.suggestedStatus, date: pt.date || '' });
            else {
              if (pt.suggestedStatus > prev.status) prev.status = pt.suggestedStatus;
              if (pt.date && (!prev.date || pt.date < prev.date)) prev.date = pt.date;
            }
          }
          let addedPassCount = 0, addedVisitCount = 0, promotedVisitCount = 0;
          for (const [code, info] of detectedMunis.entries()) {
            const currentStatus = userRecords[code]?.status || 0;
            if (currentStatus === 0) {
              userRecords[code] = { status: info.status, date: info.date || new Date().toISOString().split('T')[0], memo: 'タイムライン自動取込' };
              if (info.status === 2) addedVisitCount++; else addedPassCount++;
            } else if (currentStatus === 1 && info.status === 2 && allowPromote) {
              userRecords[code].status = 2; promotedVisitCount++;
            }
          }
          saveStorage(); updateAllStyles(); updateStats(); renderList();
          overlay.style.display = 'none';
          alert(`タイムライン取込完了！\n・visit座標: ${rawVisitCoordCount}件\n・新規立寄: ${addedVisitCount}件 / 昇格: ${promotedVisitCount}件 / 新規通過: ${addedPassCount}件`);
        } catch {
          overlay.style.display = 'none';
          alert('タイムラインJSONの解析に失敗しました。');
        }
      }, 50);
      event.target.value = '';
    };
    reader.readAsText(file);
  }
