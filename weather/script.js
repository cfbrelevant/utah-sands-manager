(() => {
  'use strict';
  const places = [...(window.MW_PLACES || [])];
  const $ = id => document.getElementById(id);
  const storageKey = 'mormon-weather-saved-v1';
  const selectedKey = 'mormon-weather-selection-v1';
  const customKey = 'mormon-weather-custom-cities-v1';
  const customPlaces = readStorage(customKey, []);
  if (Array.isArray(customPlaces)) customPlaces.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lon)).forEach(p => { if(!places.some(x => x.id === p.id)) places.push(p); });
  let favorites = new Set(readStorage(storageKey, []));
  let selectedId = readStorage(selectedKey, 'jordan');
  let activeCategory = 'All';
  let favoritesOnly = false;
  let visibleCount = 8;
  let currentPlace = null;
  let forecast = null;
  let forecastAbort = null;
  let forecastSequence = 0;
  const forecastCache = new Map();
  const historyCache = new Map();

  function readStorage(key, fallback) {
    try { const data = JSON.parse(localStorage.getItem(key)); return data == null ? fallback : data; } catch { return fallback; }
  }
  function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const weekday = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {weekday:'short'});
  const formatDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const formatClock = iso => iso?.split('T')[1] ? new Date(`2000-01-01T${iso.split('T')[1]}`).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '—';
  const round = value => value == null || !Number.isFinite(Number(value)) ? '—' : Math.round(Number(value)).toString();
  const pct = value => value == null ? '—' : `${Math.round(value)}%`;
  const weatherTypes = [
    [[0],['Clear skies','☀️']], [[1],['Mainly clear','🌤️']], [[2],['Partly cloudy','⛅']], [[3],['Overcast','☁️']],
    [[45,48],['Fog','🌫️']], [[51,53,55,56,57],['Drizzle','🌦️']], [[61,63,65,66,67],['Rain','🌧️']],
    [[71,73,75,77],['Snow','🌨️']], [[80,81,82],['Showers','🌧️']], [[85,86],['Snow showers','🌨️']],
    [[95,96,99],['Thunderstorms','⛈️']]
  ];
  function condition(code, isDay = true) {
    code = Number(code);
    if (!isDay && code === 0) return ['Clear night','🌙'];
    if (!isDay && code === 1) return ['Mostly clear night','🌙'];
    if (!isDay && code === 2) return ['Partly cloudy night','☁️'];
    for (const [codes, result] of weatherTypes) if (codes.includes(Number(code))) return result;
    return ['Conditions','🌤️'];
  }
  function isDayAt(time, daily) {
    const day = daily?.time?.indexOf(time.slice(0, 10)) ?? -1;
    const sunrise = daily?.sunrise?.[day], sunset = daily?.sunset?.[day];
    if (sunrise && sunset) return time >= sunrise && time < sunset;
    const hour = Number(time.slice(11, 13));
    return hour >= 6 && hour < 18;
  }
  function renderTrend(data, time) {
    const points = (data.hourly?.time || []).map((t, i) => ({t, temp:Number(data.hourly.temperature_2m?.[i])}))
      .filter(point => point.t >= time.slice(0, 13) && Number.isFinite(point.temp)).slice(0, 13);
    if (points.length < 2) return '';
    const values = points.map(point => point.temp);
    const low = Math.floor(Math.min(...values)), high = Math.ceil(Math.max(...values));
    const spread = Math.max(4, high - low);
    const coords = points.map((point, i) => ({
      x: Math.round(14 + i * 672 / (points.length - 1)),
      y: Math.round(147 - (point.temp - low) * 108 / spread)
    }));
    const line = coords.map((point, i) => `${i ? 'L' : 'M'}${point.x} ${point.y}`).join(' ');
    const area = `${line} L${coords.at(-1).x} 164 L${coords[0].x} 164 Z`;
    const last = coords.at(-1);
    return `<div class="trend-panel"><div class="trend-head"><div><span class="small-heading">TEMPERATURE TREND</span><strong>Next 12 hours</strong></div><span>${round(high)}° high · ${round(low)}° low</span></div>
      <svg class="trend-chart" viewBox="0 0 700 180" preserveAspectRatio="none" role="img" aria-label="Temperature trend from ${esc(formatClock(points[0].t))} to ${esc(formatClock(points.at(-1).t))}">
        <defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#c5f547" stop-opacity=".38"/><stop offset="100%" stop-color="#c5f547" stop-opacity="0"/></linearGradient></defs>
        <path class="trend-grid" d="M14 164 H686 M14 100 H686 M14 38 H686"/><path d="${area}" fill="url(#trendFill)"/><path class="trend-line" d="${line}"/><circle cx="${last.x}" cy="${last.y}" r="6" fill="#b9ed36" stroke="#132322" stroke-width="3"/>
      </svg><div class="trend-times"><span>${esc(formatClock(points[0].t))}</span><span>${esc(formatClock(points[Math.floor((points.length-1)/2)].t))}</span><span>${esc(formatClock(points.at(-1).t))}</span></div></div>`;
  }
  function kindIcon(kind) {return {Temples:'⛪',History:'📜','Pioneer Trail':'🏔️','Mission Cities':'🌎','Your Cities':'📍'}[kind] || '📍';}
  function filterPlaces() {
    const q = $('search').value.trim().toLowerCase();
    return places.filter(place =>
      (activeCategory === 'All' || place.kind === activeCategory) &&
      (!favoritesOnly || favorites.has(place.id)) &&
      (!q || `${place.name} ${place.city} ${place.kind}`.toLowerCase().includes(q))
    );
  }
  function renderList() {
    const matching = filterPlaces();
    $('placesList').innerHTML = matching.slice(0, visibleCount).map(place => `
      <div class="place-card ${selectedId === place.id ? 'selected' : ''}" data-open="${esc(place.id)}" role="button" tabindex="0" aria-label="See weather for ${esc(place.name)}" aria-pressed="${selectedId === place.id}">
        <div class="place-icon ${esc(place.kind.replace(/\s+/g,'-'))}" aria-hidden="true">${kindIcon(place.kind)}</div>
        <div class="place-card-main"><span class="place-cat">${esc(place.kind)}</span><strong>${esc(place.name)}</strong><small>${esc(place.city)}</small></div>
        <button class="save-btn ${favorites.has(place.id) ? 'is-saved' : ''}" data-save="${esc(place.id)}" aria-label="${favorites.has(place.id) ? 'Remove saved location' : 'Save location'}" title="Save location" aria-pressed="${favorites.has(place.id)}">${favorites.has(place.id) ? '★' : '☆'}</button>
        <span class="chevron" aria-hidden="true">›</span>
      </div>`).join('');
    $('emptyState').classList.toggle('hidden', matching.length !== 0);
    $('searchCityBtn').classList.toggle('hidden', !$('search').value.trim() || favoritesOnly);
    $('loadMore').classList.toggle('hidden', matching.length <= visibleCount);
    $('savedCount').textContent = favorites.size;
    $('savedToggle').classList.toggle('selected-filter', favoritesOnly);
    $('savedToggle').setAttribute('aria-pressed', String(favoritesOnly));
    $('savedToggle').firstChild.textContent = favoritesOnly ? '★ Saved ' : '☆ Saved ';
    document.querySelectorAll('[data-cat]').forEach(btn => btn.classList.toggle('active', btn.dataset.cat === activeCategory));
  }
  function forecastUrl(p) {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    const params = {
      latitude:p.lat, longitude:p.lon, timezone:'auto', forecast_days:'16',
      current:'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
      hourly:'temperature_2m,precipitation_probability,weather_code',
      daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,wind_speed_10m_max',
      temperature_unit:'fahrenheit', wind_speed_unit:'mph', precipitation_unit:'inch'
    };
    for (const [key,value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.toString();
  }
  async function openPlace(id) {
    const place = places.find(p => p.id === id);
    if (!place) return;
    selectedId = id;
    currentPlace = place;
    store(selectedKey,id);
    renderList();
    $('forecastCard').innerHTML = `<div class="detail-location"><div><div class="section-kicker">LIVE FORECAST</div><h3>${esc(place.name)}</h3><small>${esc(place.city)}</small></div><div class="waiting-spinner" aria-hidden="true"></div></div><div class="card-loading">Getting the latest weather…</div>`;
    if (forecastAbort) forecastAbort.abort();
    forecastAbort = new AbortController();
    const sequence = ++forecastSequence;
    const cache = forecastCache.get(id);
    try {
      if (cache && Date.now() - cache.when < 15 * 60 * 1000) { forecast = cache.data; renderForecast(place, forecast); return; }
      const response = await fetch(forecastUrl(place), {signal:forecastAbort.signal});
      if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
      const data = await response.json();
      if (!data?.current || !data?.daily?.time) throw new Error('Forecast data was incomplete');
      forecastCache.set(id,{when:Date.now(),data});
      if (sequence !== forecastSequence) return;
      forecast = data;
      renderForecast(place, data);
    } catch (err) {
      if (err.name === 'AbortError' || sequence !== forecastSequence) return;
      forecast = null;
      $('forecastCard').innerHTML = `<div class="detail-location"><div><div class="section-kicker">WEATHER UNAVAILABLE</div><h3>${esc(place.name)}</h3><small>${esc(place.city)}</small></div></div><div class="error-state"><div class="error-icon">☁️</div><strong>Couldn't connect to live weather.</strong><p>Check your connection and try again. No weather values have been estimated.</p><button id="retryWeather" class="outline-btn">Retry forecast ↻</button></div>`;
      $('retryWeather').addEventListener('click', () => openPlace(place.id));
    }
  }
  function renderForecast(place, data) {
    const cur = data.current;
    const daily = data.daily;
    const cond = condition(cur.weather_code, !!cur.is_day);
    const todayIndex = daily.time.findIndex(d => d === cur.time.split('T')[0]);
    const start = Math.max(0,todayIndex);
    const shownDays = daily.time.slice(start,start+6);
    const rangeLow = Math.min(...shownDays.map((_,i) => Number(daily.temperature_2m_min[start+i])).filter(Number.isFinite));
    const rangeHigh = Math.max(...shownDays.map((_,i) => Number(daily.temperature_2m_max[start+i])).filter(Number.isFinite));
    const range = Math.max(1, rangeHigh - rangeLow);
    const days = shownDays.map((day,i) => {
      const pos = i+start;
      const high = daily.temperature_2m_max[pos], low = daily.temperature_2m_min[pos];
      const left = Number.isFinite(Number(low)) ? Math.max(0,Math.min(100,(low-rangeLow)/range*100)) : 0;
      const width = Number.isFinite(Number(high)) && Number.isFinite(Number(low)) ? Math.max(4,Math.min(100,(high-low)/range*100)) : 0;
      return `<div class="day-row" title="${esc(formatDate(day))}"><strong>${pos===todayIndex?'Today':weekday(day)}</strong><span aria-label="${esc(condition(daily.weather_code[pos])[0])}">${condition(daily.weather_code[pos])[1]}</span><span class="bar" style="--bar-left:${left}%;--bar-width:${width}%" aria-hidden="true"></span><span class="day-temps">${round(high)}° / ${round(low)}° <span class="rain-percent">${pct(daily.precipitation_probability_max?.[pos])}</span></span></div>`;
    }).join('');
    const nextHours = (data.hourly?.time || []).map((t,i) => ({t, i})).filter(v => v.t >= cur.time.slice(0,13)).slice(0,4);
    const hourly = nextHours.map(({t,i}) => `<div class="hour-chip"><small>${formatClock(t)}</small><span role="img" aria-label="${esc(condition(data.hourly.weather_code[i], isDayAt(t,daily))[0])}">${condition(data.hourly.weather_code[i], isDayAt(t,daily))[1]}</span><strong>${round(data.hourly.temperature_2m[i])}°</strong><small>${pct(data.hourly.precipitation_probability?.[i])} rain</small></div>`).join('');
    $('forecastCard').innerHTML = `
      <div class="detail-location"><div><div class="section-kicker">LIVE FORECAST</div><h3>${esc(place.name)}</h3><small>${esc(place.city)}</small></div><button class="forecast-refresh" id="refreshForecast" title="Refresh forecast" aria-label="Refresh forecast">↻</button></div>
      <div class="current-row"><span class="weather-emoji" role="img" aria-label="${esc(cond[0])}">${cond[1]}</span><div><div class="current-temp">${round(cur.temperature_2m)}°</div><div class="condition-text">${esc(cond[0])}</div></div></div>
      ${renderTrend(data, cur.time)}
      <div class="stat-grid"><div class="stat">FEELS LIKE<strong>${round(cur.apparent_temperature)}°F</strong></div><div class="stat">WIND<strong>${round(cur.wind_speed_10m)} mph</strong></div><div class="stat">HUMIDITY<strong>${pct(cur.relative_humidity_2m)}</strong></div><div class="stat">NEXT 24H RAIN CHANCE<strong>${pct(maxNextHours(data,cur.time))}</strong></div></div>
      <div class="small-heading">COMING UP</div><div class="hourly-strip">${hourly || '<span>Hourly data unavailable.</span>'}</div>
      <div class="small-heading heading-spaced">6-DAY OUTLOOK <span class="hint-text">HIGH / LOW · RAIN CHANCE</span></div><div class="day-list">${days}</div>
      ${place.note?`<div class="note-line">ⓘ ${esc(place.note)}</div>`:''}<div class="asof">Forecast for ${esc(data.timezone_abbreviation || data.timezone || 'local time')} · weather provided by Open-Meteo</div>`;
    $('refreshForecast').addEventListener('click', () => { forecastCache.delete(place.id); openPlace(place.id); });
  }
  function maxNextHours(data, time) {
    const xs = (data.hourly?.time || []).map((t,i)=>({t, p:data.hourly.precipitation_probability?.[i]})).filter(v=>v.t>=time.slice(0,13)).slice(0,24).map(v=>v.p).filter(v=>v!=null);
    return xs.length ? Math.max(...xs) : null;
  }
  async function addSearchedCity() {
    const term = $('search').value.trim();
    if (term.length < 2) return;
    $('searchCityBtn').disabled = true;
    $('searchCityBtn').textContent = 'Finding city…';
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=1&language=en&format=json`);
      if (!res.ok) throw new Error('City lookup failed');
      const data = await res.json();
      const city = data.results?.[0];
      if (!city) throw new Error('No city found. Try a city name and state or country.');
      const id = `city-${city.id}`;
      if (!places.some(p=>p.id===id)) {
        const custom = {id,name:city.name,city:[city.admin1, city.country].filter(Boolean).join(', '),kind:'Your Cities',lat:city.latitude,lon:city.longitude,note:'City-center weather, not a specific building forecast'};
        places.unshift(custom);
        store(customKey,places.filter(p=>p.kind==='Your Cities'));
      }
      activeCategory = 'All'; favoritesOnly = false; visibleCount=8; $('search').value='';
      renderList(); await openPlace(id);
      $('forecastCard').scrollIntoView({behavior:'smooth',block:'nearest'});
    } catch(err) {
      $('emptyState').querySelector('strong').textContent = err.message || 'Could not find that city';
    } finally {
      $('searchCityBtn').disabled = false; $('searchCityBtn').textContent = 'Look up this city';
    }
  }
  function fillTempleOptions() {
    $('templeSelect').innerHTML = places.filter(p=>p.kind==='Temples').sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    $('templeSelect').value = 'jordan';
    const localToday = new Date(); const y=localToday.getFullYear(),m=String(localToday.getMonth()+1).padStart(2,'0'),d=String(localToday.getDate()).padStart(2,'0');
    const today = `${y}-${m}-${d}`;
    $('weddingDate').setAttribute('min', today);
    $('weddingDate').value = today;
  }
  async function checkWedding() {
    const p = places.find(p=>p.id===$('templeSelect').value);
    const date = $('weddingDate').value;
    const box = $('weddingResult');
    if (!p || !date) { box.textContent='Choose a temple and date first.'; return; }
    const today = new Date(); const localDate = [today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    if (date < localDate) { box.textContent='Please choose today or a future date.'; return; }
    box.innerHTML=`Checking the weather for <strong>${esc(p.name)}</strong>…`;
    $('checkWedding').disabled=true;
    try {
      let data = forecastCache.get(p.id);
      if (!data || Date.now()-data.when>=15*60*1000) {
        const response=await fetch(forecastUrl(p));
        if (!response.ok) throw new Error('Unable to load this location’s forecast.');
        const f=await response.json();
        data={when:Date.now(),data:f}; forecastCache.set(p.id,data);
      }
      const i=data.data.daily.time.indexOf(date);
      if(i>=0) {
        const d=data.data.daily;
        const rain=d.precipitation_probability_max?.[i], wind=d.wind_speed_10m_max?.[i];
        const caution = (rain>=45 || wind>=20) ? 'Consider an indoor or sheltered backup for photos.' : 'Outdoor photos look reasonable based on the current forecast; keep checking as the date approaches.';
        const sun=d.sunset?.[i] ? formatClock(d.sunset[i]) : 'not available';
        const rise=d.sunrise?.[i] ? formatClock(d.sunrise[i]) : 'not available';
        box.innerHTML=`<strong>${esc(formatDate(date))}</strong><br>📍 ${esc(p.name)}<br> ${condition(d.weather_code[i])[1]} ${condition(d.weather_code[i])[0]} · ${round(d.temperature_2m_max[i])}° high / ${round(d.temperature_2m_min[i])}° low<br>☔ Rain chance: ${pct(rain)} · 🌬️ Max wind: ${round(wind)} mph<br>🌅 Sunrise: ${rise} · Sunset: ${sun}<br><span class="result-advice">📷 ${esc(caution)} For warm sunset portraits, plan outdoor photos in the 1–2 hours before sunset, weather and temple schedule permitting.</span>${p.note?`<br><span class="result-caution">ⓘ ${esc(p.note)}</span>`:''}`;
      } else {
        box.innerHTML = `<strong>${esc(formatDate(date))}</strong><br>${esc(p.name)}<br><span class="result-caution">A reliable daily forecast isn't available this far ahead. Here’s what recent historical weather suggests—not a prediction.</span><div class="history-spinner">Analyzing past weather near this date…</div>`;
        await renderHistory(p,date,box);
      }
    } catch(err) {
      box.innerHTML=`<strong>Weather isn't available right now.</strong><br>${esc(err.message)} Please try again when connected.`;
    } finally { $('checkWedding').disabled=false; }
  }
  async function renderHistory(p,date,box) {
    const [_,month,day] = date.split('-').map(Number);
    const key=`${p.id}-${month}-${day}`;
    if(historyCache.has(key)) { showHistory(box,historyCache.get(key),p); return; }
    const lastYear = new Date().getFullYear()-1;
    const from=lastYear-9;
    const url=new URL('https://archive-api.open-meteo.com/v1/archive');
    const params={latitude:p.lat,longitude:p.lon,start_date:`${from}-01-01`,end_date:`${lastYear}-12-31`,daily:'temperature_2m_max,temperature_2m_min,precipitation_sum',temperature_unit:'fahrenheit',precipitation_unit:'inch',timezone:'auto'};
    for(const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
    try {
      const response=await fetch(url.toString());
      if(!response.ok) throw new Error('Historical data unavailable');
      const data=await response.json();
      const daily=data.daily;
      if(!daily?.time?.length) throw new Error('Historical data unavailable');
      let samples=[];
      // Compare the wedding calendar day, +/- 3 days, over ten complete years.
      daily.time.forEach((dt,i)=> {
        const parts=dt.split('-').map(Number);
        const normalized = Date.UTC(2024,parts[1]-1,parts[2]);
        const target = Date.UTC(2024,month-1,day);
        const diff=Math.abs(normalized-target)/86400000;
        const wrap=Math.min(diff,366-diff);
        if(wrap<=3 && daily.temperature_2m_max[i]!=null && daily.precipitation_sum[i]!=null) samples.push({hi:daily.temperature_2m_max[i],lo:daily.temperature_2m_min[i],rain:daily.precipitation_sum[i]});
      });
      if(!samples.length) throw new Error('No similar historical dates available');
      const avg = key=>samples.reduce((a,b)=>a+b[key],0)/samples.length;
      const result={count:samples.length,high:avg('hi'),low:avg('lo'),wetPct:100*samples.filter(s=>s.rain>=0.1).length/samples.length,from,to:lastYear};
      historyCache.set(key,result); showHistory(box,result,p);
    } catch {
      box.querySelector('.history-spinner').innerHTML='Past-weather comparison is temporarily unavailable. Check again within 16 days of the wedding for a real forecast.';
    }
  }
  function showHistory(box, data, p) {
    const node=box.querySelector('.history-spinner');
    if(!node) return;
    node.innerHTML=`<div class="historical-result"><strong>Typical weather around this date</strong><br>🌡️ Average high: ${round(data.high)}°F · low: ${round(data.low)}°F<br>☔ Measurable precipitation in ${Math.round(data.wetPct)}% of comparable days<br><small>Based on ${data.count} modeled historical days (${data.from}–${data.to}), within 3 days of your calendar date. This is not a forecast.</small></div><p class="history-followup">Check again within 16 days of your ceremony for a specific forecast. Temple operation and sealing schedules must be confirmed separately.</p>${p.note?`<p class="result-caution">ⓘ ${esc(p.note)}</p>`:''}`;
  }
  function attachEvents() {
    $('placesList').addEventListener('click', event => {
      const save=event.target.closest('[data-save]');
      if(save) { const id=save.dataset.save; favorites.has(id)? favorites.delete(id):favorites.add(id); store(storageKey,[...favorites]);renderList();return; }
      const card=event.target.closest('[data-open]'); if(card) openPlace(card.dataset.open);
    });
    $('placesList').addEventListener('keydown',e=>{
      if((e.key==='Enter'||e.key===' ') && e.target.matches('.place-card')) {e.preventDefault();openPlace(e.target.dataset.open);}
    });
    $('search').addEventListener('input',()=>{visibleCount=8;renderList();});
    $('search').addEventListener('keydown',e=>{if(e.key==='Enter' && filterPlaces().length===0) addSearchedCity();});
    document.querySelectorAll('[data-cat]').forEach(btn => btn.addEventListener('click',()=>{activeCategory=btn.dataset.cat;favoritesOnly=false;visibleCount=8;renderList();}));
    document.querySelectorAll('[data-quick]').forEach(btn=>btn.addEventListener('click',()=>{activeCategory=btn.dataset.quick;favoritesOnly=false;visibleCount=8;renderList();document.querySelector('.content-area').scrollIntoView({behavior:'smooth'});}));
    $('savedToggle').addEventListener('click',()=>{favoritesOnly=!favoritesOnly;activeCategory='All';visibleCount=8;renderList();document.querySelector('.content-area').scrollIntoView({behavior:'smooth'});});
    $('loadMore').addEventListener('click',()=>{visibleCount+=10;renderList();});
    $('searchCityBtn').addEventListener('click',addSearchedCity);
    $('openPlanner').addEventListener('click',()=>{if(currentPlace?.kind==='Temples') $('templeSelect').value=currentPlace.id; $('planner').scrollIntoView({behavior:'smooth'});$('weddingDate').focus({preventScroll:true});});
    $('checkWedding').addEventListener('click',checkWedding);
    document.addEventListener('keydown',e=>{if(e.key==='/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){e.preventDefault();$('search').focus();}});
  }
  fillTempleOptions(); attachEvents(); renderList();
  openPlace(places.some(p=>p.id===selectedId)?selectedId:'jordan');
  if ('serviceWorker' in navigator && location.protocol === 'https:') { window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {})); }
})();
