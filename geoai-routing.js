// geoai-routing.js - وحدة التوجيه الذكي المستقلة
const GEOAI_API_URL = "https://diesel-mode-invitation-cal.trycloudflare.com/api";

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
    // استخراج خطوط الطول والعرض سواء كانت كائنات Leaflet أو عادية
    const uLat = userCoords.lat !== undefined ? userCoords.lat : userCoords[0];
    const uLng = userCoords.lng !== undefined ? userCoords.lng : userCoords[1];
    const fLat = facilityCoords.lat !== undefined ? facilityCoords.lat : facilityCoords[0];
    const fLng = facilityCoords.lng !== undefined ? facilityCoords.lng : facilityCoords[1];

    const response = await fetch(`${GEOAI_API_URL}/get-smart-route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: [uLat, uLng],
        destination: [fLat, fLng]
      })
    });

    if (!response.ok) {
      throw new Error(`Server returned status: ${response.status}`);
    }

    const routeData = await response.json();

    // إزالة أي مسار ذكي سابق إن وجد
    if (smartRouteLayer && map.hasLayer(smartRouteLayer)) {
      map.removeLayer(smartRouteLayer);
    }

    // رسم المسار الذكي بلون أزرق وتصميم متقطع يبرز أنه مسار AI
    smartRouteLayer = L.geoJSON(routeData.geojson, {
      style: {
        color: "#2563eb",
        weight: 6,
        opacity: 0.9,
        dashArray: "4, 8"
      }
    }).addTo(map);

    // تكبير الخريطة لتشمل كامل المسار
    map.fitBounds(smartRouteLayer.getBounds(), { padding: [40, 40] });

    smartRouteLayer.bindPopup(`
      <div style="direction: rtl; text-align: right; font-family: sans-serif;">
        <b style="color: #2563eb;">مسار GeoAI الذكي ⚡</b><br>
        <b>الوجهة:</b> ${facilityName || "الخدمة المحددة"}<br>
        <b>الزمن المتوقع:</b> ${routeData.eta_minutes} دقيقة
      </div>
    `).openPopup();

    // بدء رصد الرحلة للتعلّم المستمر
    startTripMonitoring({ lat: fLat, lng: fLng });

  } catch (err) {
    console.error("GeoAI Engine error:", err);
    alert("تعذر جلب المسار الذكي. تأكد من عمل سيرفر بايثون ونفق Cloudflare.");
  }
}

// إنشاء اسم بديل متطابق لـ script.js (يحل خطأ Uncaught ReferenceError: fetchSmartRoute)
const fetchSmartRoute = requestSmartRoute;

// 2. مراقبة حركة المستخدم وحساب زمن الوصول الفعلي
function startTripMonitoring(destination) {
  activeTrip.startTime = Date.now();

  if (!navigator.geolocation) return;

  if (activeTrip.trackingId) {
    navigator.geolocation.clearWatch(activeTrip.trackingId);
  }

  activeTrip.trackingId = navigator.geolocation.watchPosition((position) => {
    const currentLat = position.coords.latitude;
    const currentLng = position.coords.longitude;

    const dist = map.distance([currentLat, currentLng], [destination.lat, destination.lng]);
    if (dist <= 30) {
      completeTrip();
    }
  }, null, { enableHighAccuracy: true });
}

// 3. إرسال التغذية العكسية للنموذج ليتعلم تلقائياً
async function completeTrip() {
  if (activeTrip.trackingId) {
    navigator.geolocation.clearWatch(activeTrip.trackingId);
    activeTrip.trackingId = null;
  }

  const totalDurationSec = (Date.now() - activeTrip.startTime) / 1000;
  const currentHour = new Date().getHours();

  try {
    await fetch(`${GEOAI_API_URL}/feedback-trip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actual_duration_seconds: totalDurationSec,
        length_m: 1200,
        hour: currentHour,
        is_tourist_zone: 1
      })
    });
    console.log("GeoAI: Trip completed and feedback processed for online learning.");
  } catch (err) {
    console.warn("Could not submit feedback to GeoAI:", err);
  }
}
