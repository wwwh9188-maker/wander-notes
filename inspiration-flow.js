(() => {
  'use strict';

  const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=700&q=80';
  const selectedPlaceIds = new Set();
  let editingInspirationId = null;
  let organizingInspirationId = null;
  let pendingPlanPlaceIds = [];
  let flowCalendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  data.inspirations = Array.isArray(data.inspirations) ? data.inspirations : [];
  data.places = (data.places || []).map((place, index) => ({
    ...place,
    id: place.id || `place-${index}-${hashText(`${place.name}-${place.country}`)}`,
    tags: Array.isArray(place.tags) ? place.tags : splitTags(place.tags)
  }));

  function splitTags(value) {
    return String(value || '').split(/[,，、]/).map(tag => tag.trim()).filter(Boolean);
  }

  function flowDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function flowIso(date) {
    const pad = number => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function normalizeUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const parsed = new URL(candidate);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch (error) {
      return '';
    }
  }

  function sourceLabel(url) {
    if (!url) return '随手记';
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      if (/xiaohongshu|xhslink/.test(host)) return '小红书';
      if (/weixin|qq\.com/.test(host)) return '微信文章';
      return host;
    } catch (error) {
      return '网页链接';
    }
  }

  function plannedTripFor(placeId) {
    return (data.trips || []).find(trip => (trip.sourcePlaceIds || []).includes(placeId));
  }

  function updateWishlistTools() {
    [...selectedPlaceIds].forEach(id => {
      if (!data.places.some(place => place.id === id)) selectedPlaceIds.delete(id);
    });
    const count = selectedPlaceIds.size;
    const selection = document.getElementById('wishlistSelection');
    const button = document.getElementById('planSelectedPlaces');
    const selectAll = document.getElementById('selectAllPlaces');
    if (button) {
      button.disabled = !count;
      button.textContent = count ? `规划一次旅行 · ${count}` : '规划一次旅行';
    }
    if (selectAll) selectAll.textContent = count && count === data.places.length ? '取消全选' : '全选';
    if (selection) {
      selection.hidden = !count;
      selection.innerHTML = count ? `<span>已选择 <b>${count}</b> 个心愿地点</span><button type="button" onclick="clearWishlistSelection()">清除选择</button>` : '';
    }
  }

  function renderWishlistPlaceCard(place, index) {
    const planned = plannedTripFor(place.id);
    const selected = selectedPlaceIds.has(place.id);
    const tags = (place.tags || []).map(tag => `<span>${safeText(tag)}</span>`).join('');
    return `<article class="card place wishlist-place ${selected ? 'selected' : ''}">
      <label class="place-selector" title="选择这个地点"><input type="checkbox" ${selected ? 'checked' : ''} onchange="toggleWishlistPlace('${place.id}',this.checked)"><span>✓</span></label>
      <button class="pin" title="移除收藏" onclick="removePlace(${index})">♥</button>
      <img src="${safeText(place.img || FALLBACK_IMAGE)}" alt="${safeText(place.name)}" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'">
      <div class="place-body"><div class="place-title-line"><div><h3>${safeText(place.name)}</h3><p>${safeText(place.country || '地区待补充')}</p></div>${planned ? '<span class="place-state">已加入计划</span>' : '<span class="place-state wish">想去</span>'}</div><div class="tags">${tags}</div>
      ${place.sourceUrl ? `<a class="place-source" href="${safeText(place.sourceUrl)}" target="_blank" rel="noopener">↗ 查看灵感来源</a>` : ''}
      <div class="place-plan-actions">${planned ? `<button class="ghost" onclick="openTripById('${planned.id}')">查看计划</button>` : `<button class="primary" onclick="openWishlistPlan(['${place.id}'])">开始计划</button>`}</div></div>
    </article>`;
  }

  function renderWishlistPlaces() {
    const target = document.getElementById('allPlaces');
    if (!target) return;
    target.innerHTML = data.places.map(renderWishlistPlaceCard).join('') || '<div class="empty wishlist-empty">还没有心愿地点。可以先收集一条灵感，或者直接添加地点。</div>';
    updateWishlistTools();
    if (typeof renderRoute === 'function') renderRoute();
  }

  window.toggleWishlistPlace = (id, checked) => {
    if (checked) selectedPlaceIds.add(id);
    else selectedPlaceIds.delete(id);
    renderWishlistPlaces();
  };

  window.clearWishlistSelection = () => {
    selectedPlaceIds.clear();
    renderWishlistPlaces();
  };

  document.getElementById('selectAllPlaces')?.addEventListener('click', () => {
    if (selectedPlaceIds.size === data.places.length) selectedPlaceIds.clear();
    else data.places.forEach(place => selectedPlaceIds.add(place.id));
    renderWishlistPlaces();
  });

  document.getElementById('planSelectedPlaces')?.addEventListener('click', () => window.openWishlistPlan([...selectedPlaceIds]));

  window.removePlace = index => {
    const place = data.places[index];
    if (!place) return;
    const suffix = plannedTripFor(place.id) ? ' 已经创建的旅行不会被删除。' : '';
    if (!confirm(`从心愿清单移除「${place.name}」？${suffix}`)) return;
    selectedPlaceIds.delete(place.id);
    data.places.splice(index, 1);
    save();
    renderWishlistPlaces();
  };

  function inspirationExcerpt(item) {
    return item.note || item.shareText || '尚未添加备注，可以稍后回来整理。';
  }

  function renderInspirations() {
    const target = document.getElementById('inspirationList');
    if (!target) return;
    const pending = data.inspirations.filter(item => item.status !== 'organized').length;
    const count = document.getElementById('inspirationCount');
    if (count) count.textContent = `${pending} 条待整理`;
    target.innerHTML = data.inspirations.length ? data.inspirations.map(item => {
      const place = item.placeId && data.places.find(candidate => candidate.id === item.placeId);
      const tags = (item.tags || []).map(tag => `<span>${safeText(tag)}</span>`).join('');
      return `<article class="inspiration-item ${place ? 'organized' : ''}">
        <div class="inspiration-source"><span>${safeText(sourceLabel(item.url))}</span><time>${safeText(item.createdAt?.slice(0, 10) || '')}</time></div>
        <div class="inspiration-copy"><div class="inspiration-title-line"><h4>${safeText(item.title || '未命名灵感')}</h4>${place ? '<span class="organized-label">已整理</span>' : '<span class="inbox-label">待整理</span>'}</div><p>${safeText(inspirationExcerpt(item))}</p><div class="inspiration-meta">${item.city ? `<span>⌖ ${safeText(item.city)}</span>` : ''}${tags}</div></div>
        <div class="inspiration-actions">${item.url ? `<a href="${safeText(item.url)}" target="_blank" rel="noopener">打开原文</a>` : ''}${place ? `<button onclick="openWishlistPlan(['${place.id}'])">开始计划</button>` : `<button onclick="organizeInspiration('${item.id}')">整理成地点</button>`}<button onclick="editInspiration('${item.id}')">编辑</button><button class="danger-text" onclick="removeInspiration('${item.id}')">删除</button></div>
      </article>`;
    }).join('') : '<div class="inspiration-empty"><b>把刷到的旅行内容先放在这里</b><p>不用现在做决定，保存链接或分享文案，之后再整理成地点。</p><button class="primary" onclick="openInspirationDialog()">＋ 收集第一条灵感</button></div>';
  }

  function resetInspirationForm(item = null) {
    editingInspirationId = item?.id || null;
    document.getElementById('inspirationDialogTitle').textContent = item ? '编辑旅行灵感' : '收集一条旅行灵感';
    document.getElementById('inspirationTitle').value = item?.title || '';
    document.getElementById('inspirationUrl').value = item?.url || '';
    document.getElementById('inspirationShareText').value = item?.shareText || '';
    document.getElementById('inspirationCity').value = item?.city || '';
    document.getElementById('inspirationTags').value = (item?.tags || []).join(', ');
    document.getElementById('inspirationNote').value = item?.note || '';
  }

  window.openInspirationDialog = () => {
    resetInspirationForm();
    document.getElementById('inspirationDialog').showModal();
  };

  window.editInspiration = id => {
    const item = data.inspirations.find(candidate => candidate.id === id);
    if (!item) return;
    resetInspirationForm(item);
    document.getElementById('inspirationDialog').showModal();
  };

  window.removeInspiration = id => {
    const item = data.inspirations.find(candidate => candidate.id === id);
    if (!item || !confirm(`删除灵感「${item.title || '未命名灵感'}」？已经整理出的地点不会被删除。`)) return;
    data.inspirations = data.inspirations.filter(candidate => candidate.id !== id);
    save();
    renderInspirations();
  };

  document.getElementById('addInspiration')?.addEventListener('click', window.openInspirationDialog);
  document.getElementById('saveInspiration')?.addEventListener('click', () => {
    const rawUrl = document.getElementById('inspirationUrl').value.trim();
    const url = normalizeUrl(rawUrl);
    const shareText = document.getElementById('inspirationShareText').value.trim();
    const note = document.getElementById('inspirationNote').value.trim();
    let title = document.getElementById('inspirationTitle').value.trim();
    if (rawUrl && !url) return alert('链接格式不正确，请检查后再保存。');
    if (!title && !url && !shareText && !note) return alert('至少保存一个标题、链接、分享文案或备注。');
    if (!title) title = shareText.split('\n').find(Boolean)?.slice(0, 34) || `${document.getElementById('inspirationCity').value.trim() || '旅行'}灵感`;
    const record = {
      id: editingInspirationId || `inspiration-${Date.now()}`,
      title,
      url,
      shareText,
      city: document.getElementById('inspirationCity').value.trim(),
      tags: splitTags(document.getElementById('inspirationTags').value),
      note,
      createdAt: editingInspirationId ? data.inspirations.find(item => item.id === editingInspirationId)?.createdAt : new Date().toISOString(),
      status: editingInspirationId ? data.inspirations.find(item => item.id === editingInspirationId)?.status || 'inbox' : 'inbox'
    };
    if (editingInspirationId) Object.assign(data.inspirations.find(item => item.id === editingInspirationId), record);
    else data.inspirations.unshift(record);
    save();
    renderInspirations();
    document.getElementById('inspirationDialog').close();
    editingInspirationId = null;
  });

  window.organizeInspiration = id => {
    const item = data.inspirations.find(candidate => candidate.id === id);
    if (!item) return;
    organizingInspirationId = id;
    document.querySelector('#placeDialog h2').textContent = '把灵感整理成地点';
    document.getElementById('placeName').value = item.title || '';
    document.getElementById('placeCountry').value = item.city || '';
    document.getElementById('placeTag').value = (item.tags || []).join(', ');
    document.getElementById('placeImage').value = '';
    document.getElementById('placeDialog').showModal();
  };

  function openBlankPlaceDialog() {
    organizingInspirationId = null;
    document.querySelector('#placeDialog h2').textContent = '贴一张新的旅行便签';
    ['placeName', 'placeCountry', 'placeTag', 'placeImage'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('placeDialog').showModal();
  }

  document.getElementById('addPlace').onclick = openBlankPlaceDialog;
  document.getElementById('savePlace').onclick = event => {
    event.preventDefault();
    const name = document.getElementById('placeName').value.trim();
    if (!name) return;
    const inspiration = organizingInspirationId && data.inspirations.find(item => item.id === organizingInspirationId);
    const place = {
      id: `place-${Date.now()}`,
      name,
      country: document.getElementById('placeCountry').value.trim() || '待补充',
      tags: splitTags(document.getElementById('placeTag').value || '旅行灵感'),
      img: document.getElementById('placeImage').value.trim(),
      sourceUrl: inspiration?.url || '',
      sourceInspirationId: inspiration?.id || ''
    };
    data.places.unshift(place);
    if (inspiration) Object.assign(inspiration, {status: 'organized', placeId: place.id});
    save();
    renderWishlistPlaces();
    renderInspirations();
    document.getElementById('placeDialog').close();
    organizingInspirationId = null;
  };

  function ensureTripSourceHint() {
    const form = document.querySelector('#tripDialog .modal');
    let hint = document.getElementById('tripSourceHint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'tripSourceHint';
      hint.className = 'trip-source-hint';
      const actions = form.querySelector('.modal-actions');
      form.insertBefore(hint, actions);
    }
    return hint;
  }

  function openFlowTripEditor(trip = null) {
    editingTripId = trip?.id || null;
    document.getElementById('tripDialogTitle').textContent = trip ? '编辑出行' : '创建一趟出行';
    document.getElementById('editTripName').value = trip?.name || '';
    document.getElementById('editTripCountry').value = trip?.country || '';
    document.getElementById('editTripStart').value = trip?.start || '';
    document.getElementById('editTripEnd').value = trip?.end || '';
    document.getElementById('editTripStatus').value = trip?.status || 'upcoming';
    const hint = ensureTripSourceHint();
    const places = pendingPlanPlaceIds.map(id => data.places.find(place => place.id === id)).filter(Boolean);
    hint.hidden = !places.length;
    hint.innerHTML = places.length ? `<span>从心愿清单带入</span><b>${places.map(place => safeText(place.name)).join(' · ')}</b><small>创建后先进入“待安排地点”，不会自动放进 D1。</small>` : '';
    document.getElementById('tripDialog').showModal();
  }

  openTripEditor = openFlowTripEditor;
  document.getElementById('createTrip').onclick = () => {
    pendingPlanPlaceIds = [];
    openFlowTripEditor();
  };
  window.editCurrentTrip = () => {
    pendingPlanPlaceIds = [];
    openFlowTripEditor(currentTrip());
  };

  window.openWishlistPlan = ids => {
    const places = ids.map(id => data.places.find(place => place.id === id)).filter(Boolean);
    if (!places.length) return;
    if (places.length === 1) {
      const existing = plannedTripFor(places[0].id);
      if (existing) return openTripById(existing.id);
    }
    pendingPlanPlaceIds = places.map(place => place.id);
    openFlowTripEditor();
    const commonCountry = places.every(place => place.country === places[0].country) ? places[0].country : '';
    document.getElementById('editTripName').value = places.length === 1 ? `${places[0].name} · 新旅行` : `${commonCountry && commonCountry !== '待补充' ? commonCountry : '多城'} · 心愿旅行`;
    document.getElementById('editTripCountry').value = commonCountry === '待补充' ? '' : commonCountry;
  };

  document.getElementById('saveTrip').onclick = async event => {
    event.preventDefault();
    const name = document.getElementById('editTripName').value.trim();
    const start = document.getElementById('editTripStart').value;
    const end = document.getElementById('editTripEnd').value;
    if (!name) return;
    if (start && end && end < start) return alert('结束日期不能早于开始日期。');
    const isNew = !editingTripId;
    const sourcePlaces = pendingPlanPlaceIds.map(id => data.places.find(place => place.id === id)).filter(Boolean);
    let trip = editingTripId ? data.trips.find(item => item.id === editingTripId) : null;
    if (!trip) {
      trip = {
        id: `trip-${Date.now()}`,
        city: sourcePlaces.length === 1 ? sourcePlaces[0].name : name.split(/[·（(]/)[0].trim(),
        img: sourcePlaces[0]?.img || '',
        days: {},
        todos: [],
        expenses: [],
        sourcePlaceIds: sourcePlaces.map(place => place.id),
        planningPool: sourcePlaces.map(place => ({
          id: `pool-${place.id}`,
          sourcePlaceId: place.id,
          name: place.name,
          country: place.country,
          tags: place.tags || [],
          sourceUrl: place.sourceUrl || ''
        }))
      };
      data.trips.push(trip);
    }
    Object.assign(trip, {
      name,
      country: document.getElementById('editTripCountry').value.trim(),
      start,
      end,
      status: document.getElementById('editTripStatus').value
    });
    if (start && end && typeof syncTripDaysToDates === 'function') syncTripDaysToDates(trip);
    if (!Object.keys(trip.days || {}).length) trip.days = {D1: {title: '第一天', date: start || '待安排', stops: []}};
    save();
    selectedPlaceIds.clear();
    pendingPlanPlaceIds = [];
    renderWishlistPlaces();
    renderPlannedTrips();
    renderDynamicCalendar();
    document.getElementById('tripDialog').close();
    if (isNew && sourcePlaces.length) openTripById(trip.id);
    else if (editingTripId) {
      currentTripId = trip.id;
      renderTrip();
    }
  };

  function renderPlanningPool() {
    const trip = currentTrip();
    const box = document.getElementById('dayContent');
    if (!trip || activeDay !== 'overview' || !box || box.querySelector('.planning-pool')) return;
    const pool = trip.planningPool || [];
    if (!pool.length) return;
    const dayKeys = Object.keys(trip.days || {});
    const cards = pool.map(item => `<article class="planning-pool-item"><div><span class="category">心愿地点</span><h4>${safeText(item.name)}</h4><p>${safeText(item.country || '')}${item.tags?.length ? ` · ${item.tags.map(tag => safeText(tag)).join(' / ')}` : ''}</p></div><div class="pool-actions"><select id="pool-day-${item.id}" aria-label="选择安排日期">${dayKeys.map(key => `<option value="${key}">${key} · ${safeText(trip.days[key].title || '')}</option>`).join('')}</select><button class="primary" onclick="movePlanningPlaceToDay('${item.id}',document.getElementById('pool-day-${item.id}').value)">加入当天</button><button class="ghost" onclick="removePlanningPoolItem('${item.id}')">暂不安排</button></div></article>`).join('');
    box.insertAdjacentHTML('beforeend', `<section class="planning-pool"><div class="planning-pool-head"><div><span class="transit-kicker">UNSCHEDULED PLACES</span><h3>待安排地点</h3><p>这些地点来自心愿清单，由你决定放入哪一天。</p></div><span>${pool.length} 个</span></div><div class="planning-pool-list">${cards}</div></section>`);
  }

  window.movePlanningPlaceToDay = (poolId, dayKey) => {
    const trip = currentTrip();
    const item = trip?.planningPool?.find(candidate => candidate.id === poolId);
    const day = trip?.days?.[dayKey];
    if (!item || !day) return;
    const times = typeof stopTimes === 'function' ? stopTimes(day.stops.length + 1, trip.travelDNA?.pace || 'balanced') : [];
    day.stops.push({
      id: `wish-stop-${Date.now()}`,
      time: times[day.stops.length] || '10:00',
      name: item.name,
      type: '景点',
      hours: '营业时间待补充',
      pay: '支付方式待补充',
      note: item.sourceUrl ? '来自心愿清单，可通过灵感来源继续查看原文' : '来自心愿清单',
      sourcePlaceId: item.sourcePlaceId,
      sourceUrl: item.sourceUrl || ''
    });
    trip.planningPool = trip.planningPool.filter(candidate => candidate.id !== poolId);
    save();
    renderTrip();
  };

  window.removePlanningPoolItem = poolId => {
    const trip = currentTrip();
    if (!trip) return;
    trip.planningPool = (trip.planningPool || []).filter(item => item.id !== poolId);
    save();
    renderTrip();
  };

  const renderTripBeforeInspirationFlow = renderTrip;
  renderTrip = function renderTripWithPlanningPool() {
    const result = renderTripBeforeInspirationFlow();
    queueMicrotask(renderPlanningPool);
    return result;
  };

  function monthTripDays(trip, monthStart, monthEnd) {
    const start = flowDate(trip.start);
    const end = flowDate(trip.end || trip.start);
    if (!start || !end || end < monthStart || start > monthEnd) return [];
    const from = start < monthStart ? new Date(monthStart) : new Date(start);
    const to = end > monthEnd ? new Date(monthEnd) : new Date(end);
    const values = [];
    for (let cursor = from; cursor <= to; cursor.setDate(cursor.getDate() + 1)) values.push(flowIso(cursor));
    return values;
  }

  function renderDynamicCalendar() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    const year = flowCalendarCursor.getFullYear();
    const month = flowCalendarCursor.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const lead = (first.getDay() + 6) % 7;
    const today = flowIso(new Date());
    document.getElementById('calendarTitle').textContent = `${year} · ${new Intl.DateTimeFormat('zh-CN', {month: 'long'}).format(first)}`;
    let markup = ['一', '二', '三', '四', '五', '六', '日'].map(day => `<div class="weekday">${day}</div>`).join('');
    for (let index = 0; index < 42; index++) {
      const date = new Date(year, month, 1 - lead + index);
      const iso = flowIso(date);
      const muted = date.getMonth() !== month;
      const trips = (data.trips || []).filter(trip => {
        const tripEnd = trip.end || trip.start;
        return trip.start && tripEnd && iso >= trip.start && iso <= tripEnd;
      });
      const events = trips.slice(0, 2).map(trip => {
        const position = iso === trip.start ? 'start' : iso === (trip.end || trip.start) ? 'end' : 'middle';
        return `<button class="event calendar-event ${position}" onclick="event.stopPropagation();openTripById('${trip.id}')" title="打开 ${safeText(trip.name)}">${iso === trip.start ? '✈ ' : ''}${safeText(trip.name)}</button>`;
      }).join('');
      markup += `<div class="day ${muted ? 'muted' : ''} ${iso === today ? 'today' : ''}" onclick="openCalendarDate('${iso}')"><span class="day-number">${date.getDate()}</span>${events}${trips.length > 2 ? `<small class="more-events">还有 ${trips.length - 2} 个</small>` : ''}</div>`;
    }
    grid.innerHTML = markup;
    const trips = (data.trips || []).filter(trip => {
      const start = flowDate(trip.start);
      const end = flowDate(trip.end || trip.start);
      return start && end && end >= first && start <= last;
    });
    const travelDays = new Set(trips.flatMap(trip => monthTripDays(trip, first, last))).size;
    document.getElementById('calendarSummary').innerHTML = `<span class="transit-kicker">MONTH AT A GLANCE</span><h3>这个月的脚步</h3><div class="calendar-summary-number"><strong>${trips.length}</strong><span>次旅行</span><strong>${travelDays}</strong><span>天在路上</span></div><div class="calendar-trip-list">${trips.map(trip => `<button onclick="openTripById('${trip.id}')"><span>${safeText(trip.name)}</span><small>${safeText(trip.start)} — ${safeText(trip.end || trip.start)}</small></button>`).join('') || '<div class="empty">这个月还没有出行计划。点击任意日期即可创建。</div>'}</div>`;
  }

  calendar = renderDynamicCalendar;
  window.openCalendarDate = iso => {
    pendingPlanPlaceIds = [];
    openFlowTripEditor();
    document.getElementById('editTripStart').value = iso;
    document.getElementById('editTripEnd').value = iso;
  };

  document.getElementById('prevMonth').onclick = () => {
    flowCalendarCursor = new Date(flowCalendarCursor.getFullYear(), flowCalendarCursor.getMonth() - 1, 1);
    renderDynamicCalendar();
  };
  document.getElementById('nextMonth').onclick = () => {
    flowCalendarCursor = new Date(flowCalendarCursor.getFullYear(), flowCalendarCursor.getMonth() + 1, 1);
    renderDynamicCalendar();
  };
  document.getElementById('todayMonth').onclick = () => {
    flowCalendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    renderDynamicCalendar();
  };
  document.getElementById('addEvent').onclick = () => {
    pendingPlanPlaceIds = [];
    openFlowTripEditor();
  };

  const showViewBeforeInspirationFlow = showView;
  showView = function showViewWithLiveCalendar(id) {
    const result = showViewBeforeInspirationFlow(id);
    if (id === 'calendar') renderDynamicCalendar();
    if (id === 'home') {
      renderInspirations();
      renderWishlistPlaces();
    }
    return result;
  };

  placeCard = renderWishlistPlaceCard;
  renderPlaces = renderWishlistPlaces;
  save();
  renderInspirations();
  renderWishlistPlaces();
  renderDynamicCalendar();
})();
