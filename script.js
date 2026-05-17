const roadsPath = 'data/roads.json';
const servicesPath = 'data/point.json';
const borderPath = 'data/border.json';
const RailwayPath = 'data/Railway.json';

let graph = {};
let edgeLengths = {};
let servicePoints = [];
let map, userLat, userLng;

let roadsLayer = L.layerGroup();
let servicePointsLayer = L.layerGroup();
let routeLayer = L.layerGroup();
let railwayLayer = L.layerGroup();
let borderLayer = L.layerGroup();

let userMarker = null;
let destinationMarker = null;

// متغيرات جديدة لتخزين المسار الأقصر والخدمة النهائية
let initialBestPath = []; 
let destinationService = null; 

// متغير لتتبع حالة العرض الحالية (0: الأقصر، 1-4: بدائل)
let currentRouteIndex = 0; 

// لتخزين نتائج المسارات البديلة (4 بدائل)
let alternateRouteCache = {
    1: null, 
    2: null,
    3: null, // المسار البديل الثالث
    4: null  // المسار البديل الرابع
};

const ALTERNATE_COLORS = {
    1: 'orange',
    2: 'red',
    3: 'purple',
    4: 'green' 
};


// متغير جديد لجمع جميع المصطلحات الفريدة للبحث عنها كاقتراحات
let allSearchableTerms = new Set();

const greenIcon = L.icon({
    iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-green.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});

const redIcon = L.icon({
    iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-red.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});

const serviceIconMap = {
    "مستشفي": { localImage: 'images/مستشفى.png' },
    "مدرسة ابتدائية": { localImage: 'images/school (1).png' },
    "مدرسة اعدادية": { localImage: 'images/school (2).png' },
    "مدرسة ثانوية": { localImage: 'images/school (3).png' },
    "مدرسة رياض اطفال": { localImage: 'images/school.png' },
    "مسجد": { localImage: 'images/مسجد.png' },
    "كنيسة": { localImage: 'images/كنيسة.png' },
    "نقطة إطفاء": { localImage: 'images/fire.png' },
    "نقطة إسعاف": { localImage: 'images/اسعاف.png' },
    "مكتب بريد": { localImage: 'images/بريد.png' },
    "شرطة": { localImage: 'images/شرطة.jpg' },
    "قصر ثقافة": { localImage: 'images/diocletian-palace.png' },
    "مركز شباب": { localImage: 'images/pennant.png' },
    "نادي رياضي": { localImage: 'images/club.png' },
    "معبد | متحف": { localImage: 'images/museum.png' },
    "مكتبة عامة": { localImage: 'images/public-library.png' },


    // أضف المزيد من الأنواع هنا مع مسارات صورك المحلية أو الألوان
};

function getRoadColor(fclass) {
    // قم بتحويل fclass إلى أحرف صغيرة للتأكد من المطابقة مع المفاتيح أدناه
    const lowerFclass = fclass.toLowerCase();

    switch (lowerFclass) {
        case 'motorway':
        case 'الطرق الإقليمية':
            return '#ff4d4d'; 
        case 'الطرق الشريانية':
            return '#ff4d4d';  
        case 'الطرق التجميعية':
            return '#000000';  
        case 'الطرق المحلية':
            return '#cccccc';  
        default:
            return 'gray'; 
    }
}

function getServiceIcon(type) {
    const iconConfig = serviceIconMap[type];
    let iconUrl;
    let iconOptions = {
        iconSize: [25, 15],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
    };

    if (iconConfig && iconConfig.localImage) {
        iconUrl = iconConfig.localImage;
    } else if (iconConfig && iconConfig.color) {
        iconUrl = `https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-${iconConfig.color}.png`;
    } else {
        iconUrl = `https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-grey.png`;
    }

    return L.icon({
        iconUrl: iconUrl,
        ...iconOptions
    });
}

function formatTime(minutes) {
    const totalSeconds = Math.round(minutes * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutesPart = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    let parts = [];
    if (hours > 0) parts.push(`${hours} ساعة`);
    if (minutesPart > 0) parts.push(`${minutesPart} دقيقة`);
    if (seconds > 0) parts.push(`${seconds} ثانية`);
    return parts.join(" و ");
}

function formatDistance(metersInput) { // غيرنا اسم المتغير ليكون أوضح
    const meters = Math.round(metersInput); // الآن هي قيمة بالمتر بالفعل، فقط نقوم بتقريبها
    const kmPart = Math.floor(meters / 1000);
    const mPart = meters % 1000;
    let parts = [];
    if (kmPart > 0) parts.push(`${kmPart} كم`);
    if (mPart > 0) parts.push(`${mPart} متر`);
    return parts.join(" و ");
}

function findClosestNode(x, y, nodes) {
    let minDist = Infinity, closest = null;
    for (const node of nodes) {
        const [nx, ny] = node.split(',').map(Number);
        const d = (nx - x) ** 2 + (ny - y) ** 2;
        if (d < minDist) {
            minDist = d;
            closest = node;
        }
    }
    return closest;
}

function togglePopup() {
    const popup = document.getElementById("info-popup");
    const overlay = document.getElementById("info-overlay");
    if (popup.style.display === "block") {
        popup.style.display = "none";
        overlay.style.display = "none";
    } else {
        popup.style.display = "block";
        overlay.style.display = "block";
    }
}

function getDirectionText(from, to) {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle >= -22.5 && angle < 22.5) return "شرقًا";
    if (angle >= 22.5 && angle < 67.5) return "شمال شرق";
    if (angle >= 67.5 && angle < 112.5) return "شمالًا";
    if (angle >= 112.5 && angle < 157.5) return "شمال غرب";
    if (angle >= 157.5 || angle < -157.5) return "غربًا";
    if (angle >= -157.5 && angle < -112.5) return "جنوب غرب";
    if (angle >= -112.5 && angle < -67.5) return "جنوبًا";
    if (angle >= -67.5 && angle < -22.5) return "جنوب شرق";
    return "";
}

function displayFeatureInfo(properties, title = "معلومات الميزة") {
    let infoHtml = `<h4>${title}</h4>`;
    infoHtml += '<table>';
    infoHtml += '<thead><tr><th>الحقل</th><th>القيمة</th></tr></thead>';
    infoHtml += '<tbody>';
    for (const key in properties) {
        if (properties.hasOwnProperty(key) && properties[key] !== null && properties[key] !== "" && key !== "FID") {
            infoHtml += `<tr><td><b>${key}</b></td><td>${properties[key]}</td></tr>`;
        }
    }
    infoHtml += '</tbody></table>';
    document.getElementById('info').innerHTML = infoHtml;
}

function displayServicePoints(filterValue) {
    servicePointsLayer.clearLayers();
    servicePoints.forEach(s => {
        if (filterValue === "all" || s.type === filterValue) {
            s.marker.addTo(servicePointsLayer);
        }
    });
}

// دالة البحث عن الخدمات (مُعدَّلة لإخفاء الاقتراحات وإعادة تعيين حالة المسار)
function searchServices() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    servicePointsLayer.clearLayers(); 

    let foundMarkers = []; 

    servicePoints.forEach(s => {
        const nameMatches = s.name.toLowerCase().includes(searchTerm);
        const typeMatches = s.type.toLowerCase().includes(searchTerm);

        if (nameMatches || typeMatches) {
            s.marker.addTo(servicePointsLayer);
            foundMarkers.push(s.marker); 
        }
    });

    const typeFilterSelect = document.getElementById('typeFilter');
    if (searchTerm) {
        typeFilterSelect.value = "all"; 
    } else {
        displayServicePoints(typeFilterSelect.value);
    }
    
    // إعادة تعيين حالة المسار عند البحث الجديد
    routeLayer.clearLayers(); 
    if (destinationMarker) map.removeLayer(destinationMarker);
    initialBestPath = [];
    destinationService = null;
    currentRouteIndex = 0;
    alternateRouteCache = { 1: null, 2: null, 3: null, 4: null };
    document.getElementById('findAlternateRouteBtn').style.display = 'none';
    
    if (servicePointsLayer.getLayers().length > 0) {
        document.getElementById('info').innerHTML = `<h4>نتائج البحث:</h4><p>تم العثور على ${servicePointsLayer.getLayers().length} نقطة خدمة مطابقة لبحثك.</p>`;
        
        const group = new L.featureGroup(foundMarkers);
        map.fitBounds(group.getBounds(), { padding: [50, 50] }); 

        if (userLat && userLng) {
            runRouting();
        } else {
            document.getElementById('info').innerHTML += '<br>الرجاء تحديد موقعك أولاً أو الضغط على "موقعي" لرسم المسار.';
        }

    } else {
        document.getElementById('info').innerHTML = `<h4>نتائج البحث:</h4><p>لم يتم العثور على أي نقطة خدمة مطابقة لبحثك.</p>`;
    }

    const suggestionsContainer = document.getElementById('suggestions-container');
    if (suggestionsContainer) {
        suggestionsContainer.style.display = 'none';
    }
}

// دالة جديدة لتحديث الاقتراحات
function updateSuggestions() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput.value.toLowerCase();
    let suggestionsContainer = document.getElementById('suggestions-container');

    // إذا لم يكن هناك حاوية للاقتراحات، قم بإنشائها
    if (!suggestionsContainer) {
        suggestionsContainer = document.createElement('div');
        suggestionsContainer.id = 'suggestions-container';
        searchInput.parentNode.insertBefore(suggestionsContainer, searchInput.nextSibling);
    }

    suggestionsContainer.innerHTML = ''; // مسح الاقتراحات القديمة

    if (searchTerm.length === 0) {
        suggestionsContainer.style.display = 'none'; // إخفاء الحاوية إذا كان حقل البحث فارغًا
        return;
    }

    const filteredSuggestions = Array.from(allSearchableTerms).filter(term =>
        term.startsWith(searchTerm)
    ).slice(0, 5); // عرض 5 اقتراحات فقط

    if (filteredSuggestions.length > 0) {
        suggestionsContainer.style.display = 'block';
        filteredSuggestions.forEach(suggestion => {
            const suggestionItem = document.createElement('div');
            suggestionItem.classList.add('suggestion-item');
            suggestionItem.textContent = suggestion;
            suggestionItem.addEventListener('click', () => {
                searchInput.value = suggestion;
                suggestionsContainer.style.display = 'none';
                searchServices(); // قم بتشغيل البحث فورًا عند اختيار الاقتراح
            });
            suggestionsContainer.appendChild(suggestionItem);
        });
    } else {
        suggestionsContainer.style.display = 'none';
    }
}


async function loadMap() {
    map = L.map('map').setView([25.696, 32.664], 13);

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    osmLayer.addTo(map);

    roadsLayer.addTo(map);
    servicePointsLayer.addTo(map);
    routeLayer.addTo(map);
        railwayLayer.addTo(map);
    borderLayer.addTo(map);

    const baseMaps = {
        "OSM": osmLayer,
        "Google earth": esriWorldImagery
    };

    L.control.layers(baseMaps).addTo(map);

    const [roadsData, servicesData, borderData, railwayData] = await Promise.all([
        fetch(roadsPath).then(res => res.json()),
        fetch(servicesPath).then(res => res.json()),
        fetch(borderPath).then(res => res.json()),
        fetch(RailwayPath).then(res => res.json())
    ]);

    L.geoJSON(borderData, {
        style: {
            color: 'purple',
            weight: 4
        },
        onEachFeature: function (feature, layer) {
            const name = feature.properties?.name || 'خط بدون اسم';
            layer.bindPopup(name);
            layer.on('click', function() {
                displayFeatureInfo(feature.properties || feature.attributes, `معلومات الحدود: ${name}`);
            });
        }
    }).addTo(borderLayer);

L.geoJSON(railwayData, {
    style: {
        color: '#2c3e50',       // لون رمادي غامق/أسود
        weight: 3,              // سمك الخط
        dashArray: '8, 6'       // خط متقطع ليمثل سكة حديد بشكل كارتوجرافي سليم
    },
    onEachFeature: function (feature, layer) {
        const name = feature.properties?.name || 'خط سكة حديد';
        layer.bindPopup(`🚂 ${name}`);
        layer.on('click', function() {
            displayFeatureInfo(feature.properties || feature.attributes, `معلومات السكة الحديد: ${name}`);
        });
    }
}).addTo(railwayLayer);

    roadsData.features.forEach(f => {
        const coords = f.geometry.paths?.[0] || f.geometry.coordinates;
        const props = f.attributes || f.properties;
        const totalTime = props.time || 1; // Assuming 'time' is driving time
        const totaltime_Walking_ = props.time_Walking_ || (props.length / (5000 / 60)); // Calculate walking time if not provided, assuming 5 km/h = 5000m/60min
        const totalLength = props.length || 0;
        const segments = coords.length - 1;
        const perSegmentTime = totalTime / segments;
        const perSegmentime_Walking_ = totaltime_Walking_ / segments;
        const perSegmentLength = totalLength / segments;

        const fclass = props.fclass || 'unknown';
        const roadColor = getRoadColor(fclass);

        const roadPolyline = L.polyline(coords.map(c => [c[1], c[0]]), {
            color: roadColor,
            weight: 3,
            opacity: 0.8
        });
        // ** هذا السطر حيوي لجعل مفتاح الخريطة يعمل بشكل صحيح **
        roadPolyline.feature = f;
        
        roadPolyline.addTo(roadsLayer);
        roadPolyline.on('click', function() {
            displayFeatureInfo(props, `معلومات الطريق: ${props.name || props.fclass || 'غير معروف'}`);
        });

        for (let i = 0; i < segments; i++) {
            const a = coords[i], b = coords[i + 1];
            const from = `${a[0]},${a[1]}`;
            const to = `${b[0]},${b[1]}`;
            if (!graph[from]) graph[from] = {};
            if (!graph[to]) graph[to] = {};
            // Modified: Store an object with drivingTime and walkingTime
            graph[from][to] = {
                drivingTime: perSegmentTime,
                walkingTime: perSegmentime_Walking_
            };
            graph[to][from] = { // Bidirectional
                drivingTime: perSegmentTime,
                walkingTime: perSegmentime_Walking_
            };
            edgeLengths[`${from}_${to}`] = perSegmentLength;
            edgeLengths[`${to}_${from}`] = perSegmentLength;
        }
    });

    const typesSet = new Set();
    servicePoints = servicesData.features.map(f => {
        let coord;
        if (f.geometry.coordinates) {
            coord = f.geometry.coordinates;
        } else if (f.geometry.x && f.geometry.y) {
            coord = [f.geometry.x, f.geometry.y];
        }
        const props = f.attributes || f.properties;
        const name = props?.Name || "خدمة";
        const type = props?.type || "غير معروف";
        const latlng = [coord[1], coord[0]];
        typesSet.add(type);

        // أضف اسم الخدمة ونوعها إلى قائمة المصطلحات القابلة للبحث
        allSearchableTerms.add(name.toLowerCase());
        allSearchableTerms.add(type.toLowerCase());
        
        const marker = L.marker(latlng, { icon: getServiceIcon(type) }).bindPopup(name);
        marker.on('click', function() {
            displayFeatureInfo(props, `معلومات الخدمة: ${name}`);
        });
        return { coord: latlng, name, type, marker: marker };
    });

    const typeSelect = document.getElementById("typeFilter");
    Array.from(typesSet).sort().forEach(type => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type;
        typeSelect.appendChild(option);
    });

    displayServicePoints('all');

    // تم تعديل مستمع حدث "typeFilter" لكي لا يتعارض مع البحث
    // اجعل هذا المستمع يستدعي displayServicePoints مباشرة
    document.getElementById("typeFilter").addEventListener("change", () => {
        const selectedType = document.getElementById("typeFilter").value;
        document.getElementById('searchInput').value = ''; // مسح حقل البحث عند تغيير الفلتر
        displayServicePoints(selectedType);
        
        // إعادة تعيين حالة المسار عند تغيير الفلتر
        routeLayer.clearLayers();
        if (destinationMarker) map.removeLayer(destinationMarker);
        initialBestPath = [];
        destinationService = null;
        currentRouteIndex = 0;
        alternateRouteCache = { 1: null, 2: null, 3: null, 4: null };
        document.getElementById('findAlternateRouteBtn').style.display = 'none';

        if (userLat && userLng) {
            runRouting();
        } else {
            document.getElementById('info').textContent = 'الرجاء تحديد موقعك أولاً أو الضغط على "موقعي".';
        }
    });

    setupLayerControls();

    // *** تم نقل استدعاء مفتاح الخريطة إلى هنا بعد تحميل جميع البيانات ***
    const mapLegendControl = generateMapLegendControl();
    mapLegendControl.addTo(map);
}


// ** دالة مساعدة جديدة لإنشاء الرسم البياني الموزون بزمن القيادة **
function createDrivingGraph(baseGraph) {
    let drivingGraph = {};
    for (const fromNode in baseGraph) {
        drivingGraph[fromNode] = {};
        for (const toNode in baseGraph[fromNode]) {
            drivingGraph[fromNode][toNode] = baseGraph[fromNode][toNode].drivingTime;
        }
    }
    return drivingGraph;
}


// ** دالة مساعدة لـ Dijkstra (مُعدَّلة لحساب الزمن الحقيقي) **
function findShortestPath(startNode, endNode, drivingGraphToUse) {
    let shortestPath = null;
    // تم إضافة متغيرين لحساب الزمن الحقيقي بغض النظر عن العقوبة
    let totalDrivingTime = 0;
    let totalDrivingTime_Penalty = 0; 
    let totalWalkingTime = 0;
    let totalLength = 0;

    try {
        // 1. استخدام مكتبة دايكسترا لإيجاد تسلسل العقد
        const path = dijkstra.find_path(drivingGraphToUse, startNode, endNode);
        
        // 2. حساب إجمالي الوقت والمسافة للمسار الناتج
        for (let i = 0; i < path.length - 1; i++) {
            const from = path[i], to = path[i + 1];
            
            // الوزن الذي تم استخدامه في الخوارزمية (قد يكون به عقوبة)
            totalDrivingTime_Penalty += drivingGraphToUse[from][to]; 
            
            // *** المفتاح: استخدام الرسم البياني الأصلي (graph) لحساب الزمن الحقيقي والمسافة ***
            const segmentDataOriginal = graph[from][to];
            totalDrivingTime += segmentDataOriginal.drivingTime; // الزمن الحقيقي
            totalWalkingTime += segmentDataOriginal.walkingTime;
            totalLength += edgeLengths[`${from}_${to}`] || 0;
        }

        shortestPath = path;

    } catch (e) {
        // المسار غير قابل للوصول
        console.warn('لا يمكن الوصول من:', startNode, 'إلى:', endNode, e);
    }
    
    // نُرجع totalDrivingTime (الزمن الحقيقي) للحسابات
    return { path: shortestPath, distDriving: totalDrivingTime, distWalking: totalWalkingTime, length: totalLength, distDriving_Penalty: totalDrivingTime_Penalty };
}


// ** دالة جديدة لعرض نتائج التوجيه (مُعدّلة لحل مشكلة #info) **
function displayRouteResult(routeData, color, title, isInitialRoute = false) {
    const latlngs = routeData.path.map(str => str.split(',').reverse().map(Number));
    
    routeLayer.clearLayers(); 
    if (destinationMarker) map.removeLayer(destinationMarker); 

    L.polyline(latlngs, { color: color, weight: 5, opacity: 0.8 }).addTo(routeLayer);
    map.fitBounds(latlngs, { padding: [50, 50] });

    if (routeData.service) { 
        destinationMarker = L.marker(routeData.service.coord, { icon: getServiceIcon(routeData.service.type) })
            .addTo(map)
            .bindPopup(`📌 ${routeData.service.name}`)
            .openPopup();
    }
    
    let timeNote = '';
    // ملاحظة: في المسار البديل، لا نحتاج لتحذير حول "الأوقات المبالغ فيها" لأننا الآن نعرض الزمن الحقيقي
    if (!isInitialRoute && color !== 'blue') {
        // إذا كان مساراً بديلاً، نذكر أنه أطول زمنياً من الافتراضي
        timeNote = ' ';
    }


    document.getElementById('info').innerHTML = `
        <h4>${title}: <b>${routeData.service.name}</b></h4>
        نوع الخدمة: <b>${routeData.service.type}</b><br>
        زمن الوصول التقريبي بالسيارة: <b>${formatTime(routeData.distDriving)}</b>${timeNote}<br>
        زمن الوصول التقريبي بالاقدام: <b>${formatTime(routeData.distWalking)}</b><br>
        المسافة التقريبية: <b>${formatDistance(routeData.length)}</b>
    `;
}


function setupLayerControls() {
    document.getElementById('toggleRoads').addEventListener('change', function() {
        if (this.checked) {
            map.addLayer(roadsLayer);
        } else {
            map.removeLayer(roadsLayer);
        }
    });

    document.getElementById('toggleServicePoints').addEventListener('change', function() {
        if (this.checked) {
            map.addLayer(servicePointsLayer);
        } else {
            map.removeLayer(servicePointsLayer);
        }
    });

    document.getElementById('toggleRoute').addEventListener('change', function() {
        if (this.checked) {
            map.addLayer(routeLayer);
        } else {
            map.removeLayer(routeLayer);
        }
    });

    document.getElementById('toggleBorder').addEventListener('change', function() {
        if (this.checked) {
            map.addLayer(borderLayer);
        } else {
            map.removeLayer(borderLayer);
        }
    });
}

function runRouting() {
    if (!userLat || !userLng) {
        document.getElementById('info').textContent = 'الرجاء تحديد موقعك أولاً.';
        routeLayer.clearLayers();
        if (destinationMarker) map.removeLayer(destinationMarker);
        initialBestPath = [];
        destinationService = null;
        currentRouteIndex = 0;
        alternateRouteCache = { 1: null, 2: null, 3: null, 4: null };
        document.getElementById('findAlternateRouteBtn').style.display = 'none';
        return;
    }

    const selectedType = document.getElementById("typeFilter").value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    let effectiveFilterType = null;
    let effectiveSearchTerm = null;

    if (selectedType !== "all") {
        effectiveFilterType = selectedType;
    } else if (searchTerm) {
        effectiveSearchTerm = searchTerm;
    } else {
        document.getElementById('info').textContent = 'الرجاء اختيار نوع خدمة محدد أو استخدام شريط البحث لتحديد أقرب نقطة.';
        routeLayer.clearLayers();
        if (destinationMarker) map.removeLayer(destinationMarker);
        initialBestPath = [];
        destinationService = null;
        currentRouteIndex = 0;
        alternateRouteCache = { 1: null, 2: null, 3: null, 4: null };
        document.getElementById('findAlternateRouteBtn').style.display = 'none';
        return;
    }

    const userNode = findClosestNode(userLng, userLat, Object.keys(graph));

    let best = { distDriving: Infinity, service: null, path: [] };

    // ** استخدام الدالة المساعدة لإنشاء الرسم البياني الموزون بالوقت **
    const drivingGraphForDijkstra = createDrivingGraph(graph);


    servicePoints.forEach(s => {
        let matchesFilter = false;
        if (effectiveFilterType && s.type === effectiveFilterType) {
            matchesFilter = true;
        } else if (effectiveSearchTerm) {
            const nameMatches = s.name.toLowerCase().includes(effectiveSearchTerm);
            const typeMatches = s.type.toLowerCase().includes(effectiveSearchTerm);
            matchesFilter = nameMatches || typeMatches;
        }

        if (!matchesFilter) return;

        const [lat, lng] = s.coord;
        const targetNode = findClosestNode(lng, lat, Object.keys(graph));

        // استخدام الدالة المساعدة
        const result = findShortestPath(userNode, targetNode, drivingGraphForDijkstra);


        if (result.path && result.distDriving < best.distDriving) {
            best = {
                distDriving: result.distDriving,
                distWalking: result.distWalking,
                length: result.length,
                service: s,
                path: result.path
            };
        }
    });

    if (best.path.length > 0) {
        initialBestPath = best.path; 
        destinationService = best.service; 
        
        // إعادة تعيين حالة المسار البديل وتخزين المسار الأقصر
        currentRouteIndex = 0; 
        alternateRouteCache = { 1: null, 2: null, 3: null, 4: null };
        
        displayRouteResult(best, 'blue', 'أقصر مسار(الافتراضي)', true);
        document.getElementById('findAlternateRouteBtn').style.display = 'block'; 

    } else {
        document.getElementById('info').textContent = 'لم يتم العثور على مسار مناسب لنوع الخدمة المحدد من موقعك الحالي.';
        initialBestPath = [];
        destinationService = null;
        currentRouteIndex = 0;
        alternateRouteCache = { 1: null, 2: null, 3: null, 4: null };
        document.getElementById('findAlternateRouteBtn').style.display = 'none';
    }
}


// ** دالة موحدة لحساب وعرض أي مسار بديل **
function calculateAndDisplayAlternate(alternateNum) {
    if (!initialBestPath || !destinationService) return;

    if (alternateRouteCache[alternateNum]) {
        // إذا كان مخزناً، اعرضه فوراً
        const cache = alternateRouteCache[alternateNum];
        displayRouteResult(cache, cache.color, `مسار بديل ${alternateNum}`, false); 
        return;
    }

    // **************** منطق الحساب الفعلي ****************
    
    const userNode = findClosestNode(userLng, userLat, Object.keys(graph));
    const [lat, lng] = destinationService.coord;
    const targetNode = findClosestNode(lng, lat, Object.keys(graph));

    // 1. إنشاء نسخة من الرسم البياني الأصلي لتطبيق العقوبة عليها
    let alternateGraph = JSON.parse(JSON.stringify(graph)); 
    const PENALTY = 1000; 

    // 2. تطبيق العقوبة على المسارات السابقة
    let pathsToPenalize = [initialBestPath]; // المسار الأقصر يعاقب دائماً
    
    // إضافة جميع المسارات البديلة التي تم حسابها مسبقاً للعقوبة
    for (let i = 1; i < alternateNum; i++) {
        if (alternateRouteCache[i]) {
            pathsToPenalize.push(alternateRouteCache[i].path);
        }
    }
    
    // تطبيق العقوبة
    pathsToPenalize.forEach(path => {
        for (let i = 0; i < path.length - 1; i++) {
            const from = path[i];
            const to = path[i + 1];
            
            // زيادة الوزن في كلا الاتجاهين
            if (alternateGraph[from] && alternateGraph[from][to]) {
                alternateGraph[from][to].drivingTime += PENALTY;
            }
            if (alternateGraph[to] && alternateGraph[to][from]) {
                alternateGraph[to][from].drivingTime += PENALTY;
            }
        }
    });

    // 3. تجهيز الرسم البياني الجديد لدايكسترا بعد تطبيق العقوبة
    const drivingAlternateGraphForDijkstra = createDrivingGraph(alternateGraph);

    // 4. إيجاد المسار البديل
    // سيجد المسار الأقصر في الرسم البياني المعاقب، ولكنه سيعيد الزمن الحقيقي
    const alternateResult = findShortestPath(userNode, targetNode, drivingAlternateGraphForDijkstra);
    
    if (alternateResult.path && alternateResult.path.length > 0) {
        
        // جلب بيانات المسار الأقصر الأصلي لإعادة العرض لاحقًا
        const drivingGraphForDijkstra = createDrivingGraph(graph);
        const currentBest = findShortestPath(userNode, targetNode, drivingGraphForDijkstra);

        // تخزين البيانات في الذاكرة المؤقتة
        const color = ALTERNATE_COLORS[alternateNum] || 'gray'; // استخدام الألوان المحددة
        alternateRouteCache[alternateNum] = { 
            ...alternateResult, 
            service: destinationService,
            color: color,
            initialDistDriving: currentBest.distDriving, 
            initialDistWalking: currentBest.distWalking, 
            initialLength: currentBest.length
        };

        // تغيير عنوان العرض هنا
        displayRouteResult(alternateRouteCache[alternateNum], color, `مسار بديل ${alternateNum}`, false);

    } else {
        document.getElementById('info').textContent = `تعذر العثور على المسار البديل ${alternateNum} المتاح.`;
    }
}


// ** الدالة الجديدة للتبديل بين المسارات الخمسة (Toggle) **
function toggleNextRoute() {
    if (!initialBestPath || !destinationService) {
        document.getElementById('info').textContent = 'الرجاء تحديد موقعك والبحث عن أقرب خدمة أولاً.';
        return;
    }

    // 1. حساب حالة العرض التالية (5 حالات: 0-4)
    currentRouteIndex = (currentRouteIndex + 1) % 5; 

    // 2. تحديث العرض حسب الحالة الجديدة
    if (currentRouteIndex === 0) {
        // الحالة 0: العودة إلى المسار الأقصر
        // نستخدم بيانات المسار البديل الأول المخزنة كمرجع للزمن الأقصر الحقيقي
        const best = { 
            distDriving: alternateRouteCache[1]?.initialDistDriving || 0,
            distWalking: alternateRouteCache[1]?.initialDistWalking || 0,
            length: alternateRouteCache[1]?.initialLength || 0,
            service: destinationService, 
            path: initialBestPath 
        };
        displayRouteResult(best, 'blue', 'أقصر مسار (الافتراضي)', true);
        
    } else {
        // الحالات 1 إلى 4: حساب وعرض المسار البديل N
        calculateAndDisplayAlternate(currentRouteIndex);
    }
}


document.getElementById("locateBtn").addEventListener("click", () => {
    document.getElementById('info').textContent = 'جارٍ تحديد موقعك...';
    navigator.geolocation.getCurrentPosition(pos => {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;

        if (userMarker) {
            map.removeLayer(userMarker);
        }

        userMarker = L.marker([userLat, userLng], { icon: greenIcon })
            .addTo(map)
            .bindPopup("📍 أنت هنا")
            .openPopup();

        map.setView([userLat, userLng], 15);
        runRouting();
    }, (error) => {
        console.error("خطأ في تحديد الموقع:", error);
        document.getElementById('info').textContent = 'تعذر تحديد موقعك. يرجى التأكد من تفعيل خدمات الموقع.';
    });
});

// إضافة مستمعي الأحداث لزر البحث وحقل الإدخال عند تحميل DOM
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchBtn').addEventListener('click', searchServices);
    
    // **ربط زر المسار البديل بالدالة الجديدة للتبديل**
    document.getElementById('findAlternateRouteBtn').addEventListener('click', toggleNextRoute);


    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', updateSuggestions); // استدعاء الدالة عند كل تغيير في الإدخال

    searchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            searchServices();
            // إخفاء الاقتراحات بعد البحث بالضغط على Enter
            const suggestionsContainer = document.getElementById('suggestions-container');
            if (suggestionsContainer) {
                suggestionsContainer.style.display = 'none';
            }
        } else if (event.key === 'Escape' || searchInput.value === '') {
            // إذا ضغط المستخدم على Esc أو مسح حقل البحث، أعد عرض جميع نقاط الخدمة
            const typeFilterSelect = document.getElementById("typeFilter");
            displayServicePoints(typeFilterSelect.value);
            document.getElementById('info').textContent = 'جارٍ تحميل الخريطة...'; // أو رسالة افتراضية أخرى
            routeLayer.clearLayers();
            if (destinationMarker) map.removeLayer(destinationMarker);
            initialBestPath = [];
            destinationService = null;
            currentRouteIndex = 0;
            alternateRouteCache = { 1: null, 2: null, 3: null, 4: null };
            document.getElementById('findAlternateRouteBtn').style.display = 'none';
            // إخفاء الاقتراحات عند مسح البحث أو Esc
            const suggestionsContainer = document.getElementById('suggestions-container');
            if (suggestionsContainer) {
                suggestionsContainer.style.display = 'none';
            }
        }
    });

    // إضافة مستمع لغلق الاقتراحات عند النقر خارجها
    document.addEventListener('click', (event) => {
        const suggestionsContainer = document.getElementById('suggestions-container');
        if (suggestionsContainer && !searchInput.contains(event.target) && !suggestionsContainer.contains(event.target)) {
            suggestionsContainer.style.display = 'none';
        }
    });

    // منطق التمدد والانقباض للأكورديون
    const accordionHeaders = document.querySelectorAll('.accordion-header');

    accordionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling; // المحتوى هو العنصر التالي للهيدر
            const toggleIcon = header.querySelector('.toggle-icon');

            // إغلاق جميع الأقسام الأخرى باستثناء القسم الحالي
            accordionHeaders.forEach(otherHeader => {
                if (otherHeader !== header) {
                    otherHeader.classList.remove('active');
                    otherHeader.nextElementSibling.style.display = 'none';
                    otherHeader.querySelector('.toggle-icon').style.transform = 'rotate(0deg)';
                }
            });

            // تبديل حالة القسم الحالي
            header.classList.toggle('active');
            if (content.style.display === 'block') {
                content.style.display = 'none';
                toggleIcon.style.transform = 'rotate(0deg)';
            } else {
                content.style.display = 'block';
                toggleIcon.style.transform = 'rotate(180deg)'; // تدوير السهم
            }
        });
    });

    // اختياري: افتح القسم الأول (البحث عن خدمة) عند التحميل
    // يمكنك تعديل هذا ليناسب تفضيلاتك
    const searchHeader = document.getElementById('searchHeader');
    if (searchHeader) {
        searchHeader.click(); // يحاكي النقر لفتحها
    }
});


function generateMapLegendControl() {
    const legend = L.control({ position: 'topleft' });

    legend.onAdd = function (map) {
        const div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = '<h4>مفتاح الخريطة:</h4>';

        // مفتاح الخدمات
        div.innerHTML += '<h5>:نقاط الخدمة</h5>';
        const uniqueServiceTypes = new Set(servicePoints.map(s => s.type));
        Array.from(uniqueServiceTypes).sort().forEach(type => {
            const iconConfig = serviceIconMap[type];
            let iconSrc;

            if (iconConfig && iconConfig.localImage) {
                iconSrc = iconConfig.localImage;
            } else if (iconConfig && iconConfig.color) {
                iconSrc = `https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-${iconConfig.color}.png`;
            } else {
                iconSrc = `https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-grey.png`;
            }

            div.innerHTML += `
                <div class="legend-item">
                    <img src="${iconSrc}" class="legend-icon" alt="${type}">
                    <span>${type}</span>
                </div>
            `;
        });

        // مفتاح الطرق
        div.innerHTML += '<h5>:الطرق</h5>';
        const roadClassesMap = { // تم التأكد من وجود جميع الفئات التي قد تكون في بياناتك
            'motorway': 'طريق سريع',
            'الطرق الإقليمية': 'طريق إقليمي',
            'الطرق الشريانية': 'طريق شرياني',
            'الطرق التجميعية': 'طريق تجميعي',
            'الطرق المحلية': 'طريق محلي',
            'trunk': 'طريق جذعي',
            'trunk_link': 'وصلة طريق جذعي',
            'unclassified': 'طريق غير مصنف',
            'residential': 'طريق سكني',
            'footway': 'ممر للمشاة',
            'track': 'طريق ترابي',
            'default': 'أخرى/غير معروف'
        };

        const uniqueRoadClasses = new Set();
        roadsLayer.eachLayer(layer => {
            const properties = layer.feature?.properties || layer.feature?.attributes;
            // التحويل إلى أحرف صغيرة ضروري هنا للمطابقة مع المفاتيح في roadClassesMap
            const fclass = (properties?.fclass || 'default').toLowerCase(); 
            uniqueRoadClasses.add(fclass);
        });

        const sortedRoadClasses = Array.from(uniqueRoadClasses).sort();
        // تأكد من أن 'default' يظهر دائمًا في النهاية إذا كان موجودًا
        if (sortedRoadClasses.includes('default')) {
            sortedRoadClasses.splice(sortedRoadClasses.indexOf('default'), 1);
            sortedRoadClasses.push('default');
        }

        sortedRoadClasses.forEach(fclass => {
            const color = getRoadColor(fclass); // fclass هنا سيكون بأحرف صغيرة
            const displayName = roadClassesMap[fclass] || roadClassesMap['default'];
            div.innerHTML += `
                <div class="legend-item">
                    <div class="legend-color-box" style="background-color: ${color};"></div>
                    <span>${displayName}</span>
                </div>
            `;
        });

        // مفتاح الحدود
        div.innerHTML += '<h5>:الحدود</h5>';
        div.innerHTML += `
            <div class="legend-item">
                <div class="legend-color-box" style="background-color: purple;"></div>
                <span>حدود المنطقة</span>
            </div>
        `;
        
        // مفتاح المسار البديل (5 مسارات)
        div.innerHTML += '<h5>:المسارات</h5>';
        div.innerHTML += `
            <div class="legend-item">
                <div class="legend-color-box" style="background-color: blue;"></div>
                <span>أقصر مسار (الافتراضي)</span>
            </div>
            <div class="legend-item">
                <div class="legend-color-box" style="background-color: ${ALTERNATE_COLORS[1]};"></div>
                <span>المسار البديل 1</span>
            </div>
            <div class="legend-item">
                <div class="legend-color-box" style="background-color: ${ALTERNATE_COLORS[2]};"></div>
                <span>المسار البديل 2</span>
            </div>
            <div class="legend-item">
                <div class="legend-color-box" style="background-color: ${ALTERNATE_COLORS[3]};"></div>
                <span>المسار البديل 3</span>
            </div>
            <div class="legend-item">
                <div class="legend-color-box" style="background-color: ${ALTERNATE_COLORS[4]};"></div>
                <span>المسار البديل 4</span>
            </div>
        `;


        return div;
    };
    return legend;
}

loadMap();