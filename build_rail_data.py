# build_rail_data.py （グラフ最短経路探索による分岐・途切れ完全解消版）
import os
import re
import json
import math
import heapq
import zipfile
import urllib.request
from collections import defaultdict
import geopandas as gpd
from shapely.geometry import LineString, MultiLineString, GeometryCollection, Point
from shapely.ops import unary_union

N05_ZIP_URLS = [
    "https://nlftp.mlit.go.jp/ksj/gml/data/N05/N05-23/N05-23_GML.zip",
    "https://nlftp.mlit.go.jp/ksj/gml/data/N05/N05-22/N05-22_GML.zip",
    "https://nlftp.mlit.go.jp/ksj/gml/data/N05/N05-21/N05-21_GML.zip"
]

WORK_DIR = "./n05_work"
OUTPUT_JSON = "./rail_master_n05.json"
SIMPLIFY_TOLERANCE = 0.00008
ACTIVE_BUFFER_DEG = 0.006  # 約600m

MOJIBAKE_PATTERN = re.compile(
    r'[\u0080-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u2026\u2030\u2039\u203a\u20ac\u2122]+'
)

def decode_mojibake_chunk(chunk):
    buf = bytearray()
    for ch in chunk:
        code = ord(ch)
        if 0x80 <= code <= 0xFF:
            buf.append(code)
        else:
            try:
                buf.extend(ch.encode("cp1252"))
            except Exception:
                return chunk
    try:
        return bytes(buf).decode("utf-8")
    except Exception:
        return bytes(buf).decode("utf-8", errors="replace")

def clean_str(val):
    s = str(val or "").strip()
    if not s:
        return ""
    return MOJIBAKE_PATTERN.sub(lambda m: decode_mojibake_chunk(m.group(0)), s)


def download_and_extract():
    os.makedirs(WORK_DIR, exist_ok=True)
    zip_path = os.path.join(WORK_DIR, "N05_GML.zip")

    if not os.path.exists(zip_path):
        print("1/4: 国土数値情報（鉄道時系列データ N05）をダウンロードしています...")
        req_headers = {"User-Agent": "Mozilla/5.0"}
        for url in N05_ZIP_URLS:
            try:
                req = urllib.request.Request(url, headers=req_headers)
                with urllib.request.urlopen(req, timeout=120) as res, open(zip_path, "wb") as out:
                    out.write(res.read())
                break
            except Exception as e:
                print(f"  別バージョンを試します ({e})")

    sec_geojson, st_geojson = None, None
    sec_shp, st_shp = None, None
    for root, _, files in os.walk(WORK_DIR):
        for f in files:
            low = f.lower()
            full = os.path.join(root, f)
            if "railroadsection" in low:
                if low.endswith(".geojson"):
                    sec_geojson = full
                elif low.endswith(".shp"):
                    sec_shp = full
            elif "station" in low:
                if low.endswith(".geojson"):
                    st_geojson = full
                elif low.endswith(".shp"):
                    st_shp = full

    if not (sec_geojson or sec_shp):
        print("2/4: ZIPファイルを展開しています...")
        with zipfile.ZipFile(zip_path, "r") as z:
            z.extractall(WORK_DIR)
        for root, _, files in os.walk(WORK_DIR):
            for f in files:
                low = f.lower()
                full = os.path.join(root, f)
                if "railroadsection" in low:
                    if low.endswith(".geojson"):
                        sec_geojson = full
                    elif low.endswith(".shp"):
                        sec_shp = full
                elif "station" in low:
                    if low.endswith(".geojson"):
                        st_geojson = full
                    elif low.endswith(".shp"):
                        st_shp = full

    return (sec_geojson or sec_shp), (st_geojson or st_shp)


def safe_int(val, default=9999):
    try:
        return int(str(val).strip()[:4])
    except Exception:
        return default


def flatten_to_linestrings(geom_list):
    flat = []
    for g in geom_list:
        if g is None or g.is_empty:
            continue
        if isinstance(g, LineString):
            if len(g.coords) >= 2:
                flat.append(g)
        elif isinstance(g, (MultiLineString, GeometryCollection)):
            flat.extend(flatten_to_linestrings(g.geoms))
    return flat


def build_track_graph_and_extract(comp_name, line_name, target_geoms, st_candidates, is_abandoned, end_yr, min_start_yr, suffix_label=""):
    lines = flatten_to_linestrings(target_geoms)
    if not lines:
        return None

    # 1. グリッドを 1/25000度（約4.5m精度）に高精細化し、元の滑らかな曲線座標をそのまま保持する（カクカク完全防止！）
    SNAP_GRID = 25000

    def to_node(x, y):
        return (int(round(x * SNAP_GRID)), int(round(y * SNAP_GRID)))

    node_coords = {}  # node_id -> (lng, lat) ※丸めず元の精密座標を保存
    adj = defaultdict(dict)

    for ls in lines:
        # 廃線の曲線美を損なわないよう、simplifyはごく僅か（0.00003度 ≒ 約3m）に抑える
        simp = ls.simplify(0.00003, preserve_topology=True)
        coords = list(simp.coords)
        if len(coords) < 2:
            continue

        # 駅スナップ用の頂点補間も、元の曲線頂点をすべて維持したまま長い直線（500m以上）のみ中間点を入れる
        dense_coords = [coords[0]]
        for i in range(len(coords) - 1):
            x1, y1 = coords[i]
            x2, y2 = coords[i + 1]
            dist = math.hypot(x2 - x1, y2 - y1)
            steps = max(1, int(dist / 0.004))  # 約400m以上の長い直線のみ分割
            for s in range(1, steps + 1):
                t = s / steps
                dense_coords.append((x1 + (x2 - x1) * t, y1 + (y2 - y1) * t))

        prev_n = to_node(*dense_coords[0])
        if prev_n not in node_coords:
            node_coords[prev_n] = dense_coords[0]

        for pt in dense_coords[1:]:
            cur_n = to_node(*pt)
            if cur_n not in node_coords:
                node_coords[cur_n] = pt
            if cur_n != prev_n:
                x1, y1 = node_coords[prev_n]
                x2, y2 = node_coords[cur_n]
                w = math.hypot(x2 - x1, y2 - y1)
                if cur_n not in adj[prev_n] or w < adj[prev_n][cur_n]:
                    adj[prev_n][cur_n] = w
                    adj[cur_n][prev_n] = w
                prev_n = cur_n

    if not node_coords:
        return None

    # 2. 線路の端点がほんの少し離れている箇所をブリッジ接続
    all_nodes = list(node_coords.keys())
    endpoint_nodes = [n for n in all_nodes if len(adj[n]) <= 1]
    for u in endpoint_nodes:
        ux, uy = node_coords[u]
        best_v = None
        best_d = 0.0032  # 最大約320mまでの微小な途切れを自動接続
        for v in all_nodes:
            if u == v or v in adj[u]:
                continue
            vx, vy = node_coords[v]
            d = math.hypot(vx - ux, vy - uy)
            if d < best_d:
                best_d = d
                best_v = v
        if best_v is not None:
            adj[u][best_v] = best_d * 1.5
            adj[best_v][u] = best_d * 1.5

    # 3. 各駅を最も近いグラフノードに紐づける（最大約1.5km以内）
    valid_stations = []
    node_to_station = defaultdict(list)

    # 同名駅が複数ある場合は最新(endYear最大)のものを優先
    st_by_name = defaultdict(list)
    for st in st_candidates:
        st_by_name[st["name"]].append(st)

    for st_name, st_group in st_by_name.items():
        st_group.sort(key=lambda x: x["endYear"], reverse=True)
        best_st = None
        best_n = None
        best_d = 0.015  # 約1.5km

        for st in st_group:
            sx, sy = st["lng"], st["lat"]
            for n, (nx, ny) in node_coords.items():
                d = math.hypot(nx - sx, ny - sy)
                if d < best_d:
                    best_d = d
                    best_n = n
                    best_st = st

        if best_st is not None and best_n is not None:
            node_to_station[best_n].append(st_name)
            valid_stations.append({
                "name": st_name,
                "lat": best_st["lat"],
                "lng": best_st["lng"],
                "endYear": best_st["endYear"],
                "node": best_n
            })

    if len(valid_stations) < 2:
        if len(lines[0].coords) >= 2:
            path = [[round(float(y), 5), round(float(x), 5)] for x, y in lines[0].coords]
            return {
                "id": f"{comp_name}_{line_name}_{end_yr}{suffix_label}",
                "name": f"{comp_name} {line_name}".strip() + suffix_label,
                "company": comp_name,
                "lineName": line_name,
                "isAbandoned": is_abandoned,
                "startYear": min_start_yr,
                "endYear": end_yr,
                "stations": valid_stations,
                "segments": [{"from": "起点", "to": "終点", "path": path}]
            }
        return None

    # 4. 各駅から線路グラフ上で「途中に他の駅を挟まずに到達できる隣接駅」をDijkstra探索で特定
    st_coord_lookup = {s["name"]: (s["lat"], s["lng"]) for s in valid_stations}
    segments_out = []
    seen_pairs = set()
    station_adj = defaultdict(list)

    for st in valid_stations:
        start_name = st["name"]
        start_node = st["node"]

        dist_map = {start_node: 0.0}
        parent = {start_node: None}
        pq = [(0.0, start_node)]

        while pq:
            d, u = heapq.heappop(pq)
            if d > dist_map.get(u, float("inf")):
                continue
            if d > 0.8:  # 最大約80kmまで探索許容
                continue

            # u に別の駅が存在するかチェック
            hit_stations = [s_nm for s_nm in node_to_station.get(u, []) if s_nm != start_name]
            if hit_stations:
                for target_name in hit_stations:
                    pair_key = tuple(sorted([start_name, target_name]))
                    if pair_key not in seen_pairs:
                        seen_pairs.add(pair_key)
                        cur = u
                        raw_nodes = []
                        while cur is not None:
                            raw_nodes.append(cur)
                            cur = parent[cur]
                        raw_nodes.reverse()

                        path_coords = [[st_coord_lookup[start_name][0], st_coord_lookup[start_name][1]]]
                        for n_id in raw_nodes[1:-1]:
                            nx, ny = node_coords[n_id]
                            pt = [round(float(ny), 5), round(float(nx), 5)]
                            if pt != path_coords[-1]:
                                path_coords.append(pt)
                        end_pt = [st_coord_lookup[target_name][0], st_coord_lookup[target_name][1]]
                        if end_pt != path_coords[-1]:
                            path_coords.append(end_pt)

                        segments_out.append({
                            "from": start_name,
                            "to": target_name,
                            "path": path_coords
                        })
                        station_adj[start_name].append(target_name)
                        station_adj[target_name].append(start_name)

                # 【重要】開始ノード自身（u == start_node）に別駅が重なっていた場合は探索を止めずに隣へ進める！
                # 離れたノード（u != start_node）で別駅に到達した場合のみ、その駅の向こう側への探索を止める
                if u != start_node:
                    continue

            for v, w in adj[u].items():
                nd = d + w
                if nd < dist_map.get(v, float("inf")):
                    dist_map[v] = nd
                    parent[v] = u
                    heapq.heappush(pq, (nd, v))

    if not segments_out:
        return None

    # 5. 駅の並び順を、端の駅（次数1の起点駅）からDFS順で綺麗に整列させる
    endpoints = [s["name"] for s in valid_stations if len(station_adj[s["name"]]) == 1]
    start_st_name = endpoints[0] if endpoints else valid_stations[0]["name"]

    ordered_names = []
    visited_st = set()

    def dfs_order(u_name):
        visited_st.add(u_name)
        ordered_names.append(u_name)
        for v_name in station_adj[u_name]:
            if v_name not in visited_st:
                dfs_order(v_name)

    dfs_order(start_st_name)
    for s in valid_stations:
        if s["name"] not in visited_st:
            dfs_order(s["name"])

    st_dict = {s["name"]: {k: v for k, v in s.items() if k != "node"} for s in valid_stations}
    stations_out = [st_dict[nm] for nm in ordered_names if nm in st_dict]

    base_name = f"{comp_name} {line_name}".strip() if comp_name not in line_name else line_name
    display_name = f"{base_name}{suffix_label}"

    return {
        "id": f"{comp_name}_{line_name}_{end_yr}{suffix_label}",
        "name": display_name,
        "company": comp_name,
        "lineName": line_name,
        "isAbandoned": is_abandoned,
        "startYear": min_start_yr,
        "endYear": end_yr,
        "stations": stations_out,
        "segments": segments_out
    }


def build_dataset(sec_path, st_path):
    print(f"3/4: 路線曲線と駅データを読み込んでいます...\n  路線: {sec_path}\n  駅  : {st_path}")
    gdf_sec = gpd.read_file(sec_path)
    gdf_st = gpd.read_file(st_path)

    line_sections = defaultdict(list)
    line_max_end_year = defaultdict(int)
    line_start_year = defaultdict(lambda: 9999)

    for _, row in gdf_sec.iterrows():
        line_name = clean_str(row.get("N05_002"))
        comp_name = clean_str(row.get("N05_003"))
        if not line_name or row.geometry is None or row.geometry.is_empty:
            continue

        s_yr = safe_int(row.get("N05_005b"), 1950)
        e_yr = safe_int(row.get("N05_005e"), 9999)

        key = (comp_name, line_name)
        line_sections[key].append((e_yr, row.geometry))
        if e_yr > line_max_end_year[key]:
            line_max_end_year[key] = e_yr
        if s_yr < line_start_year[key]:
            line_start_year[key] = s_yr

    # 駅の集約（小数点2桁の粗い丸めを廃止し、駅名＋路線ごとに最新レコードを正確に保持！）
    line_stations = defaultdict(list)
    for _, row in gdf_st.iterrows():
        line_name = clean_str(row.get("N05_002"))
        comp_name = clean_str(row.get("N05_003"))
        st_name = clean_str(row.get("N05_011"))
        if not line_name or not st_name or row.geometry is None or row.geometry.is_empty:
            continue

        e_yr = safe_int(row.get("N05_005e"), 9999)
        key = (comp_name, line_name)
        pt = row.geometry.centroid

        line_stations[key].append({
            "name": st_name,
            "lat": round(float(pt.y), 5),
            "lng": round(float(pt.x), 5),
            "endYear": e_yr
        })

    print("4/4: 線路グラフ探索により本線・支線・部分廃止区間を精密構築しています...")
    output_lines = []

    for key, sec_list in line_sections.items():
        comp_name, line_name = key
        min_start_yr = line_start_year[key]
        max_end_yr = line_max_end_year[key]
        all_sts = line_stations.get(key, [])

        # 現役路線（max_end_yr == 9999）の場合
        active_geoms = [g for yr, g in sec_list if yr == 9999]
        abandoned_by_year = defaultdict(list)
        for yr, g in sec_list:
            if yr < 9999:
                abandoned_by_year[yr].append(g)

        active_union_buf = None
        if active_geoms:
            # 現役路線では現在営業中の駅（endYear == 9999）のみを採用し、駅名改称前の旧駅名（石狩当別・石狩太美など）の混入を防ぐ
            active_sts = [s for s in all_sts if s["endYear"] == 9999] or all_sts
            entry = build_track_graph_and_extract(
                comp_name, line_name, active_geoms, active_sts,
                is_abandoned=False, end_yr=9999, min_start_yr=min_start_yr, suffix_label=""
            )
            if entry:
                output_lines.append(entry)
            active_union_buf = unary_union(active_geoms).buffer(ACTIVE_BUFFER_DEG)

        if abandoned_by_year:
            if not active_geoms:
                max_yr = max(abandoned_by_year.keys())
                all_ab_geoms = [g for _, g in sec_list]
                entry = build_track_graph_and_extract(
                    comp_name, line_name, all_ab_geoms, all_sts,
                    is_abandoned=True, end_yr=max_yr, min_start_yr=min_start_yr,
                    suffix_label=f" (〜{max_yr}廃止)"
                )
                if entry:
                    output_lines.append(entry)
            else:
                for ab_yr, geoms in sorted(abandoned_by_year.items()):
                    truly_abandoned_geoms = []
                    for g in geoms:
                        diff = g.difference(active_union_buf)
                        if not diff.is_empty and diff.length > 0.008:
                            # diff ではなく元の滑らかなジオメトリ g を渡すことで削り跡のカクカクを防ぐ！
                            truly_abandoned_geoms.extend(flatten_to_linestrings([g]))

                    if not truly_abandoned_geoms:
                        continue

                    ab_sts = [s for s in all_sts if s["endYear"] == ab_yr or s["endYear"] == 9999]
                    entry = build_track_graph_and_extract(
                        comp_name, line_name, truly_abandoned_geoms, ab_sts,
                        is_abandoned=True, end_yr=ab_yr, min_start_yr=min_start_yr,
                        suffix_label=f" (〜{ab_yr}部分廃止)"
                    )
                    if entry:
                        output_lines.append(entry)

    output_lines.sort(key=lambda x: (x["isAbandoned"], x["name"]))

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump({"version": "N05_v5", "lines": output_lines}, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\n完了しました！ -> {OUTPUT_JSON}")
    for kw in ["鶴見線", "南武線", "江ノ島線"]:
        for x in output_lines:
            if kw in x["name"] and not x["isAbandoned"]:
                segs_str = ", ".join([f"{s['from']}-{s['to']}" for s in x["segments"][:8]])
                print(f"  確認 [{x['name']}] 全{len(x['segments'])}区間 (駅数:{len(x['stations'])}): {segs_str} ...")


if __name__ == "__main__":
    sec_p, st_p = download_and_extract()
    build_dataset(sec_p, st_p)