from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from river import linear_model, preprocessing
import networkx as nx
import numpy as np
import datetime
import uvicorn

app = FastAPI(title="Luxor GeoAI Routing Engine")

# تفعيل CORS للسماح لخريطتك على Netlify بالاتصال بالخادم
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. بناء شبكة طرق تجريبية تحاكي محاور الأقصر الرئيسية كـ Spatial Graph
G = nx.Graph()
G.add_edge("station", "corniche", length=1200, lanes=2, is_tourist=1)
G.add_edge("corniche", "karnak", length=2500, lanes=3, is_tourist=1)
G.add_edge("station", "hospital", length=800, lanes=2, is_tourist=0)
G.add_edge("hospital", "karnak", length=2000, lanes=1, is_tourist=0)

# إحداثيات تقريبية للعقد (Lat, Lon)
node_coords = {
    "station": (25.6985, 32.6421),
    "corniche": (25.7001, 32.6350),
    "hospital": (25.6920, 32.6380),
    "karnak": (25.7188, 32.6573)
}

# 2. نموذج التعلم الآلي المستمر (Online Incremental Learning Pipeline)
ai_pipeline = preprocessing.StandardScaler() | linear_model.LinearRegression()

# نماذج البيانات (Pydantic Models)
class RouteRequest(BaseModel):
    origin: List[float]       # [lat, lng]
    destination: List[float]  # [lat, lng]

class FeedbackRequest(BaseModel):
    actual_duration_seconds: float
    length_m: float
    hour: int
    is_tourist_zone: int

@app.post("/api/get-smart-route")
def get_smart_route(req: RouteRequest):
    now = datetime.datetime.now()
    hour = now.hour
    
    # تحديث أوزان الـ Graph ديناميكياً باستخدام نموذج الـ AI
    for u, v, data in G.edges(data=True):
        features = {
            'length_m': data['length'],
            'hour_sin': np.sin(2 * np.pi * hour / 24.0),
            'hour_cos': np.cos(2 * np.pi * hour / 24.0),
            'is_tourist': data['is_tourist']
        }
        # التنبؤ بزمن العبور بالثواني، وفي حال بداية التشغيل يعتمد على السرعة التصميمية
        pred_time = ai_pipeline.predict_one(features)
        if pred_time is None or pred_time <= 0:
            pred_time = data['length'] / (35 * 1000 / 3600)  # 35 كم/س افتراضية
        
        data['weight'] = pred_time

    # حساب أقصر مسار زمني ديناميكي
    path = nx.shortest_path(G, source="station", target="hospital", weight='weight')
    total_time_sec = nx.path_weight(G, path, weight='weight')

    # تجهيز إحداثيات المسار بصيغة GeoJSON
    coords = [[node_coords[node][1], node_coords[node][0]] for node in path]

    geojson_response = {
        "eta_minutes": round(total_time_sec / 60, 1),
        "geojson": {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": coords
            },
            "properties": {"path_nodes": path}
        }
    }
    return geojson_response

@app.post("/api/feedback-trip")
def feedback_trip(data: FeedbackRequest):
    features = {
        'length_m': data.length_m,
        'hour_sin': np.sin(2 * np.pi * data.hour / 24.0),
        'hour_cos': np.cos(2 * np.pi * data.hour / 24.0),
        'is_tourist': data.is_tourist_zone
    }
    # التعلم التراكمي وتحديث أوزان النموذج لحظياً
    ai_pipeline.learn_one(features, data.actual_duration_seconds)
    return {"status": "Model successfully updated with crowd probe"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)