// geoai-routing.js - كود مستقل تماماً
const GEOAI_API_URL = "https://your-geoai-service.onrender.com/api";

let activeTrip = {
  trackingId: null,
  startTime: null,
  startCoords: null,
  targetFacility: null
};

let smartRouteLayer = null;

// 1. دالة طلب المسار الذكي وعرضه على الخريطة
async function requestSmartRoute(userCoords, facilityCoords, facilityName) {
  try {
    const response = await fetch(`${GEOAI_API_URL}/get-smart-route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: [userCoords.lat, userCoords.lng],
        destination: [facilityCoords.lat, facilityCoords.lng],
        timestamp: new Date().toISOString()
      })
    });

    const routeData = await response.json();

    // إزالة أي مسار ذكي سابق إن وجد
    if (smartRouteLayer && map.hasLayer(smartRouteLayer)) {
      map.removeLayer(smartRouteLayer);
    }

    // رسم المسار الذكي بلون مميز فوق الخريطة دون لمس الطبقات الأخرى
    smartRouteLayer = L.geoJSON(routeData.geojson, {
      style: {
        color: "#2563eb", // لون أزرق مميز
        weight: 6,
        opacity: 0.85,
        dashArray: "1, 8" // خط ديناميكي يبرز أنه مسار AI
      }
    }).addTo(map);

    smartRouteLayer.bindPopup(`
      <b>مسار GeoAI الذكي</b><br>
      الوجهة: ${facilityName}<br>
      الزمن التقديري المتوقع: ${routeData.eta_minutes} دقيقة
    `).openPopup();

    // بدء رصد الرحلة للتعلّم المستمر
    startTripMonitoring(userCoords, facilityCoords, routeData.route_id);

  } catch (err) {
    console.warn("GeoAI Engine fallback to standard routing:", err);
  }
}

// 2. مراقبة حركة المستخدم وحساب زمن الوصول الفعلي
function startTripMonitoring(start, destination, routeId) {
  activeTrip.startTime = Date.now();
  
  // تتبع موقع المستخدم
  activeTrip.trackingId = navigator.geolocation.watchPosition((position) => {
    const currentLat = position.coords.latitude;
    const currentLng = position.coords.longitude;
    
    // فحص المسافة بين المستخدم والوجهة (إذا وصل ضمن نطاق 30 متراً)
    const dist = map.distance([currentLat, currentLng], [destination.lat, destination.lng]);
    if (dist < 30) {
      completeTrip(routeId);
    }
  }, null, { enableHighAccuracy: true });
}

// 3. إرسال التغذية العكسية للنموذج ليتعلم تلقائياً
async function completeTrip(routeId) {
  navigator.geolocation.clearWatch(activeTrip.trackingId);
  const totalDurationSec = (Date.now() - activeTrip.startTime) / 1000;

  await fetch(`${GEOAI_API_URL}/feedback-trip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      route_id: routeId,
      actual_duration_seconds: totalDurationSec
    })
  });
  
  console.log("Trip data sent to GeoAI engine for online learning.");
}