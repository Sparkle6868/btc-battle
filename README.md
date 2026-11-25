# ⚔️ BTC War Room · 比特币多空指挥室

比特币（BTC）专属的实时多空作战指挥室：**蓝军 = 多（买方）**，**红军 = 空（卖方）**。

- **三所实时报价 & 美盘溢价**：顶栏实时对比 Binance / OKX / Coinbase 现货报价与 **Coinbase 溢价（CB - BN）**，点击即可切换主数据源
- **实时 K 线走势 & 多周期矩阵**：内置 `1m / 5m / 15m / 1h` 纯 Canvas K 线图与成交量，配合 `5m / 15m / 1h / 4h / 24h / 7d` 六周期涨跌矩阵
- **市场情绪与全球交易时段**：集成 **恐慌与贪婪指数（alternative.me）**、亚盘 / 欧盘 / 美盘 / 欧美重叠与 CME 交易状态、期现基差与三所最大价差
- **永续合约全景 & 双所爆仓战报流**：资金费率、期现基差、未平仓量（OI）、**大户持仓比 vs 散户人数比**，以及 **Binance + OKX 双所聚合实时爆仓流**
- **吃单 & 挂单 & 大单战报**：10 秒 / 1 分钟 / 5 分钟滚动主动买卖流、±0.5% / ±1% 盘口深度曲线、大单 / 巨鲸合并战报
- **战场动画 & 动态战歌**：前线位置由价格涨跌（50%）+ 吃单（30%）+ ±0.5% 盘口厚度（20%）驱动；Web Audio 实时合成太鼓与铜管随行情绪变化
- **一键分享战报**：生成 `1200×675` 高清战场战报 PNG（含 Coinbase 溢价与恐慌贪婪指数）
- **纯前端零维护**：无需 API Key，无后端依赖；HTML / CSS / JS ES Modules 直接部署在 GitHub Pages

> 仅供娱乐参考，不构成投资建议。

## 本地运行与版本戳

- 部署前运行 `node scripts/stamp.mjs`（或 `./stamp.sh`）更新 CSS / JS / Service Worker 缓存版本号。
- 语法检查：`for f in js/*.js sw.js scripts/stamp.mjs; do node --check "$f"; done`

---

<sub>本项目基于原作者大橙子（[@0xVeryBigOrange](https://x.com/0xVeryBigOrange)）的开源项目「Crypto War · 多空战场」二次修改。</sub>
