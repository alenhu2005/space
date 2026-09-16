import type { SceneDefinition, SceneId } from '../core/types'
import { OBSERVER_TIME_ZONES } from '../core/moon-observer'

const definitions: readonly SceneDefinition[] = [
  {
    id: 'celestial-sphere',
    shortLabel: '天球',
    title: '天球與星空運動',
    eyebrow: '從地面望向整座天空',
    description: '把看似平面的天空展開成可旋轉的球體，觀察緯度如何改變星軌。',
    grades: '國中九年級・高中必修',
    curriculumCodes: ['EFb-Vc-1'],
    focus: ['天極高度等於觀察者緯度', '星星的周日運動源自地球自轉', '不同緯度會看見不同的升落軌跡'],
    misconception: '星星不是繞著地球實際轉一圈；這裡呈現的是地球自轉造成的視運動。',
    controls: [{ key: 'latitude', label: '觀察緯度', min: -90, max: 90, step: .1, unit: '°' }, { key: 'annualDay', label: '同一太陽時・經過天數', min: 0, max: 365, step: 1, unit: ' 天' }],
    defaultParameters: { latitude: 25.033, sidereal: 0, annualDay: 0 },
    presets: [
      { id: 'taipei', label: '台北星空', description: '北緯 25° 的典型星軌', parameters: { latitude: 25.033, sidereal: 0 }, cameraPreset: 'inside' },
      { id: 'equator', label: '赤道', description: '星軌垂直升落', parameters: { latitude: 0, sidereal: 0 }, cameraPreset: 'horizon' },
      { id: 'north-pole', label: '北極', description: '星軌與地平線平行', parameters: { latitude: 90, sidereal: 0 }, cameraPreset: 'inside' }
    ]
  },
  {
    id: 'sun-path',
    shortLabel: '太陽',
    title: '太陽視運動與四季',
    eyebrow: '同時看見地面軌跡與太空原因',
    description: '調整緯度與日期，觀察太陽高度、日照角度和晝長如何一起改變。',
    grades: '國中九年級・高中必修',
    curriculumCodes: ['Id-IV-1', 'Id-IV-2', 'Id-IV-3', 'EId-Vc-1'],
    focus: ['地軸傾斜造成四季', '夏季太陽路徑較高且晝長較長', '日照角度影響單位面積接收的能量'],
    misconception: '四季的主因不是地球離太陽遠近，而是地軸傾斜造成的日照角度與晝長差異。',
    controls: [
      { key: 'latitude', label: '觀察緯度', min: -90, max: 90, step: .1, unit: '°' },
      { key: 'seasonAngle', label: '公轉角・春分起算', min: 0, max: 360, step: 1, unit: '°' }
    ],
    defaultParameters: { latitude: 25.033, seasonAngle: 90, hour: 12 },
    presets: [
      { id: 'june-solstice', label: '夏至・台灣', description: '北半球日照最長', parameters: { latitude: 25.033, seasonAngle: 90, hour: 12 }, cameraPreset: 'horizon' },
      { id: 'equinox', label: '春分', description: '太陽直射赤道', parameters: { latitude: 25.033, seasonAngle: 0, hour: 12 }, cameraPreset: 'horizon' },
      { id: 'september-equinox', label: '秋分', description: '太陽南移通過赤道', parameters: { latitude: 25.033, seasonAngle: 180, hour: 12 }, cameraPreset: 'horizon' },
      { id: 'december-solstice', label: '冬至', description: '北半球日照最短', parameters: { latitude: 25.033, seasonAngle: 270, hour: 12 }, cameraPreset: 'horizon' },
      { id: 'equator', label: '赤道', description: '全年晝夜約等長', parameters: { latitude: 0, seasonAngle: 0, hour: 12 }, cameraPreset: 'horizon' },
      { id: 'polar-day', label: '極晝', description: '太陽整日不落', parameters: { latitude: 75, seasonAngle: 90, hour: 12 }, cameraPreset: 'outside' },
      { id: 'polar-night', label: '極夜', description: '太陽整日不升', parameters: { latitude: 75, seasonAngle: 270, hour: 12 }, cameraPreset: 'outside' }
    ]
  },
  {
    id: 'moon-phases',
    shortLabel: '月相',
    title: '月相與月球運動',
    eyebrow: '同一束陽光，兩個觀看位置',
    description: '並排比較太空中的日地月位置，和地球上實際看見的月面亮暗。',
    grades: '國中九年級',
    curriculumCodes: ['Fb-IV-3', 'Fb-IV-4'],
    focus: ['月球永遠有一半被太陽照亮', '月相由日地月相對位置決定', '月球同步自轉讓同一面大致朝向地球'],
    misconception: '月相的暗部不是地球影子；只有月食時月球才會進入地球影子。',
    controls: [
      { key: 'inclination', label: '月球軌道傾角', min: 0, max: 15, step: .1, unit: '°' },
      { key: 'observerLatitude', label: '觀測者緯度', min: -90, max: 90, step: .1, unit: '°' },
      { key: 'observerSolarHour', label: '觀測者起始太陽時', min: 0, max: 23.5, step: .5, unit: ' 時' },
      { key: 'observerTimeZone', label: '觀測者民用時區', min: 0, max: OBSERVER_TIME_ZONES.length - 1, step: 1, unit: '', availableInReal: true, onlyInReal: true, options: OBSERVER_TIME_ZONES.map(({ value, label }) => ({ value, label })) },
      { key: 'scaleMode', label: '日地月顯示比例', min: 0, max: 1, step: 1, unit: '', availableInReal: true, options: [{ value: 0, label: '教學比例・放大天體' }, { value: 1, label: '地月尺寸與距離等比例' }] }
    ],
    defaultParameters: { phase: 45, inclination: 5.145, observerLatitude: 25.033, observerSolarHour: 12, observerTimeZone: 0, scaleMode: 0 },
    presets: [
      { id: 'new-moon', label: '新月', description: '月球位於日地之間', parameters: { phase: 0, inclination: 5.145 }, cameraPreset: 'top' },
      { id: 'first-quarter', label: '上弦月', description: '月球在東方相距 90°', parameters: { phase: 90, inclination: 5.145 }, cameraPreset: 'top' },
      { id: 'full-moon', label: '滿月', description: '地球位於日月之間', parameters: { phase: 180, inclination: 5.145 }, cameraPreset: 'top' },
      { id: 'last-quarter', label: '下弦月', description: '月球在西方相距 90°', parameters: { phase: 270, inclination: 5.145 }, cameraPreset: 'top' }
    ]
  },
  {
    id: 'eclipses',
    shortLabel: '日月食',
    title: '日食與月食',
    eyebrow: '沿著光與影，看懂少見的對齊',
    description: '從軌道交點、影錐與觀察位置理解日月食，以及為何它們不會每月發生。',
    grades: '國中九年級',
    curriculumCodes: ['Fb-IV-3'],
    focus: ['日食發生在新月附近', '月食發生在滿月附近', '月球必須同時接近軌道交點'],
    misconception: '朔望不一定發生日月食，因為月球軌道面相對黃道面傾斜約 5.1°。',
    controls: [
      { key: 'inclination', label: '教學傾角・實際約 5.1°', min: 0, max: 60, step: .1, unit: '°' },
      { key: 'nodeOffset', label: '交點經度・朔方向起算', min: 0, max: 360, step: 1, unit: '°' }
    ],
    defaultParameters: { phase: 0, nodeOffset: 0, inclination: 25, eclipseType: 0 },
    presets: [
      { id: 'total-solar', label: '日全食', description: '月球本影落在地球', parameters: { phase: 0, nodeOffset: 0, inclination: 25, eclipseType: 0 }, cameraPreset: 'side' },
      { id: 'partial-solar', label: '日偏食', description: '地球僅進入半影', parameters: { phase: 0, nodeOffset: 90, inclination: 25, eclipseType: 1 }, cameraPreset: 'side' },
      { id: 'annular-solar', label: '日環食', description: '月球視直徑較小', parameters: { phase: 0, nodeOffset: 0, inclination: 25, eclipseType: 2 }, cameraPreset: 'side' },
      { id: 'total-lunar', label: '月全食', description: '月球進入地球本影', parameters: { phase: 180, nodeOffset: 0, inclination: 25, eclipseType: 3 }, cameraPreset: 'side' },
      { id: 'partial-lunar', label: '月偏食', description: '月球部分進入本影', parameters: { phase: 180, nodeOffset: 50, inclination: 25, eclipseType: 4 }, cameraPreset: 'side' }
    ]
  },
  {
    id: 'tides',
    shortLabel: '潮汐',
    title: '日月引潮力與潮汐',
    eyebrow: '把看不見的力畫成可比較的形狀',
    description: '觀察月球與太陽方向如何疊加，形成大潮、小潮與每日規律。',
    grades: '國中九年級・高中必修',
    curriculumCodes: ['Ic-IV-4', 'EIc-Vc-3'],
    focus: ['潮汐隆起同時出現在近月側與背月側', '朔與望附近形成大潮', '上下弦月附近形成小潮'],
    misconception: '海水隆起不是被月球單向拉走；近月側與背月側的差異引力共同形成兩個潮汐隆起。',
    controls: [{ key: 'exaggeration', label: '隆起誇張倍率', min: .08, max: .48, step: .01, unit: '×' }],
    defaultParameters: { phase: 0, exaggeration: 0.28 },
    presets: [
      { id: 'spring-new', label: '朔・大潮', description: '日月引潮力同向', parameters: { phase: 0, exaggeration: 0.28 }, cameraPreset: 'top' },
      { id: 'neap-first', label: '上弦・小潮', description: '日月方向相差 90°', parameters: { phase: 90, exaggeration: 0.2 }, cameraPreset: 'top' },
      { id: 'spring-full', label: '望・大潮', description: '日月引潮力成一直線', parameters: { phase: 180, exaggeration: 0.28 }, cameraPreset: 'top' },
      { id: 'neap-last', label: '下弦・小潮', description: '日月方向相差 90°', parameters: { phase: 270, exaggeration: 0.2 }, cameraPreset: 'top' }
    ]
  },
  {
    id: 'kepler',
    shortLabel: '克卜勒',
    title: '克卜勒與行星運動',
    eyebrow: '速度不是固定，規律藏在面積裡',
    description: '拖動離心率與時間，讓橢圓、焦點、等面積與公轉週期在同一畫面說話。',
    grades: '高中必修・加深加廣',
    curriculumCodes: ['PEb-Vc-3', 'EFb-Va-1'],
    focus: ['太陽位於橢圓的一個焦點', '等時間掃過等面積', '軌道越大，公轉週期越長', '第谷觀測 → 克卜勒橢圓定律 → 牛頓萬有引力；地心視角是座標選擇，不等於歷史地心說'],
    misconception: '行星不是以固定速度沿橢圓前進；接近太陽時較快，遠離太陽時較慢。',
    controls: [
      { key: 'eccentricity', label: '離心率 e', min: 0, max: .85, step: .01, unit: '' },
      { key: 'semiMajor', label: '半長軸 a', min: .3, max: 10, step: .1, unit: ' AU' },
      { key: 'planetIndex', label: '真實模式行星', min: 0, max: 5, step: 1, unit: '', availableInReal: true, onlyInReal: true, options: [{ value: 0, label: '水星' }, { value: 1, label: '金星' }, { value: 2, label: '地球' }, { value: 3, label: '火星' }, { value: 4, label: '木星' }, { value: 5, label: '土星' }] },
      { key: 'viewMode', label: '參考系與比較', min: 0, max: 2, step: 1, unit: '', availableInReal: true, options: [{ value: 0, label: '日心・橢圓定律' }, { value: 1, label: '日心・行星比較' }, { value: 2, label: '地心・火星逆行' }] }
    ],
    defaultParameters: { eccentricity: 0.45, semiMajor: 3, meanAnomaly: 35, viewMode: 0, planetIndex: 3 },
    presets: [
      { id: 'first-law', label: '第一定律', description: '橢圓與兩個焦點', parameters: { eccentricity: 0.45, semiMajor: 3, meanAnomaly: 35, viewMode: 0 }, cameraPreset: 'top' },
      { id: 'second-law', label: '第二定律', description: '等時間掃過等面積', parameters: { eccentricity: 0.55, semiMajor: 3, meanAnomaly: 15, viewMode: 0 }, cameraPreset: 'angled' },
      { id: 'third-law', label: '第三定律', description: '比較軌道尺度與週期', parameters: { eccentricity: 0.12, semiMajor: 4, meanAnomaly: 120, viewMode: 1 }, cameraPreset: 'top' },
      { id: 'retrograde', label: '火星逆行', description: '切到地心參考系', parameters: { eccentricity: 0.09, semiMajor: 3.6, meanAnomaly: 205, viewMode: 2 }, cameraPreset: 'top' }
    ]
  }
]

export const SCENE_DEFINITIONS: readonly SceneDefinition[] = Object.freeze(definitions)

export const SCENE_BY_ID: Readonly<Record<SceneId, SceneDefinition>> = Object.freeze(
  Object.fromEntries(SCENE_DEFINITIONS.map((definition) => [definition.id, definition])) as Record<SceneId, SceneDefinition>
)
