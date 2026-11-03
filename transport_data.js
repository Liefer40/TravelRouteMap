  // =========================================================
  // ストレージキー
  // =========================================================
  const STORAGE_KEY          = 'japan_muni_travel_log_v1';
  const RAIL_SEG_STORAGE_KEY = 'japan_rail_segments_log_v1';
  const RAIL_ST_STORAGE_KEY  = 'japan_rail_stations_log_v1';
  const AIR_STORAGE_KEY      = 'japan_air_travel_log_v1';
  const SEA_STORAGE_KEY      = 'japan_sea_travel_log_v1';
  const BUS_STORAGE_KEY      = 'japan_bus_travel_log_v1';

  const TOPOJSON_SOURCES = {
    s0010: [
      'https://cdn.jsdelivr.net/gh/smartnews-smri/japan-topography@main/data/municipality/topojson/s0010/N03-21_210101.json',
      'https://raw.githubusercontent.com/smartnews-smri/japan-topography/main/data/municipality/topojson/s0010/N03-21_210101.json'
    ],
    s0001: [
      'https://cdn.jsdelivr.net/gh/smartnews-smri/japan-topography@main/data/municipality/topojson/s0001/N03-21_210101.json',
      'https://raw.githubusercontent.com/smartnews-smri/japan-topography/main/data/municipality/topojson/s0001/N03-21_210101.json'
    ]
  };

  const PREF_NAMES = [
    "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
    "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
    "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県",
    "三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県",
    "鳥取県","島根県","岡山県","広島県","山口県",
    "徳島県","香川県","愛媛県","高知県",
    "福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"
  ];

  const STATUS_LABELS = ['未踏', '通過', '立ち寄り', '宿泊', '居住'];
  const STATUS_COLORS = ['transparent', '#0ea5e9', '#22c55e', '#f97316', '#a855f7'];
  const MAX_STATUS = 4;

  const ST_STATUS_LABELS = ['未訪', '通過', '乗降'];
  const ST_STATUS_COLORS = ['#ffffff', '#38bdf8', '#f97316'];

  const AIRPORT_STATUS_LABELS = ['未訪', '通過/乗継', '利用(乗降)', '御翔印/記念印済'];
  const AIRPORT_STATUS_COLORS = ['#ffffff', '#38bdf8', '#22c55e', '#a855f7'];

  // 2024〜2026（＋2027予定）最新廃線パッチ定義
  const RECENT_ABANDONED_PATCHES = [
    {
      id: 'rumoi_2026', group: '2024_2026', matchLineKeyword: '留萌',
      type: 'FULL_LINE', endYear: 2026, suffix: ' (〜2026廃止)'
    },
    {
      id: 'skyrail_2024', group: '2024_2026', matchLineKeyword: '広島短距離交通瀬野線', altKeyword: 'スカイレール',
      type: 'FULL_LINE', endYear: 2024, suffix: ' (〜2024廃止)'
    },
    {
      id: 'nemuro_2024', group: '2024_2026', matchLineKeyword: '根室',
      type: 'PARTIAL_SPLIT', endYear: 2024, suffix: ' (〜2024部分廃止)',
      boundaryStations: ['富良野', '新得'],
      abandonedStations: ['布部', '山部', '下金山', '金山', '東鹿越', '幾寅', '落合']
    },
    {
      id: 'tsugaru_2027', group: '2027_SCHEDULED', matchLineKeyword: '津軽線',
      type: 'PARTIAL_SPLIT', endYear: 2027, suffix: ' (〜2027廃止届済)',
      boundaryStations: ['蟹田'],
      abandonedStations: ['中小国', '大平', '津軽二股', '大川平', '今別', '津軽浜名', '三厩']
    },
    {
      id: 'kururi_2027', group: '2027_SCHEDULED', matchLineKeyword: '久留里線',
      type: 'PARTIAL_SPLIT', endYear: 2027, suffix: ' (〜2027廃止届済)',
      boundaryStations: ['久留里'],
      abandonedStations: ['平山', '上総松丘', '上総亀山']
    }
  ];

  // =========================================================
  // ✈️ 国内空港マスターデータ（御翔印55空港＋主要離島空港 網羅）
  // =========================================================
  const JAPAN_AIRPORTS = [
    { code: 'WKJ', name: '稚内空港', pref: '北海道', lat: 45.4042, lng: 141.8008 },
    { code: 'RIS', name: '利尻空港', pref: '北海道', lat: 45.2428, lng: 141.1864 },
    { code: 'OIR', name: '奥尻空港', pref: '北海道', lat: 42.0717, lng: 139.4328 },
    { code: 'MMB', name: '女満別空港', pref: '北海道', lat: 43.8806, lng: 144.1642 },
    { code: 'SHB', name: '中標津空港', pref: '北海道', lat: 43.5775, lng: 144.9600 },
    { code: 'MBE', name: '紋別空港', pref: '北海道', lat: 44.3039, lng: 143.4042 },
    { code: 'AKJ', name: '旭川空港', pref: '北海道', lat: 43.6708, lng: 142.4475 },
    { code: 'KUH', name: '釧路空港', pref: '北海道', lat: 43.0414, lng: 144.1931 },
    { code: 'OBO', name: '帯広空港', pref: '北海道', lat: 42.7333, lng: 143.2172 },
    { code: 'CTS', name: '新千歳空港', pref: '北海道', lat: 42.7752, lng: 141.6923 },
    { code: 'OKD', name: '札幌丘珠空港', pref: '北海道', lat: 43.1161, lng: 141.3814 },
    { code: 'HKD', name: '函館空港', pref: '北海道', lat: 41.7700, lng: 140.8222 },
    { code: 'AOJ', name: '青森空港', pref: '青森県', lat: 40.7347, lng: 140.6908 },
    { code: 'MSJ', name: '三沢空港', pref: '青森県', lat: 40.7033, lng: 141.3683 },
    { code: 'ONJ', name: '大館能代空港', pref: '秋田県', lat: 40.1919, lng: 140.3717 },
    { code: 'AXT', name: '秋田空港', pref: '秋田県', lat: 39.6156, lng: 140.2186 },
    { code: 'HNA', name: 'いわて花巻空港', pref: '岩手県', lat: 39.4286, lng: 141.1353 },
    { code: 'SYO', name: '庄内空港', pref: '山形県', lat: 38.8122, lng: 139.7872 },
    { code: 'GAJ', name: '山形空港', pref: '山形県', lat: 38.4119, lng: 140.3711 },
    { code: 'SDJ', name: '仙台空港', pref: '宮城県', lat: 38.1397, lng: 140.9169 },
    { code: 'FKS', name: '福島空港', pref: '福島県', lat: 37.2275, lng: 140.4306 },
    { code: 'IBR', name: '茨城空港', pref: '茨城県', lat: 36.1811, lng: 140.4156 },
    { code: 'NRT', name: '成田国際空港', pref: '千葉県', lat: 35.7647, lng: 140.3864 },
    { code: 'HND', name: '羽田空港(東京国際)', pref: '東京都', lat: 35.5494, lng: 139.7798 },
    { code: 'OIM', name: '大島空港', pref: '東京都', lat: 34.7819, lng: 139.3603 },
    { code: 'MYE', name: '三宅島空港', pref: '東京都', lat: 34.0736, lng: 139.5603 },
    { code: 'HAC', name: '八丈島空港', pref: '東京都', lat: 33.1150, lng: 139.7858 },
    { code: 'KIJ', name: '新潟空港', pref: '新潟県', lat: 37.9558, lng: 139.1117 },
    { code: 'TOY', name: '富山空港', pref: '富山県', lat: 36.6483, lng: 137.1875 },
    { code: 'NTQ', name: '能登空港', pref: '石川県', lat: 37.2933, lng: 136.9617 },
    { code: 'KMQ', name: '小松空港', pref: '石川県', lat: 36.3947, lng: 136.4067 },
    { code: 'MMJ', name: '松本空港(信州まつもと)', pref: '長野県', lat: 36.1667, lng: 137.9228 },
    { code: 'FSZ', name: '静岡空港', pref: '静岡県', lat: 34.7961, lng: 138.1894 },
    { code: 'NKM', name: '名古屋空港(小牧)', pref: '愛知県', lat: 35.2550, lng: 136.9244 },
    { code: 'NGO', name: '中部国際空港(セントレア)', pref: '愛知県', lat: 34.8583, lng: 136.8053 },
    { code: 'ITM', name: '大阪国際空港(伊丹)', pref: '大阪府', lat: 34.7855, lng: 135.4382 },
    { code: 'KIX', name: '関西国際空港', pref: '大阪府', lat: 34.4342, lng: 135.2328 },
    { code: 'UKB', name: '神戸空港', pref: '兵庫県', lat: 34.6328, lng: 135.2239 },
    { code: 'TJH', name: '但馬空港', pref: '兵庫県', lat: 35.5128, lng: 134.7869 },
    { code: 'SHM', name: '南紀白浜空港', pref: '和歌山県', lat: 33.6622, lng: 135.3644 },
    { code: 'TTJ', name: '鳥取空港', pref: '鳥取県', lat: 35.5300, lng: 134.1667 },
    { code: 'YGJ', name: '米子空港', pref: '鳥取県', lat: 35.4922, lng: 133.2364 },
    { code: 'IZO', name: '出雲空港', pref: '島根県', lat: 35.4136, lng: 132.8900 },
    { code: 'OKI', name: '隠岐空港', pref: '島根県', lat: 36.1783, lng: 133.3233 },
    { code: 'IWJ', name: '萩・石見空港', pref: '島根県', lat: 34.6764, lng: 131.7903 },
    { code: 'OKJ', name: '岡山空港', pref: '岡山県', lat: 34.7569, lng: 133.8553 },
    { code: 'HIJ', name: '広島空港', pref: '広島県', lat: 34.4361, lng: 132.9194 },
    { code: 'IWK', name: '岩国錦帯橋空港', pref: '山口県', lat: 34.1439, lng: 132.2356 },
    { code: 'UBJ', name: '山口宇部空港', pref: '山口県', lat: 33.9300, lng: 131.2786 },
    { code: 'TKS', name: '徳島空港', pref: '徳島県', lat: 34.1328, lng: 134.6067 },
    { code: 'TAK', name: '高松空港', pref: '香川県', lat: 34.2142, lng: 134.0156 },
    { code: 'MYJ', name: '松山空港', pref: '愛媛県', lat: 33.8272, lng: 132.6997 },
    { code: 'KCZ', name: '高知龍馬空港', pref: '高知県', lat: 33.5461, lng: 133.6694 },
    { code: 'FUK', name: '福岡空港', pref: '福岡県', lat: 33.5859, lng: 130.4507 },
    { code: 'KKJ', name: '北九州空港', pref: '福岡県', lat: 33.8456, lng: 131.0350 },
    { code: 'HSG', name: '佐賀空港', pref: '佐賀県', lat: 33.1497, lng: 130.3022 },
    { code: 'NGS', name: '長崎空港', pref: '長崎県', lat: 32.9169, lng: 129.9136 },
    { code: 'TSJ', name: '対馬空港', pref: '長崎県', lat: 34.2847, lng: 129.3306 },
    { code: 'IKI', name: '壱岐空港', pref: '長崎県', lat: 33.7492, lng: 129.7858 },
    { code: 'FUJ', name: '五島つばき空港(福江)', pref: '長崎県', lat: 32.6661, lng: 128.8328 },
    { code: 'KMJ', name: '熊本空港', pref: '熊本県', lat: 32.8372, lng: 130.8550 },
    { code: 'AXJ', name: '天草空港', pref: '熊本県', lat: 32.4822, lng: 130.1589 },
    { code: 'OIT', name: '大分空港', pref: '大分県', lat: 33.4794, lng: 131.7372 },
    { code: 'KMI', name: '宮崎空港', pref: '宮崎県', lat: 31.8772, lng: 131.4486 },
    { code: 'KOJ', name: '鹿児島空港', pref: '鹿児島県', lat: 31.8033, lng: 130.7194 },
    { code: 'TNE', name: '種子島空港', pref: '鹿児島県', lat: 30.6050, lng: 130.9917 },
    { code: 'KUM', name: '屋久島空港', pref: '鹿児島県', lat: 30.3856, lng: 130.6592 },
    { code: 'ASJ', name: '奄美空港', pref: '鹿児島県', lat: 28.4306, lng: 129.7125 },
    { code: 'KKX', name: '喜界空港', pref: '鹿児島県', lat: 28.3214, lng: 129.9281 },
    { code: 'TKN', name: '徳之島空港', pref: '鹿児島県', lat: 27.8364, lng: 128.8814 },
    { code: 'OKE', name: '沖永良部空港', pref: '鹿児島県', lat: 27.4256, lng: 128.7011 },
    { code: 'RNJ', name: '与論空港', pref: '鹿児島県', lat: 27.0439, lng: 128.4017 },
    { code: 'OKA', name: '那覇空港', pref: '沖縄県', lat: 26.1958, lng: 127.6458 },
    { code: 'UEO', name: '久米島空港', pref: '沖縄県', lat: 26.3636, lng: 126.7139 },
    { code: 'KTD', name: '北大東空港', pref: '沖縄県', lat: 25.9447, lng: 131.3269 },
    { code: 'MMD', name: '南大東空港', pref: '沖縄県', lat: 25.8467, lng: 131.2636 },
    { code: 'MMY', name: '宮古空港', pref: '沖縄県', lat: 24.7828, lng: 125.2950 },
    { code: 'SHI', name: '下地島空港', pref: '沖縄県', lat: 24.8267, lng: 125.1447 },
    { code: 'TRA', name: '多良間空港', pref: '沖縄県', lat: 24.6539, lng: 124.6753 },
    { code: 'ISG', name: '新石垣空港', pref: '沖縄県', lat: 24.3964, lng: 124.2450 },
    { code: 'OGN', name: '与那国空港', pref: '沖縄県', lat: 24.4669, lng: 122.9778 }
  ];

  // 代表的な国内定期航空路ペア（これ以外の任意のペアも画面からワンクリックで追加可能！）
  const DEFAULT_AIR_ROUTE_PAIRS = [
    ['HND','CTS'],['HND','WKJ'],['HND','MMB'],['HND','AKJ'],['HND','SHB'],['HND','KUH'],['HND','OBO'],['HND','HKD'],
    ['HND','AOJ'],['HND','MSJ'],['HND','ONJ'],['HND','AXT'],['HND','SYO'],['HND','GAJ'],['HND','HAC'],
    ['HND','TOY'],['HND','NTQ'],['HND','KMQ'],['HND','NGO'],['HND','ITM'],['HND','KIX'],['HND','UKB'],['HND','SHM'],
    ['HND','TTJ'],['HND','YGJ'],['HND','IZO'],['HND','IWJ'],['HND','OKJ'],['HND','HIJ'],['HND','IWK'],['HND','UBJ'],
    ['HND','TKS'],['HND','TAK'],['HND','MYJ'],['HND','KCZ'],
    ['HND','FUK'],['HND','KKJ'],['HND','HSG'],['HND','NGS'],['HND','KMJ'],['HND','OIT'],['HND','KMI'],['HND','KOJ'],
    ['HND','ASJ'],['HND','OKA'],['HND','MMY'],['HND','ISG'],
    ['ITM','CTS'],['ITM','HKD'],['ITM','AOJ'],['ITM','AXT'],['ITM','HNA'],['ITM','GAJ'],['ITM','SDJ'],['ITM','FKS'],
    ['ITM','KIJ'],['ITM','TJH'],['ITM','IZO'],['ITM','OKI'],['ITM','MYJ'],['ITM','KCZ'],
    ['ITM','FUK'],['ITM','NGS'],['ITM','KMJ'],['ITM','OIT'],['ITM','KMI'],['ITM','KOJ'],['ITM','TNE'],['ITM','KUM'],['ITM','ASJ'],['ITM','OKA'],
    ['CTS','OKD'],['OKD','RIS'],['OKD','KUH'],['OKD','HKD'],['OKD','AOJ'],['OKD','AXT'],
    ['CTS','AOJ'],['CTS','AXT'],['CTS','HNA'],['CTS','SDJ'],['CTS','KIJ'],['CTS','NGO'],['CTS','KIX'],['CTS','UKB'],['CTS','HIJ'],['CTS','FUK'],['CTS','OKA'],
    ['NGO','SDJ'],['NGO','FUK'],['NGO','KMJ'],['NGO','KOJ'],['NGO','OKA'],['NGO','ISG'],
    ['NKM','AOJ'],['NKM','HNA'],['NKM','GAJ'],['NKM','KIJ'],['NKM','IZO'],['NKM','KCZ'],['NKM','FUK'],['NKM','KMJ'],
    ['FUK','SDJ'],['FUK','KIJ'],['FUK','KMQ'],['FUK','MMJ'],['FUK','IZO'],['FUK','TKS'],['FUK','MYJ'],['FUK','KCZ'],
    ['FUK','TSJ'],['FUK','FUJ'],['FUK','AXJ'],['FUK','KMI'],['FUK','KOJ'],['FUK','KUM'],['FUK','ASJ'],['FUK','OKA'],
    ['KOJ','TNE'],['KOJ','KUM'],['KOJ','ASJ'],['KOJ','KKX'],['KOJ','TKN'],['KOJ','OKE'],['KOJ','RNJ'],['KOJ','OKA'],
    ['OKA','UEO'],['OKA','MMD'],['OKA','KTD'],['OKA','MMY'],['OKA','ISG'],['OKA','RNJ'],['MMY','TAR'],['ISG','OGN'],['ISG','MMY']
  ];

  // =========================================================
  // ⛴️ 国内フェリー・旅客船 航路マスターデータ（海上曲線ウェイポイント付）
  // =========================================================
  const BUILTIN_SEA_ROUTES = [
    {
      name: "津軽海峡フェリー・青函フェリー [青森 ⇔ 函館]",
      stations: [{ name: "青森港", lat: 40.8380, lng: 140.7280 }, { name: "函館港", lat: 41.8050, lng: 140.7180 }],
      segments: [{ from: "青森港", to: "函館港", path: [[40.838,140.728],[41.150,140.660],[41.480,140.680],[41.805,140.718]] }]
    },
    {
      name: "津軽海峡フェリー 大間函館航路 [大間 ⇔ 函館]",
      stations: [{ name: "大間港", lat: 41.5290, lng: 140.9030 }, { name: "函館港", lat: 41.8050, lng: 140.7180 }],
      segments: [{ from: "大間港", to: "函館港", path: [[41.529,140.903],[41.660,140.810],[41.805,140.718]] }]
    },
    {
      name: "シルバーフェリー [八戸 ⇔ 苫小牧]",
      stations: [{ name: "八戸港", lat: 40.5450, lng: 141.5280 }, { name: "苫小牧西港", lat: 42.6420, lng: 141.6270 }],
      segments: [{ from: "八戸港", to: "苫小牧西港", path: [[40.545,141.528],[41.400,141.750],[42.200,141.680],[42.642,141.627]] }]
    },
    {
      name: "太平洋フェリー [名古屋 ⇔ 仙台 ⇔ 苫小牧]",
      stations: [
        { name: "名古屋港", lat: 35.0390, lng: 136.8470 },
        { name: "仙台港", lat: 38.2730, lng: 141.0230 },
        { name: "苫小牧西港", lat: 42.6420, lng: 141.6270 }
      ],
      segments: [
        { from: "名古屋港", to: "仙台港", path: [[35.039,136.847],[34.350,137.100],[34.500,139.200],[35.600,141.100],[37.000,141.300],[38.273,141.023]] },
        { from: "仙台港", to: "苫小牧西港", path: [[38.273,141.023],[39.600,142.300],[41.500,141.850],[42.642,141.627]] }
      ]
    },
    {
      name: "商船三井さんふらわあ [大洗 ⇔ 苫小牧]",
      stations: [{ name: "大洗港", lat: 36.3100, lng: 140.5770 }, { name: "苫小牧西港", lat: 42.6420, lng: 141.6270 }],
      segments: [{ from: "大洗港", to: "苫小牧西港", path: [[36.310,140.577],[38.000,141.800],[40.000,142.350],[41.600,141.850],[42.642,141.627]] }]
    },
    {
      name: "新日本海フェリー [舞鶴/敦賀/新潟/秋田 ⇔ 小樽/苫小牧東]",
      stations: [
        { name: "舞鶴港", lat: 35.4850, lng: 135.3940 },
        { name: "敦賀港", lat: 35.6730, lng: 136.0680 },
        { name: "新潟港", lat: 37.9430, lng: 139.0710 },
        { name: "秋田港", lat: 39.7550, lng: 140.0560 },
        { name: "苫小牧東港", lat: 42.6060, lng: 141.8010 },
        { name: "小樽港", lat: 43.1900, lng: 141.0120 }
      ],
      segments: [
        { from: "舞鶴港", to: "小樽港", path: [[35.485,135.394],[37.500,136.200],[40.200,139.200],[42.500,140.100],[43.190,141.012]] },
        { from: "敦賀港", to: "新潟港", path: [[35.673,136.068],[36.500,135.950],[37.650,137.350],[37.943,139.071]] },
        { from: "新潟港", to: "秋田港", path: [[37.943,139.071],[38.800,139.500],[39.755,140.056]] },
        { from: "秋田港", to: "苫小牧東港", path: [[39.755,140.056],[41.350,140.200],[41.600,141.200],[42.606,141.801]] }
      ]
    },
    {
      name: "ハートランドフェリー [稚内 ⇔ 利尻島(鴛泊) ⇔ 礼文島(香深)]",
      stations: [
        { name: "稚内港", lat: 45.4190, lng: 141.6790 },
        { name: "鴛泊港(利尻島)", lat: 45.2430, lng: 141.2330 },
        { name: "香深港(礼文島)", lat: 45.3020, lng: 141.0470 }
      ],
      segments: [
        { from: "稚内港", to: "鴛泊港(利尻島)", path: [[45.419,141.679],[45.320,141.450],[45.243,141.233]] },
        { from: "鴛泊港(利尻島)", to: "香深港(礼文島)", path: [[45.243,141.233],[45.302,141.047]] }
      ]
    },
    {
      name: "佐渡汽船 [新潟 ⇔ 両津(佐渡島)]",
      stations: [{ name: "新潟港", lat: 37.9380, lng: 139.0640 }, { name: "両津港(佐渡)", lat: 38.0810, lng: 138.4360 }],
      segments: [{ from: "新潟港", to: "両津港(佐渡)", path: [[37.938,139.064],[38.050,138.750],[38.081,138.436]] }]
    },
    {
      name: "東京湾フェリー [久里浜 ⇔ 金谷]",
      stations: [{ name: "久里浜港", lat: 35.2220, lng: 139.7130 }, { name: "金谷港", lat: 35.1710, lng: 139.8180 }],
      segments: [{ from: "久里浜港", to: "金谷港", path: [[35.222,139.713],[35.171,139.818]] }]
    },
    {
      name: "東海汽船 [東京(竹芝) ⇔ 大島 ⇔ 新島 ⇔ 神津島]",
      stations: [
        { name: "東京竹芝港", lat: 35.6540, lng: 139.7630 },
        { name: "岡田港(伊豆大島)", lat: 34.7910, lng: 139.3910 },
        { name: "新島港", lat: 34.3740, lng: 139.2470 },
        { name: "神津島港", lat: 34.2050, lng: 139.1340 }
      ],
      segments: [
        { from: "東京竹芝港", to: "岡田港(伊豆大島)", path: [[35.654,139.763],[35.250,139.780],[34.791,139.391]] },
        { from: "岡田港(伊豆大島)", to: "新島港", path: [[34.791,139.391],[34.374,139.247]] },
        { from: "新島港", to: "神津島港", path: [[34.374,139.247],[34.205,139.134]] }
      ]
    },
    {
      name: "伊勢湾フェリー [鳥羽 ⇔ 伊良湖]",
      stations: [{ name: "鳥羽港", lat: 34.4840, lng: 136.8460 }, { name: "伊良湖港", lat: 34.5810, lng: 137.0180 }],
      segments: [{ from: "鳥羽港", to: "伊良湖港", path: [[34.484,136.846],[34.581,137.018]] }]
    },
    {
      name: "南海フェリー [和歌山 ⇔ 徳島]",
      stations: [{ name: "和歌山港", lat: 34.2150, lng: 135.1460 }, { name: "徳島港", lat: 34.0580, lng: 134.5880 }],
      segments: [{ from: "和歌山港", to: "徳島港", path: [[34.215,135.146],[34.058,134.588]] }]
    },
    {
      name: "ジャンボフェリー・小豆島フェリー [神戸/姫路/高松 ⇔ 小豆島]",
      stations: [
        { name: "神戸港(新港)", lat: 34.6810, lng: 135.2020 },
        { name: "坂手港(小豆島)", lat: 34.4550, lng: 134.3240 },
        { name: "高松東港", lat: 34.3510, lng: 134.0840 }
      ],
      segments: [
        { from: "神戸港(新港)", to: "坂手港(小豆島)", path: [[34.681,135.202],[34.550,134.950],[34.455,134.324]] },
        { from: "坂手港(小豆島)", to: "高松東港", path: [[34.455,134.324],[34.351,134.084]] }
      ]
    },
    {
      name: "名門大洋フェリー・阪九フェリー [大阪南港/神戸 ⇔ 新門司]",
      stations: [{ name: "大阪南港", lat: 34.6290, lng: 135.4150 }, { name: "新門司港", lat: 33.8750, lng: 130.9920 }],
      segments: [{ from: "大阪南港", to: "新門司港", path: [[34.629,135.415],[34.380,134.800],[34.100,133.200],[33.875,130.992]] }]
    },
    {
      name: "商船三井さんふらわあ [大阪南港/神戸 ⇔ 別府/大分/志布志]",
      stations: [
        { name: "大阪南港", lat: 34.6290, lng: 135.4150 },
        { name: "別府国際観光港", lat: 33.3060, lng: 131.5030 },
        { name: "志布志港", lat: 31.4680, lng: 131.1060 }
      ],
      segments: [
        { from: "大阪南港", to: "別府国際観光港", path: [[34.629,135.415],[34.050,133.000],[33.306,131.503]] },
        { from: "大阪南港", to: "志布志港", path: [[34.629,135.415],[33.400,135.100],[32.000,132.500],[31.468,131.106]] }
      ]
    },
    {
      name: "瀬戸内海汽船・石崎汽船 [広島/呉 ⇔ 松山観光港]",
      stations: [
        { name: "広島港(宇品)", lat: 34.3540, lng: 132.4560 },
        { name: "呉港", lat: 34.2420, lng: 132.5540 },
        { name: "松山観光港", lat: 33.8900, lng: 132.7040 }
      ],
      segments: [
        { from: "広島港(宇品)", to: "呉港", path: [[34.354,132.456],[34.242,132.554]] },
        { from: "呉港", to: "松山観光港", path: [[34.242,132.554],[34.050,132.600],[33.890,132.704]] }
      ]
    },
    {
      name: "JR西日本宮島フェリー・宮島松大汽船 [宮島口 ⇔ 宮島]",
      stations: [{ name: "宮島口桟橋", lat: 34.3110, lng: 132.3040 }, { name: "宮島桟橋", lat: 34.3010, lng: 132.3220 }],
      segments: [{ from: "宮島口桟橋", to: "宮島桟橋", path: [[34.311,132.304],[34.301,132.322]] }]
    },
    {
      name: "国道九四フェリー・宇和島運輸 [佐賀関 ⇔ 三崎 / 別府・臼杵 ⇔ 八幡浜]",
      stations: [
        { name: "三崎港", lat: 33.3910, lng: 132.1190 },
        { name: "佐賀関港", lat: 33.2490, lng: 131.8690 },
        { name: "八幡浜港", lat: 33.4560, lng: 132.4190 },
        { name: "別府港", lat: 33.3060, lng: 131.5030 }
      ],
      segments: [
        { from: "三崎港", to: "佐賀関港", path: [[33.391,132.119],[33.249,131.869]] },
        { from: "八幡浜港", to: "別府港", path: [[33.456,132.419],[33.306,131.503]] }
      ]
    },
    {
      name: "九州郵船 [博多港 ⇔ 壱岐 ⇔ 対馬(厳原)]",
      stations: [
        { name: "博多港", lat: 33.6060, lng: 130.3980 },
        { name: "郷ノ浦港(壱岐)", lat: 33.7480, lng: 129.6890 },
        { name: "厳原港(対馬)", lat: 34.1970, lng: 129.2920 }
      ],
      segments: [
        { from: "博多港", to: "郷ノ浦港(壱岐)", path: [[33.606,130.398],[33.748,129.689]] },
        { from: "郷ノ浦港(壱岐)", to: "厳原港(対馬)", path: [[33.748,129.689],[34.197,129.292]] }
      ]
    },
    {
      name: "桜島フェリー [鹿児島港 ⇔ 桜島港]",
      stations: [{ name: "鹿児島本港", lat: 31.5940, lng: 130.5620 }, { name: "桜島港", lat: 31.5900, lng: 130.5990 }],
      segments: [{ from: "鹿児島本港", to: "桜島港", path: [[31.594,130.562],[31.590,130.599]] }]
    },
    {
      name: "種子屋久高速船・フェリー屋久島・はいびすかす [鹿児島 ⇔ 種子島 ⇔ 屋久島]",
      stations: [
        { name: "鹿児島本港", lat: 31.5880, lng: 130.5640 },
        { name: "西之表港(種子島)", lat: 30.7330, lng: 130.9920 },
        { name: "宮之浦港(屋久島)", lat: 30.4220, lng: 130.5750 }
      ],
      segments: [
        { from: "鹿児島本港", to: "西之表港(種子島)", path: [[31.588,130.564],[31.150,130.650],[30.733,130.992]] },
        { from: "西之表港(種子島)", to: "宮之浦港(屋久島)", path: [[30.733,130.992],[30.422,130.575]] }
      ]
    },
    {
      name: "マルエーフェリー・マリックスライン [鹿児島 ⇔ 奄美大島 ⇔ 徳之島 ⇔ 沖永良部 ⇔ 与論 ⇔ 那覇]",
      stations: [
        { name: "鹿児島新港", lat: 31.5640, lng: 130.5590 },
        { name: "名瀬港(奄美大島)", lat: 28.3840, lng: 129.4950 },
        { name: "亀徳港(徳之島)", lat: 27.7350, lng: 129.0180 },
        { name: "和泊港(沖永良部)", lat: 27.3910, lng: 128.6590 },
        { name: "与論港", lat: 27.0430, lng: 128.4040 },
        { name: "那覇港", lat: 26.2240, lng: 127.6740 }
      ],
      segments: [
        { from: "鹿児島新港", to: "名瀬港(奄美大島)", path: [[31.564,130.559],[30.000,130.000],[28.384,129.495]] },
        { from: "名瀬港(奄美大島)", to: "亀徳港(徳之島)", path: [[28.384,129.495],[27.735,129.018]] },
        { from: "亀徳港(徳之島)", to: "和泊港(沖永良部)", path: [[27.735,129.018],[27.391,128.659]] },
        { from: "和泊港(沖永良部)", to: "与論港", path: [[27.391,128.659],[27.043,128.404]] },
        { from: "与論港", to: "那覇港", path: [[27.043,128.404],[26.224,127.674]] }
      ]
    }
  ];

  // =========================================================
  // 🚌 バス路線マスターデータ（BRT・主要鉄道連絡バス内蔵）
  // =========================================================
  const BUILTIN_BUS_ROUTES = [
    {
      name: "JR東日本 気仙沼線BRT [前谷地 〜 柳津 〜 志津川 〜 本吉 〜 気仙沼]",
      stations: [
        { name: "前谷地", lat: 38.5131, lng: 141.1981 },
        { name: "柳津", lat: 38.5678, lng: 141.3125 },
        { name: "陸前戸倉", lat: 38.6458, lng: 141.4422 },
        { name: "志津川", lat: 38.6786, lng: 141.4481 },
        { name: "陸前階上", lat: 38.8267, lng: 141.5764 },
        { name: "気仙沼", lat: 38.9097, lng: 141.5592 }
      ]
    },
    {
      name: "JR東日本 大船渡線BRT [気仙沼 〜 陸前高田 〜 盛]",
      stations: [
        { name: "気仙沼", lat: 38.9097, lng: 141.5592 },
        { name: "鹿折唐桑", lat: 38.9219, lng: 141.5806 },
        { name: "陸前高田", lat: 39.0156, lng: 141.6292 },
        { name: "小友", lat: 38.9936, lng: 141.6894 },
        { name: "大船渡", lat: 39.0644, lng: 141.7200 },
        { name: "盛", lat: 39.0867, lng: 141.7103 }
      ]
    },
    {
      name: "JR九州 日田彦山線BRT ひこぼしライン [添田 〜 彦山 〜 筑前岩屋 〜 夜明 〜 日田]",
      stations: [
        { name: "添田", lat: 33.5706, lng: 130.8586 },
        { name: "歓遊舎ひこさん", lat: 33.5419, lng: 130.8706 },
        { name: "彦山", lat: 33.4856, lng: 130.8964 },
        { name: "筑前岩屋", lat: 33.4281, lng: 130.8789 },
        { name: "大行司", lat: 33.3944, lng: 130.8736 },
        { name: "宝珠山", lat: 33.3742, lng: 130.8739 },
        { name: "夜明", lat: 33.3189, lng: 130.8617 },
        { name: "日田", lat: 33.3181, lng: 130.9389 }
      ]
    },
    {
      name: "ジェイアールバス東北 十和田北線（みずうみ号）[青森駅 〜 酸ヶ湯温泉 〜 十和田湖]",
      stations: [
        { name: "青森駅", lat: 40.8294, lng: 140.7342 },
        { name: "新青森駅", lat: 40.8275, lng: 140.6933 },
        { name: "萱野茶屋", lat: 40.7131, lng: 140.8350 },
        { name: "酸ヶ湯温泉", lat: 40.6486, lng: 140.8506 },
        { name: "蔦温泉", lat: 40.5944, lng: 140.9581 },
        { name: "焼山(奥入瀬渓流)", lat: 40.5764, lng: 140.9869 },
        { name: "子ノ口", lat: 40.4667, lng: 140.9381 },
        { name: "十和田湖(休屋)", lat: 40.4286, lng: 140.8919 }
      ]
    },
    {
      name: "立山黒部アルペンルート 関電トンネル電気バス・立山高原バス [室堂 〜 黒部ダム 〜 扇沢]",
      stations: [
        { name: "美女平", lat: 36.5825, lng: 137.4606 },
        { name: "室堂", lat: 36.5781, lng: 137.5961 },
        { name: "黒部ダム", lat: 36.5647, lng: 137.6644 },
        { name: "扇沢", lat: 36.5594, lng: 137.7172 }
      ]
    },
    {
      name: "阿佐海岸鉄道 DMV（デュアル・モード・ビークル）[阿波海南文化村 〜 甲浦 〜 道の駅宍喰温泉]",
      stations: [
        { name: "阿波海南文化村", lat: 33.6042, lng: 134.3422 },
        { name: "阿波海南", lat: 33.5997, lng: 134.3514 },
        { name: "海部", lat: 33.5889, lng: 134.3519 },
        { name: "宍喰", lat: 33.5419, lng: 134.3033 },
        { name: "甲浦", lat: 33.5297, lng: 134.2872 },
        { name: "海の駅東洋町", lat: 33.5247, lng: 134.2889 },
        { name: "道の駅宍喰温泉", lat: 33.5364, lng: 134.3069 }
      ]
    }
  ];

  function normalizeKanji(str) {
    if (!str) return '';
    return str.replace(/萠/g, '萌').replace(/驛/g, '駅').replace(/鐵/g, '鉄').replace(/ケ/g, 'ヶ').replace(/ノ/g, '之');
  }
  // 正式名称（N05収録名）から旅客案内名（通称・愛称）への変換マスター辞書
const PASSENGER_LINE_NAME_RULES = [
    // JR北海道
    { comp: '北海道旅客鉄道', line: '札沼線', passenger: '学園都市線', alias: '学園都市線 札沼線' },
    { comp: '北海道旅客鉄道', line: '千歳線', passenger: '千歳線・空港支線', alias: '千歳線' },
    { comp: '北海道旅客鉄道', line: '函館線', passenger: '函館本線（山線・海線）', alias: '函館本線 学園都市線' },
    { comp: '北海道旅客鉄道', line: '室蘭線', passenger: '室蘭本線', alias: '室蘭本線' },
    { comp: '北海道旅客鉄道', line: '根室線', passenger: '根室本線（花咲線・滝川〜富良野）', alias: '根室本線 花咲線' },
    { comp: '北海道旅客鉄道', line: '石勝線', passenger: '石勝線', alias: '石勝線' },
    { comp: '北海道旅客鉄道', line: '石北線', passenger: '石北本線', alias: '石北本線' },
    { comp: '北海道旅客鉄道', line: '宗谷線', passenger: '宗谷本線', alias: '宗谷本線' },
    { comp: '北海道旅客鉄道', line: '釧網線', passenger: '釧網本線', alias: '釧網本線' },
    { comp: '北海道旅客鉄道', line: '留萌線', passenger: '留萌本線', alias: '留萌本線 留萠本線' },
    { comp: '北海道旅客鉄道', line: '日高線', passenger: '日高本線', alias: '日高本線' },

    // JR東日本（首都圏・幹線愛称）
    { comp: '東日本旅客鉄道', line: '赤羽線', passenger: '埼京線（赤羽線：池袋〜赤羽）', alias: '埼京線 赤羽線' },
    { comp: '東日本旅客鉄道', line: '東北線', passenger: '宇都宮線・高崎線・埼京線・京浜東北線（東北本線）', alias: '宇都宮線 東北本線 埼京線 京浜東北線 湘南新宿ライン 上野東京ライン' },
    { comp: '東日本旅客鉄道', line: '東海道線', passenger: '東海道線・横須賀線・湘南新宿ライン・京浜東北線', alias: '東海道本線 品鶴線 横須賀線 湘南新宿ライン 京浜東北線 相鉄JR直通線' },
    { comp: '東日本旅客鉄道', line: '中央線', passenger: '中央線快速・中央総武緩行線・中央本線', alias: '中央本線 中央線 総武線' },
    { comp: '東日本旅客鉄道', line: '総武線', passenger: '総武快速線・中央総武緩行線・総武本線', alias: '総武本線 総武線' },
    { comp: '東日本旅客鉄道', line: '常磐線', passenger: '常磐線（快速・各駅停車・上野東京ライン）', alias: '常磐線 上野東京ライン' },
    { comp: '東日本旅客鉄道', line: '山手線', passenger: '山手線（埼京線・湘南新宿ライン並走）', alias: '山手線 埼京線 湘南新宿ライン' },
    { comp: '東日本旅客鉄道', line: '根岸線', passenger: '京浜東北・根岸線', alias: '京浜東北線 根岸線' },
    { comp: '東日本旅客鉄道', line: '南武線', passenger: '南武線・南武支線（浜川崎支線）', alias: '南武線 南武支線 浜川崎支線' },
    { comp: '東日本旅客鉄道', line: '鶴見線', passenger: '鶴見線（本線・海芝浦支線・大川支線）', alias: '鶴見線 海芝浦支線 大川支線' },
    { comp: '東日本旅客鉄道', line: '高崎線', passenger: '高崎線（上野東京ライン・湘南新宿ライン）', alias: '高崎線' },
    { comp: '東日本旅客鉄道', line: '信越線', passenger: '信越本線', alias: '信越本線' },
    { comp: '東日本旅客鉄道', line: '羽越線', passenger: '羽越本線', alias: '羽越本線' },
    { comp: '東日本旅客鉄道', line: '奥羽線', passenger: '奥羽本線（山形線・山形新幹線・秋田新幹線）', alias: '奥羽本線 山形線' },
    { comp: '東日本旅客鉄道', line: '篠ノ井線', passenger: '篠ノ井線', alias: '篠ノ井線' },
    { comp: '東日本旅客鉄道', line: '陸羽東線', passenger: '奥の細道湯けむりライン（陸羽東線）', alias: '奥の細道湯けむりライン 陸羽東線' },
    { comp: '東日本旅客鉄道', line: '陸羽西線', passenger: '奥の細道最上川ライン（陸羽西線）', alias: '奥の細道最上川ライン 陸羽西線' },

    // 首都圏私鉄・地下鉄・新交通
    { comp: '東武鉄道', line: '伊勢崎線', passenger: '東武スカイツリーライン・伊勢崎線', alias: '東武スカイツリーライン 伊勢崎線' },
    { comp: '東武鉄道', line: '野田線', passenger: '東武アーバンパークライン', alias: '東武アーバンパークライン 野田線' },
    { comp: '京浜急行電鉄', line: '本線', passenger: '京急本線', alias: '京急本線' },
    { comp: '京成電鉄', line: '本線', passenger: '京成本線', alias: '京成本線' },
    { comp: '京成電鉄', line: '成田空港線', passenger: '成田スカイアクセス線', alias: '成田スカイアクセス線' },
    { comp: '首都圏新都市鉄道', line: '常磐新線', passenger: 'つくばエクスプレス', alias: 'つくばエクスプレス TX 常磐新線' },
    { comp: '東京臨海高速鉄道', line: '臨海副都心線', passenger: 'りんかい線', alias: 'りんかい線 臨海副都心線' },
    { comp: 'ゆりかもめ', line: '東京臨海新交通臨海線', passenger: 'ゆりかもめ', alias: 'ゆりかもめ' },
    { comp: '東京臨海新交通', line: '臨海線', passenger: 'ゆりかもめ', alias: 'ゆりかもめ' },
    { comp: '東京モノレール', line: '東京モノレール羽田線', passenger: '東京モノレール羽田空港線', alias: '東京モノレール' },
    { comp: '横浜高速鉄道', line: 'みなとみらい21線', passenger: 'みなとみらい線', alias: 'みなとみらい線' },
    { comp: '横浜高速鉄道', line: 'みなとみらい２１線', passenger: 'みなとみらい線', alias: 'みなとみらい線' },
    { comp: '多摩都市モノレール', line: '多摩都市モノレール線', passenger: '多摩モノレール', alias: '多摩モノレール' },
    { comp: '埼玉新都市交通', line: '伊奈線', passenger: 'ニューシャトル', alias: 'ニューシャトル 伊奈線' },
    { comp: '野岩鉄道', line: '会津鬼怒川線', passenger: 'ほっとスパ・ライン（会津鬼怒川線）', alias: 'ほっとスパ・ライン' },

    // JR東海・中京圏
    { comp: '東海旅客鉄道', line: '東海道線', passenger: '東海道本線（JR東海）', alias: '東海道本線' },
    { comp: '東海旅客鉄道', line: '中央線', passenger: '中央本線（中央西線）', alias: '中央本線 中央西線' },
    { comp: '東海旅客鉄道', line: '関西線', passenger: '関西本線（JR東海）', alias: '関西本線' },
    { comp: '東海旅客鉄道', line: '紀勢線', passenger: '紀勢本線', alias: '紀勢本線' },
    { comp: '東海旅客鉄道', line: '高山線', passenger: '高山本線', alias: '高山本線' },
    { comp: '名古屋臨海高速鉄道', line: '西名古屋港線', passenger: 'あおなみ線', alias: 'あおなみ線 西名古屋港線' },
    { comp: '愛知高速交通', line: '東部丘陵線', passenger: 'リニモ（Linimo）', alias: 'リニモ 東部丘陵線' },

    // JR西日本（アーバンネットワーク愛称等）
    { comp: '西日本旅客鉄道', line: '東海道線', passenger: '琵琶湖線・JR京都線・JR神戸線', alias: '琵琶湖線 JR京都線 JR神戸線 東海道本線' },
    { comp: '西日本旅客鉄道', line: '山陽線', passenger: 'JR神戸線・山陽本線・和田岬線', alias: 'JR神戸線 山陽本線 和田岬線' },
    { comp: '西日本旅客鉄道', line: '北陸線', passenger: '琵琶湖線・北陸本線', alias: '琵琶湖線 北陸本線' },
    { comp: '西日本旅客鉄道', line: '山陰線', passenger: '嵯峨野線・山陰本線', alias: '嵯峨野線 山陰本線' },
    { comp: '西日本旅客鉄道', line: '関西線', passenger: '大和路線・関西本線', alias: '大和路線 関西本線' },
    { comp: '西日本旅客鉄道', line: '片町線', passenger: '学研都市線', alias: '学研都市線 片町線' },
    { comp: '西日本旅客鉄道', line: '桜島線', passenger: 'JRゆめ咲線', alias: 'JRゆめ咲線 桜島線' },
    { comp: '西日本旅客鉄道', line: '福知山線', passenger: 'JR宝塚線・福知山線', alias: 'JR宝塚線 福知山線' },
    { comp: '西日本旅客鉄道', line: '本四備讃線', passenger: '瀬戸大橋線', alias: '瀬戸大橋線 本四備讃線' },
    { comp: '西日本旅客鉄道', line: '宇野線', passenger: '宇野みなと線・瀬戸大橋線', alias: '宇野みなと線 瀬戸大橋線 宇野線' },
    { comp: '西日本旅客鉄道', line: '呉線', passenger: '瀬戸内さざなみ線（呉線）', alias: '瀬戸内さざなみ線 呉線' },
    { comp: 'WILLER', line: '宮津線', passenger: '京都丹後鉄道 宮舞線・宮豊線', alias: '京都丹後鉄道 丹鉄 宮津線' },
    { comp: 'WILLER', line: '宮福線', passenger: '京都丹後鉄道 宮福線', alias: '京都丹後鉄道 丹鉄 宮福線' },

    // JR四国・JR九州
    { comp: '四国旅客鉄道', line: '予讃線', passenger: '予讃線・瀬戸大橋線・愛ある伊予灘線', alias: '予讃線 瀬戸大橋線 愛ある伊予灘線' },
    { comp: '四国旅客鉄道', line: '牟岐線', passenger: '阿波室戸シーサイドライン（牟岐線）', alias: '阿波室戸シーサイドライン 牟岐線' },
    { comp: '四国旅客鉄道', line: '徳島線', passenger: 'よしの川ブルーライン（徳島線）', alias: 'よしの川ブルーライン 徳島線' },
    { comp: '九州旅客鉄道', line: '鹿児島線', passenger: '鹿児島本線', alias: '鹿児島本線' },
    { comp: '九州旅客鉄道', line: '長崎線', passenger: '長崎本線', alias: '長崎本線' },
    { comp: '九州旅客鉄道', line: '日豊線', passenger: '日豊本線', alias: '日豊本線' },
    { comp: '九州旅客鉄道', line: '豊肥線', passenger: '豊肥本線（阿蘇高原線）', alias: '豊肥本線 阿蘇高原線' },
    { comp: '九州旅客鉄道', line: '久大線', passenger: '久大本線（ゆふ高原線）', alias: '久大本線 ゆふ高原線' },
    { comp: '九州旅客鉄道', line: '篠栗線', passenger: '福北ゆたか線（篠栗線）', alias: '福北ゆたか線 篠栗線' },
    { comp: '九州旅客鉄道', line: '筑豊線', passenger: '福北ゆたか線・若松線・原田線', alias: '福北ゆたか線 若松線 原田線 筑豊本線' },
    { comp: '九州旅客鉄道', line: '肥薩線', passenger: '肥薩線（えびの高原線）', alias: '肥薩線 えびの高原線' },
    { comp: '九州旅客鉄道', line: '吉都線', passenger: 'えびの高原線（吉都線）', alias: 'えびの高原線 吉都線' },
    { comp: '九州旅客鉄道', line: '三角線', passenger: 'あまくさみすみ線（三角線）', alias: 'あまくさみすみ線 三角線' }
  ];
