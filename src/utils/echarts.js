// ECharts 按需引入（S8）
// 为什么按需：`import * as echarts from 'echarts'` 会把全部图表类型与组件打进 bundle（体积大、首屏慢）；
// 本项目只用折线 / 雷达 / 环形 / 柱状 4 种图，所以从 `echarts/core` 引入，再用 `echarts.use` 注册最小集合。
// 约定：页面与组件统一 `import { echarts } from '@/utils/echarts'`，不要在业务代码里直接 import 'echarts'。
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, RadarChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

// 注册 S8 需要的图表类型 + 组件 + 渲染器：
// - 图表：支出趋势（折线）、营养摄入（雷达）、品类占比（环形/饼）、菜谱分布（柱状）
// - 组件：直角坐标系、Tooltip、图例、标题（标题由 ChartCard 用 HTML 渲染，这里保留 TitleComponent
//   供以后图内标题使用）
// - 渲染器：Canvas（项目不用 SVG，Canvas 性能足够且与 ECharts 默认行为一致）
echarts.use([
  LineChart,
  RadarChart,
  PieChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  CanvasRenderer,
])

export { echarts }
