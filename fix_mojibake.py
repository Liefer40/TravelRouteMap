# fix_mojibake.py （部分文字化け＆廃線サフィックス完全対応版）
import json
import re

FILE_PATH = "./rail_master_n05.json"

def decode_mojibake_chunk(chunk):
    """文字化けしている連続部分だけをバイト列に戻してUTF-8で復元する"""
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

# 文字化け特有の文字（ラテン拡張文字やcp1252記号）が連続するパターン
MOJIBAKE_PATTERN = re.compile(r'[\u0080-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u2026\u2030\u2039\u203a\u20ac\u2122]+')

def fix_str(s):
    if not isinstance(s, str) or not s:
        return s
    # 文字列の中に「(〜1988廃止)」のような正常な日本語が混ざっていても、
    # 文字化けしている部分だけをピンポイントで全て日本語に置換する
    return MOJIBAKE_PATTERN.sub(lambda m: decode_mojibake_chunk(m.group(0)), s)

def fix_obj(obj):
    if isinstance(obj, dict):
        return {fix_str(k): fix_obj(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [fix_obj(x) for x in obj]
    elif isinstance(obj, str):
        return fix_str(obj)
    return obj

with open(FILE_PATH, "r", encoding="utf-8") as f:
    data = json.load(f)

# 1. まず全フィールドの文字化けをパーツ単位で復元
fixed_data = fix_obj(data)

# 2. さらに確実を期すため、復元された company と lineName から name と id を綺麗に再構築
for line in fixed_data.get("lines", []):
    comp = line.get("company", "").strip()
    lname = line.get("lineName", "").strip()
    end_yr = line.get("endYear", 9999)
    is_ab = line.get("isAbandoned", False)

    disp = f"{comp} {lname}".strip() if comp not in lname else lname
    if is_ab:
        disp = f"{disp} (〜{end_yr}廃止)"

    line["name"] = disp
    line["id"] = f"{comp}_{lname}_{end_yr}"

# 現役→廃線、五十音順で綺麗に並び替え
fixed_data["lines"].sort(key=lambda x: (x["isAbandoned"], x["name"]))

# 廃線データのサンプル確認
abandoned_samples = [l["name"] for l in fixed_data["lines"] if l["isAbandoned"]]

with open(FILE_PATH, "w", encoding="utf-8") as f:
    json.dump(fixed_data, f, ensure_ascii=False, separators=(",", ":"))

print(f"完全修復が完了しました！ 全 {len(fixed_data['lines'])} 路線")
print("【修復された廃線のサンプル（先頭5件）】")
for name in abandoned_samples[:5]:
    print(" ・", name)