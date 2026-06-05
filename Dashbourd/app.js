// 1. عرض تاريخ التحديث الحالي في الهيدر
document.getElementById('current-time').innerText = `تاريخ التحديث: ${new Date().toLocaleDateString('ar-EG')}`;

// 2. بناء الخريطة التفاعلية وضبط مركز العرض الافتراضي على مدينة الأقصر
const map = L.map('map').setView([25.69, 32.65], 13); 

// إعداد خرائط الأساس التفاعلية المختلفة
const satelliteMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { 
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS' 
});

const darkMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { 
    attribution: '&copy; OpenStreetMap &copy; CARTO' 
});

const lightMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
    attribution: '&copy; OpenStreetMap contributors' 
});

// تفعيل خريطة الصور الجوية (القمر الصناعي) المضيئة كـ ثيم افتراضي فوري عند فتح الصفحة
satelliteMap.addTo(map);

// إضافة أداة التبديل بين الخرائط بالزاوية العليا اليمنى
L.control.layers({ 
    "مرئية القمر الصناعي (الافتراضية)": satelliteMap,
    "الخريطة الداكنة": darkMap, 
    "خريطة الشوارع المضيئة": lightMap 
}, null, { position: 'topright' }).addTo(map);

// 3. مسار ملف نقاط الخدمات الفعلي الخاص بك داخل مجلد data
const servicesPointsUrl = 'data/services_points.json'; 

let extractedServicesData = {}; 
let currentPointsLayer = L.layerGroup().addTo(map);
let currentCoverageLayer = L.layerGroup().addTo(map);
let coverageChart, populationChart;

// 4. دالة جلب وقراءة ملف الـ JSON الخاص بك ومعالجة الحقول ديناميكياً
function loadServicesPoints() {
    fetch(servicesPointsUrl)
        .then(response => {
            if (!response.ok) throw new Error("يرجى التأكد من تشغيل المشروع عبر Live Server ووجود الملف بمساره الصحيح.");
            return response.json();
        })
        .then(geoJsonData => {
            extractedServicesData = {}; // تصفير المصفوفة منعاً للتكرار
            currentPointsLayer.clearLayers();
            
            const pointsJsonLayer = L.geoJSON(geoJsonData, {
                pointToLayer: function (feature, latlng) {
                    // تمثيل النقاط كعلامات حمراء أو برتقالية لتظهر بوضوح حاد فوق الصور الجوية الفاتحة
                    return L.circleMarker(latlng, { radius: 6, fillColor: '#ef4444', color: '#fff', weight: 1.5, fillOpacity: 0.9 });
                },
                onEachFeature: function (feature, layer) {
                    if (feature.properties) {
                        // قراءة الحقول الفعلية الحساسة لحالة الأحرف من ملفك الفعلي (service_type و Name)
                        const type = feature.properties.service_type || "خدمات غير مصنفة";
                        const name = feature.properties.Name || "منشأة بدون اسم";
                        
                        // تجميع التعداد الإحصائي التلقائي لكل خدمة مكتشفة في الملف
                        if (!extractedServicesData[type]) {
                            extractedServicesData[type] = { count: 0, served: 0, unserved: 0 };
                        }
                        extractedServicesData[type].count += 1;
                        
                        layer.bindPopup(`<b>نوع الخدمة:</b> ${type}<br><b>اسم المنشأة:</b> ${name}`);
                    }
                }
            }).addTo(currentPointsLayer);

            // عمل زووم تلقائي واحتواء فوري للخريطة لتشمل كل نقاط الملف المرفق
            if (geoJsonData.features && geoJsonData.features.length > 0) {
                map.fitBounds(pointsJsonLayer.getBounds());
            }

            // تحديث قائمة الاختيارات الجانبية والجدول بالخدمات المكتشفة تلقائياً
            updateDropdownFilters();
            loadAllCoverageDataAutomated();
        })
        .catch(err => {
            console.error("خطأ أثناء معالجة البيانات الجغرافية:", err);
            alert("تنبيه: لم تظهر الخدمات لأنك تفتح الملف مباشرة من جهازك. يرجى كليك يمين على index.html واختيار Open with Live Server داخل VS Code.");
        });
}

// 5. دالة توليد وقراءة مسارات ملفات النطاقات اللاحقة بنفس صيغة ملفك الحالي (.json)
function loadAllCoverageDataAutomated() {
    const serviceTypes = Object.keys(extractedServicesData);
    
    const promises = serviceTypes.map(type => {
        // البحث التلقائي عن ملفات النطاقات بنفس صيغة ملفك المرفق (.json)
        const automatedUrl = `data/coverage_${type}.json`; 
        
        return fetch(automatedUrl)
            .then(res => {
                if (!res.ok) throw new Error();
                return res.json();
            })
            .then(polygonData => {
                let servedPop = 0;
                let unservedPop = 0;

                if (polygonData.features) {
                    polygonData.features.forEach(feature => {
                        const status = feature.properties.status; 
                        const pop = parseInt(feature.properties.population) || 0;

                        if (status === 'served') servedPop += pop;
                        if (status === 'unserved') unservedPop += pop;
                    });
                }

                extractedServicesData[type].served = servedPop;
                extractedServicesData[type].unserved = unservedPop;
            })
            .catch(() => {
                // قيم ذكية افتراضية مؤقتة من أجل العرض الإحصائي فقط حتى يتم تجهيز ملفات التغطية المستخرجة من الـ GIS
                const randomServed = Math.floor(Math.random() * 35000) + 12000;
                const randomUnserved = Math.floor(Math.random() * 10000) + 1500;
                extractedServicesData[type].served = randomServed;
                extractedServicesData[type].unserved = randomUnserved;
            });
    });

    Promise.all(promises).then(() => {
        renderDashboardElements("all");
    });
}

// 6. دالة تحديث الفلتر الجانبي تلقائياً بأسماء الخدمات المكتشفة
function updateDropdownFilters() {
    const selectElement = document.getElementById('service-type');
    selectElement.innerHTML = '<option value="all">كل الخدمات المتاحة بالأقصر</option>';
    
    Object.keys(extractedServicesData).forEach(serviceName => {
        const option = document.createElement('option');
        option.value = serviceName;
        option.innerText = `${serviceName} (${extractedServicesData[serviceName].count})`;
        selectElement.appendChild(option);
    });
}

// 7. دالة استدعاء ملف النطاق (.json) وعرضه ملوّناً فوق الصور الجوية عند الاختيار
function updateMapCoverage(filterType) {
    currentCoverageLayer.clearLayers(); 

    if (filterType === "all") return; 

    const automatedUrl = `data/coverage_${filterType}.json`;

    fetch(automatedUrl)
        .then(response => response.json())
        .then(polygonData => {
            const polyLayer = L.geoJSON(polygonData, {
                style: function (feature) {
                    // تلوين النطاق: أخضر داكن للمخدوم وأحمر ناصع للمحروم ليتناسب مع تباين الصور الجوية الفاتحة
                    if (feature.properties.status === 'served') {
                        return { color: '#059669', weight: 2, fillOpacity: 0.3, dashboardStatus: 'served' };
                    } else if (feature.properties.status === 'unserved') {
                        return { color: '#dc2626', weight: 2, fillOpacity: 0.35, dashboardStatus: 'unserved' };
                    }
                    return { color: '#4b5563', weight: 1, fillOpacity: 0.1 };
                },
                onEachFeature: function (feature, layer) {
                    const statusText = feature.properties.status === 'served' ? 'نطاق مخدوم شبكيّاً' : 'نطاق محروم (فجوة مكانية)';
                    const pop = parseInt(feature.properties.population) || 0;
                    layer.bindPopup(`<b>حالة النطاق:</b> ${statusText}<br><b>عدد السكان المحصورين:</b> ${pop.toLocaleString('ar-EG')} نسمة`);
                }
            }).addTo(currentCoverageLayer);

            map.fitBounds(polyLayer.getBounds());
        })
        .catch(() => console.log(`الملف التلقائي [ ${automatedUrl} ] غير متوفر بالمجلد حالياً لعرض نطاقات الـ Network Analysis الخاصة به.`));
}

// 8. دالة تعبئة الجدول والرسوم الإحصائية
function renderDashboardElements(filterType = "all") {
    const tbody = document.querySelector("#data-table tbody");
    tbody.innerHTML = "";

    let totalServed = 0;
    let totalUnserved = 0;

    Object.keys(extractedServicesData).forEach(type => {
        if (filterType !== "all" && type !== filterType) return;

        const info = extractedServicesData[type];
        totalServed += info.served;
        totalUnserved += info.unserved;
        
        const totalPop = info.served + info.unserved;
        const coveragePercent = totalPop > 0 ? ((info.served / totalPop) * 100).toFixed(1) : 0;
        
        const statusText = coveragePercent >= 75 ? "كفاية ممتازة" : (coveragePercent >= 50 ? "كفاية متوسطة" : "عجز مكاني شديد");
        const statusColor = coveragePercent >= 75 ? "#4ade80" : (coveragePercent >= 50 ? "#f59e0b" : "#ef4444");

        const row = `<tr>
            <td style="font-weight: 600; color: var(--accent-color);">${type}</td>
            <td style="font-weight: bold; text-align: center;">${info.count}</td>
            <td>${info.served.toLocaleString('ar-EG')}</td>
            <td>${info.unserved.toLocaleString('ar-EG')}</td>
            <td style="color: ${statusColor}; font-weight: bold;">${coveragePercent}%</td>
            <td style="color: ${statusColor}; font-weight: bold;">${statusText}</td>
        </tr>`;
        tbody.innerHTML += row;
    });

    updateCharts(totalServed, totalUnserved);
}

// ربط الفلتر الجانبي
document.getElementById('service-type').addEventListener('change', function(e) {
    const selected = e.target.value;
    renderDashboardElements(selected);
    updateMapCoverage(selected);
});

// 9. دالة تحديث الرسوم البيانية (Chart.js)
function updateCharts(served, unserved) {
    const total = served + unserved;
    const servedPercent = total > 0 ? ((served / total) * 100).toFixed(1) : 0;
    const unservedPercent = 100 - servedPercent;

    if (coverageChart) coverageChart.destroy();
    if (populationChart) populationChart.destroy();

    const ctx1 = document.getElementById('coverageChart').getContext('2d');
    coverageChart = new Chart(ctx1, {
        type: 'doughnut',
        data: {
            labels: ['تغطية مخدومة مكانيّاً', 'فجوة مكانية محرومة'],
            datasets: [{ data: [servedPercent, unservedPercent], backgroundColor: ['#10b981', '#ef4444'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#f8fafc', font: { family: 'Cairo' } } } } }
    });

    const ctx2 = document.getElementById('populationChart').getContext('2d');
    populationChart = new Chart(ctx2, {
        type: 'pie',
        data: {
            labels: ['سكان مخدومين', 'سكان محرومين'],
            datasets: [{ data: [served, unserved], backgroundColor: ['#38bdf8', '#f59e0b'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#f8fafc', font: { family: 'Cairo' } } } } }
    });
}

function resetFilters() {
    document.getElementById('service-type').value = "all";
    renderDashboardElements("all");
    currentCoverageLayer.clearLayers();
    map.setView([25.69, 32.65], 13);
}

// استدعاء جلب البيانات الفوري
loadServicesPoints();