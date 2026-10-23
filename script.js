// استدعاء ملف GeoJSON وتنسيق الخطوط
fetch('border.json')
  .then(response => response.json())
  .then(geojsonData => {
    
    // إنشاء طبقة الخط
    var campusWallLayer = L.geoJSON(geojsonData, {
      style: function(feature) {
        return {
          color: '#FF0000',       // لون الخط (أسود داكن)
          weight: 4,              // سمك الخط بالبكسل
          opacity: 0.9,           // درجة الشفافية (من 0 إلى 1)
          dashArray: '6, 6',      // تجعل الخط منقطاً (حذف هذا السطر يجعله متصلاً)
          lineCap: 'round',
          lineJoin: 'round'
        };
      },
      onEachFeature: function (feature, layer) {
        // إضافة نافذة تفاعلية (Popup) تظهر ارتفاع السور أو اسمه عند النقر
        var wallHeight = feature.properties.hight || 'غير محدد';
        layer.bindPopup(`
          <div style="text-align: right; direction: rtl;">
            <h4 style="margin:0 0 5px 0;">سور جامعة جنوب الوادي</h4>
            <p style="margin:0;">الارتفاع: <b>${wallHeight} أمتار</b></p>
          </div>
        `);
      }
    }).addTo(map);

    // إضافة الطبقة لقائمة التحكم بالطبقات في الخريطة (إن وجدت)
    if (typeof layerControl !== 'undefined') {
      layerControl.addOverlay(campusWallLayer, "سور الجامعة");
    }

  })
  .catch(error => console.error('حدث خطأ أثناء تحميل ملف السور:', error));
        // Default Layer Dictionary Palette
        const DEFAULT_LAYERS_DICT = [
            { id: 'construction', name: 'الإنشاءات والصيانة', color: '#ef4444', icon: 'fa-building' },
            { id: 'infrastructure', name: 'البنية التحتية', color: '#f59e0b', icon: 'fa-network-wired' },
            { id: 'education', name: 'البيئة التعليمية', color: '#10b981', icon: 'fa-graduation-cap' },
            { id: 'logistics', name: 'الخدمات اللوجستية', color: '#3b82f6', icon: 'fa-truck-ramp-box' },
            { id: 'roads', name: 'الطرق والبوابات', color: '#8b5cf6', icon: 'fa-road' },
            { id: 'general_site', name: 'الموقع العام', color: '#ec4899', icon: 'fa-map-location-dot' },
            { id: 'organizational', name: 'قائمة الأدلة التنظيمية', color: '#6366f1', icon: 'fa-book' },
            { id: 'digital_transform', name: 'قائمة التحول الرقمي', color: '#14b8a6', icon: 'fa-laptop-code' },
            { id: 'engineering_projects', name: 'قائمة المشروعات الهندسة', color: '#84cc16', icon: 'fa-compass-drafting' },
            { id: 'مظلة سيارات', name: 'مظلات السيارات', color: '#64748b', icon: 'fa-square-parking' },
            { id: 'مظلة طلاب', name: 'مظلات الطلاب', color: '#06b6d4', icon: 'fa-umbrella' },
            { id: 'layer_1791384461841', name: 'مباني ومرافق الجامعة', color: '#1e3a8a', icon: 'fa-building-columns' },
            { id: 'layer_1791395851126', name: 'التحول الرقمي', color: '#14b8a6', icon: 'fa-laptop-code' },
            { id: 'layer_1791397704911', name: 'الأدلة التنظيمية', color: '#6366f1', icon: 'fa-book' }
        ];

        let map, activeTileLayer, achievements = [];
        let detectedLayers = [];
        let activeLayers = new Set();
        let mapMarkers = {};
        let markersClusterGroup;

        const TILE_SERVERS = {
            satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: '&copy; Esri' }),
            streets: L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' })
        };

        document.addEventListener('DOMContentLoaded', () => {
            initMap();
            loadAchievementsFromJSON();
        });

        function initMap() {
            map = L.map('map', { center: [26.194457, 32.744322], zoom: 15, zoomControl: false });
            L.control.zoom({ position: 'bottomleft' }).addTo(map);
            
            // Set Default Map to Satellite
            activeTileLayer = TILE_SERVERS.satellite;
            activeTileLayer.addTo(map);

            // تهيئة مجموعة التجميع
            markersClusterGroup = L.markerClusterGroup({
                disableClusteringAtZoom: 18,
                spiderfyOnMaxZoom: true
            });
            map.addLayer(markersClusterGroup);
        }

        function toggleSection(bodyId, headerEl) {
            const body = document.getElementById(bodyId);
            body.classList.toggle('collapsed');
            headerEl.classList.toggle('collapsed');
        }

        function toggleSidebar(collapse) {
            const sidebar = document.getElementById('sidebar');
            const openBtn = document.getElementById('open-sidebar-btn');

            if (collapse) {
                sidebar.classList.add('collapsed');
                openBtn.style.display = 'flex';
            } else {
                sidebar.classList.remove('collapsed');
                openBtn.style.display = 'none';
            }

            setTimeout(() => {
                if (map) map.invalidateSize();
            }, 300);
        }

        function switchMapLayer(mode) {
            if (activeTileLayer) map.removeLayer(activeTileLayer);
            activeTileLayer = TILE_SERVERS[mode];
            activeTileLayer.addTo(map);
            document.getElementById('btn-streets').classList.toggle('active', mode === 'streets');
            document.getElementById('btn-satellite').classList.toggle('active', mode === 'satellite');
        }

        function loadAchievementsFromJSON() {
            fetch('data.json')
                .then(response => response.json())
                .then(data => {
                    achievements = data;
                    extractDynamicLayers();
                    renderLayerControls();
                    renderAchievementsList();
                    updateMapMarkers();
                })
                .catch(error => {
                    console.error('Error loading data.json:', error);
                });
        }

        // Dynamically detect layers present in data.json
        function extractDynamicLayers() {
            const usedLayerIds = new Set(achievements.map(a => a.layerId));
            detectedLayers = [];

            usedLayerIds.forEach(id => {
                const found = DEFAULT_LAYERS_DICT.find(l => l.id === id);
                if (found) {
                    detectedLayers.push(found);
                } else {
                    detectedLayers.push({
                        id: id,
                        name: id,
                        color: '#1e3a8a',
                        icon: 'fa-location-dot'
                    });
                }
            });

            activeLayers = new Set(detectedLayers.map(l => l.id));
        }

        function renderLayerControls() {
            const container = document.getElementById('layers-container');
            container.innerHTML = '';

            if (detectedLayers.length === 0) {
                container.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted); padding:4px;">لا توجد طبقات مضافة في الملف.</div>';
                document.getElementById('active-layers-count').innerText = 0;
                return;
            }

            detectedLayers.forEach(layer => {
                const count = achievements.filter(a => a.layerId === layer.id).length;
                const isChecked = activeLayers.has(layer.id);

                const item = document.createElement('div');
                item.className = 'layer-item';
                item.innerHTML = `
                    <div class="layer-info">
                        <span class="layer-color" style="background-color: ${layer.color}"></span>
                        <i class="fa-solid ${layer.icon}" style="color: ${layer.color}"></i>
                        <span>${layer.name} (${count})</span>
                    </div>
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleLayer('${layer.id}', this.checked)">
                `;
                container.appendChild(item);
            });
            document.getElementById('active-layers-count').innerText = activeLayers.size;
        }

        function renderAchievementsList() {
            const container = document.getElementById('achievements-container');
            container.innerHTML = '';
            const filtered = getFilteredAchievements();
            document.getElementById('total-count').innerText = filtered.length;

            if (filtered.length === 0) {
                container.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:10px;">لا توجد إنجازات مطابقة للبحث أو الفلتر.</div>';
                return;
            }

            filtered.forEach(item => {
                const layer = detectedLayers.find(l => l.id === item.layerId);
                const card = document.createElement('div');
                card.className = 'achievement-card';
                card.onclick = () => focusOnMap(item.id);
                card.innerHTML = `
                    <div class="title">${item.title}</div>
                    <div class="meta">
                        <span><i class="fa-solid fa-tag"></i> ${layer ? layer.name : ''}</span>
                        ${item.date ? `<span><i class="fa-regular fa-calendar"></i> ${item.date}</span>` : ''}
                    </div>
                `;
                container.appendChild(card);
            });
        }

        function getFilteredAchievements() {
    const searchText = document.getElementById('search-input') ? document.getElementById('search-input').value.trim().toLowerCase() : '';
    
    // التحقق من وجود عناصر التاريخ في HTML قبل قراءة قيمتها لمنع التوقف
    const startDateEl = document.getElementById('filter-start-date');
    const endDateEl = document.getElementById('filter-end-date');
    const startDate = startDateEl ? startDateEl.value : '';
    const endDate = endDateEl ? endDateEl.value : '';

    return achievements.filter(item => {
        const isLayerActive = activeLayers.has(item.layerId);
        const isDateValid = (!startDate || !item.date || item.date >= startDate) && (!endDate || !item.date || item.date <= endDate);
        
        // Search Filter
        let matchesSearch = true;
        if (searchText !== '') {
            const titleMatch = item.title && item.title.toLowerCase().includes(searchText);
            const descMatch = item.description && item.description.toLowerCase().includes(searchText);
            
            let customMatch = false;
            if (item.customFields && typeof item.customFields === 'object') {
                customMatch = Object.values(item.customFields).some(val => val && val.toString().toLowerCase().includes(searchText));
            }
            matchesSearch = titleMatch || descMatch || customMatch;
        }

        return isLayerActive && isDateValid && matchesSearch;
    });
}

        function filterData() {
            renderAchievementsList();
            updateMapMarkers();
        }

        function toggleLayer(layerId, isChecked) {
            if (isChecked) activeLayers.add(layerId);
            else activeLayers.delete(layerId);
            renderLayerControls();
            filterData();
        }

function toggleAllLayers() {
    // التحقق مما إذا كانت جميع الطبقات المفحوصة محددة حالياً
    const areAllSelected = detectedLayers.length > 0 && activeLayers.size === detectedLayers.length;

    if (areAllSelected) {
        // إذا كانت جميعها محددة، قم بإلغاء التحديد عن الجميع
        activeLayers.clear();
    } else {
        // إذا كانت هناك طبقات غير محددة، قم بتحديد جميع الطبقات
        detectedLayers.forEach(l => activeLayers.add(l.id));
    }

    renderLayerControls();
    filterData();
}

        function updateMapMarkers() {
            markersClusterGroup.clearLayers();
            mapMarkers = {};

            const filtered = getFilteredAchievements();
            filtered.forEach(item => {
                const layer = detectedLayers.find(l => l.id === item.layerId);
                const color = layer ? layer.color : '#1e3a8a';

                const customIcon = L.divIcon({
                    className: 'custom-map-pin',
                    html: `<div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px;"><i class="fa-solid ${layer ? layer.icon : 'fa-location-dot'}"></i></div>`,
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                });

                const marker = L.marker([item.lat, item.lng], { icon: customIcon });
                
                let imageHTML = item.image ? `<img src="${item.image}" alt="${item.title}" onerror="this.style.display='none';">` : '';
                let videoHTML = item.video ? `<video controls src="${item.video}"></video>` : '';
                let audioHTML = item.audio ? `<audio controls src="${item.audio}"></audio>` : '';
                let dateHTML = item.date ? `<div class="date"><i class="fa-regular fa-calendar"></i> ${item.date}</div>` : '';

let dynamicFieldsHTML = '';
if (item.customFields && typeof item.customFields === 'object') {
    Object.entries(item.customFields).forEach(([k, v]) => {
        if (v && v.toString().trim() !== '') {
            let textValue = v.toString();

            // تعبير نمطي (Regex) للتعرف على أي رابط داخل النص سواء كان يبدأ بـ http/https أو www
            const urlPattern = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;

            // تحويل الروابط المكتشفة داخل النص إلى عناصر <a> قابلة للنقر
            const formattedValue = textValue.replace(urlPattern, function(match) {
                const href = match.startsWith('www.') ? 'http://' + match : match;
                return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: #1e3a8a; font-weight: bold; text-decoration: underline;">${match} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.7rem;"></i></a>`;
            });

            dynamicFieldsHTML += `<div class="field-item"><span>${k}:</span> ${formattedValue}</div>`;
        }
    });
}

                const popupHTML = `
                    <div class="popup-card">
                        ${imageHTML}
                        ${videoHTML}
                        ${audioHTML}
                        <span class="layer-tag" style="background:${color}22; color:${color};">${layer ? layer.name : ''}</span>
                        <h4>${item.title}</h4>
                        <p>${item.description || ''}</p>
                        ${dynamicFieldsHTML}
                        ${dateHTML}
                    </div>
                `;
                marker.bindPopup(popupHTML);

                markersClusterGroup.addLayer(marker);
                mapMarkers[item.id] = marker;
            });
        }

        function focusOnMap(id) {
            const item = achievements.find(a => a.id === id);
            if (item && mapMarkers[id]) {
                // إغلاق الشريط الجانبي تلقائياً بعد اختيار إنجاز للتركيز على الخريطة عند استخدام الهاتف
                if (window.innerWidth <= 768) {
                    toggleSidebar(true);
                }

                markersClusterGroup.zoomToShowLayer(mapMarkers[id], () => {
                    mapMarkers[id].openPopup();
                });
            }
        }




