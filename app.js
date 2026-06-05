// 1. عرض تاريخ التحديث الحالي في الهيدر
document.getElementById('current-time').innerText = `تاريخ التحديث: ${new Date().toLocaleDateString('ar-EG')}`;

// 2. بناء الخريطة التفاعلية وضبط مركز العرض الافتراضي على مدينة الأقصر
const map = L.map('map').setView([25.69, 32.65], 13); 

// إعداد خريطة الأساس من نوع الصور الجوية المضيئة الفاتحة لـ Esri
const satelliteMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { 
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS' 
}).addTo(map);

const darkMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap &copy; CARTO' });
const lightMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' });

L.control.layers({ "مرئية القمر الصناعي": satelliteMap, "الخريطة الداكنة": darkMap, "خريطة الشوارع": lightMap }, null, { position: 'topright' }).addTo(map);

// 3. مسارات ملفات الـ JSON المشتركة داخل مجلد data
const servicesPointsUrl = 'data/services_points.json'; 
const coveragePolygonsUrl = 'data/services_coverage.json'; 

let extractedServicesData = {}; 
let currentPointsLayer = L.layerGroup().addTo(map);
let currentCoverageLayer = L.layerGroup().addTo(map);
let coverageChart, populationChart;

// تسجيل الملحق الخاص بإظهار الـ Labels المئوية داخل الرسوم البيانية
Chart.register(ChartDataLabels);

// دالة مساعدة مخصصة لإضافة الفواصل العادية للأرقام الإنجليزية القياسية (مثل 142,375) منعا لظهور الأرقام العربية
function formatEnglishNumber(num) {
    if (num === null || num === undefined) return "-";
    return num.toString().replace(/\B(?=(\d3)+(?!\d))/g, ",");
}

// 4. دالة جلب وقراءة ملف نقاط الخدمات واكتشاف الأنواع بالكامل
function loadServicesPoints() {
    fetch(servicesPointsUrl)
        .then(response => response.json())
        .then(geoJsonData => {
            extractedServicesData = {}; 
            currentPointsLayer.clearLayers();
            
            geoJsonData.features.forEach(feature => {
                if (feature.properties) {
                    const type = feature.properties.service_type || "خدمات غير مصنفة";
                    if (!extractedServicesData[type]) {
                        extractedServicesData[type] = { 
                            count: 0, 
                            servedPop: null, unservedPop: null,
                            servedArea: null, unservedArea: null 
                        };
                    }
                    extractedServicesData[type].count += 1;
                }
            });

            updateDropdownFilters();
            loadUnifiedCoverageData();
        })
        .catch(err => console.error("خطأ أثناء معالجة البيانات الجغرافية:", err));
}

// 5. قراءة ملف النطاقات الموحد (Polygons) وتجميع الحقول الأربعة الصارمة
function loadUnifiedCoverageData() {
    fetch(coveragePolygonsUrl)
        .then(response => response.json())
        .then(polygonData => {
            polygonData.features.forEach(feature => {
                if (feature.properties) {
                    const type = feature.properties.service_type || feature.properties.Service_type;
                    
                    if (extractedServicesData[type]) {
                        const sPop = parseInt(feature.properties.served_population);
                        const uPop = parseInt(feature.properties.unserved_population);
                        const sArea = parseFloat(feature.properties.served_area);
                        const uArea = parseFloat(feature.properties.unserved_area);

                        if (!isNaN(sPop)) extractedServicesData[type].servedPop = (extractedServicesData[type].servedPop || 0) + sPop;
                        if (!isNaN(uPop)) extractedServicesData[type].unservedPop = (extractedServicesData[type].unservedPop || 0) + uPop;
                        if (!isNaN(sArea)) extractedServicesData[type].servedArea = (extractedServicesData[type].servedArea || 0) + sArea;
                        if (!isNaN(uArea)) extractedServicesData[type].unservedArea = (extractedServicesData[type].unservedArea || 0) + uArea;
                    }
                }
            });
            renderDashboardElements("all");
        })
        .catch(() => {
            renderDashboardElements("all");
        });
}

// 6. دالة تحديث الفلتر الجانبي
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

// 7. دالة تصفية وعرض مضلعات التغطية على الخريطة تبعاً للاختيار
function updateMapCoverage(filterType) {
    currentCoverageLayer.clearLayers(); 
    if (filterType === "all") return; 

    fetch(coveragePolygonsUrl)
        .then(response => response.json())
        .then(polygonData => {
            const polyLayer = L.geoJSON(polygonData, {
                filter: function(feature) {
                    const type = feature.properties.service_type || feature.properties.Service_type;
                    return type === filterType;
                },
                style: function (feature) {
                    const sArea = parseFloat(feature.properties.served_area) || 0;
                    const uArea = parseFloat(feature.properties.unserved_area) || 0;
                    if (sArea > 0 && uArea === 0) return { color: '#10b981', weight: 2, fillOpacity: 0.35 }; 
                    if (uArea > 0 && sArea === 0) return { color: '#ef4444', weight: 2, fillOpacity: 0.4 };  
                    return { color: '#38bdf8', weight: 2, fillOpacity: 0.3 }; 
                },
                onEachFeature: function (feature, layer) {
                    const type = feature.properties.service_type || feature.properties.Service_type;
                    const sPop = feature.properties.served_population !== null ? formatEnglishNumber(feature.properties.served_population) : "-";
                    const uPop = feature.properties.unserved_population !== null ? formatEnglishNumber(feature.properties.unserved_population) : "-";
                    layer.bindPopup(`<b>نوع الخدمة:</b> ${type}<br><b>مخدومين:</b> ${sPop}<br><b>محرومين:</b> ${uPop}`);
                }
            }).addTo(currentCoverageLayer);

            if (polyLayer.getBounds().isValid()) {
                map.fitBounds(polyLayer.getBounds());
            }
        });
}

// 8. دالة تعبئة الجدول وتصفيته بالكامل بالصيغة الرقمية الإنجليزية القياسية وبدون العمود الأخير
function renderDashboardElements(filterType = "all") {
    const tbody = document.querySelector("#data-table tbody");
    tbody.innerHTML = "";
    currentPointsLayer.clearLayers(); 

    // جلب وتصفية نقاط الخدمات على الخريطة
    fetch(servicesPointsUrl)
        .then(response => response.json())
        .then(geoJsonData => {
            const pointsJsonLayer = L.geoJSON(geoJsonData, {
                pointToLayer: function (feature, latlng) {
                    return L.circleMarker(latlng, { radius: 5.5, fillColor: '#ef4444', color: '#fff', weight: 1.2, fillOpacity: 0.9 });
                },
                filter: function(feature) {
                    if (filterType === "all") return true;
                    return feature.properties.service_type === filterType;
                },
                onEachFeature: function (feature, layer) {
                    const type = feature.properties.service_type || "خدمات غير مصنفة";
                    const name = feature.properties.Name || "منشأة بدون اسم";
                    layer.bindPopup(`<b>نوع الخدمة:</b> ${type}<br><b>اسم المنشأة:</b> ${name}`);
                }
            }).addTo(currentPointsLayer);

            if (filterType !== "all" && pointsJsonLayer.getBounds().isValid()) {
                map.fitBounds(pointsJsonLayer.getBounds());
            }
        });

    let totalServedPop = 0, totalUnservedPop = 0;
    let totalServedArea = 0, totalUnservedArea = 0;
    let hasValidChartData = false;
    let rowCounter = 1;

    Object.keys(extractedServicesData).forEach(type => {
        if (filterType !== "all" && type !== filterType) return;

        const info = extractedServicesData[type];
        
        let servedPopText = "-";
        let unservedPopText = "-";
        let servedAreaText = "-";
        let unservedAreaText = "-";
        let coveragePercentText = "-";

        if (info.servedPop !== null && info.unservedPop !== null) {
            totalServedPop += info.servedPop;
            totalUnservedPop += info.unservedPop;
            if (info.servedArea !== null) totalServedArea += info.servedArea;
            if (info.unservedArea !== null) totalUnservedArea += info.unservedArea;
            hasValidChartData = true;

            // استخدام الدالة الجديدة لفرض كتابة الأرقام بالصيغة الإنجليزية المنسقة بفواصل
            servedPopText = formatEnglishNumber(info.servedPop);
            unservedPopText = formatEnglishNumber(info.unservedPop);
            servedAreaText = info.servedArea !== null ? info.servedArea.toFixed(2) : "-";
            unservedAreaText = info.unservedArea !== null ? info.unservedArea.toFixed(2) : "-";
            
            const totalPop = info.servedPop + info.unservedPop;
            if (totalPop > 0) {
                const coveragePercent = ((info.servedPop / totalPop) * 100).toFixed(1);
                coveragePercentText = `${coveragePercent}%`;
            }
        }

        // بناء أسطر الجدول وحذف حقل مستوى العجز الجانبي تماماً
        const row = `<tr>
            <td><span class="index-badge">${rowCounter++}</span></td>
            <td style="text-align: right; font-weight: 600; color: var(--accent-color);">${type}</td>
            <td style="font-weight: bold;">${info.count}</td>
            <td>${servedAreaText}</td>
            <td>${unservedAreaText}</td>
            <td>${servedPopText}</td>
            <td>${unservedPopText}</td>
            <td style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${coveragePercentText}</td>
        </tr>`;
        tbody.innerHTML += row;
    });

    if (hasValidChartData && (totalServedPop > 0 || totalUnservedPop > 0)) {
        updateCharts(totalServedPop, totalUnservedPop, totalServedArea, totalUnservedArea);
    } else {
        if (coverageChart) coverageChart.destroy();
        if (populationChart) populationChart.destroy();
    }
}

document.getElementById('service-type').addEventListener('change', function(e) {
    const selected = e.target.value;
    renderDashboardElements(selected);
    updateMapCoverage(selected);
});

// 9. دالة تحديث الرسوم البيانية لتعرض النسب المئوية (%) بشكل دائم ومقروء بالصيغة الموحدة
function updateCharts(servedPop, unservedPop, servedArea, unservedArea) {
    if (coverageChart) coverageChart.destroy();
    if (populationChart) populationChart.destroy();

    const totalArea = servedArea + unservedArea;
    const servedAreaPercent = totalArea > 0 ? ((servedArea / totalArea) * 100).toFixed(1) : 0;
    const unservedAreaPercent = (100 - servedAreaPercent).toFixed(1);

    const totalPop = servedPop + unservedPop;
    const servedPopPercent = totalPop > 0 ? ((servedPop / totalPop) * 100).toFixed(1) : 0;
    const unservedPopPercent = (100 - servedPopPercent).toFixed(1);

    const datalabelsOptions = {
        formatter: (value) => {
            return `${value}%`; 
        },
        color: '#fff',
        font: { family: 'Cairo', weight: 'bold', size: 12 }
    };

    const ctx1 = document.getElementById('coverageChart').getContext('2d');
    coverageChart = new Chart(ctx1, {
        type: 'doughnut',
        data: {
            labels: ['كتلة مخدومة', 'كتلة محرومة'],
            datasets: [{ data: [servedAreaPercent, unservedAreaPercent], backgroundColor: ['#10b981', '#ef4444'], borderWidth: 0 }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { position: 'bottom', labels: { color: '#f8fafc', font: { family: 'Cairo' } } },
                datalabels: datalabelsOptions
            } 
        }
    });

    const ctx2 = document.getElementById('populationChart').getContext('2d');
    populationChart = new Chart(ctx2, {
        type: 'pie',
        data: {
            labels: ['سكان مخدومين', 'سكان محرومين'],
            datasets: [{ data: [servedPopPercent, unservedPopPercent], backgroundColor: ['#38bdf8', '#f59e0b'], borderWidth: 0 }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { position: 'bottom', labels: { color: '#f8fafc', font: { family: 'Cairo' } } },
                datalabels: datalabelsOptions
            } 
        }
    });
}

function resetFilters() {
    document.getElementById('service-type').value = "all";
    renderDashboardElements("all");
    currentCoverageLayer.clearLayers();
    map.setView([25.69, 32.65], 13);
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
loadServicesPoints();