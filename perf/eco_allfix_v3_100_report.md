# Eco Stress Report

- **Seed:** 1
- **Turns:** 100
- **Mode:** browser
- **Nations:** 902
- **Wall-time:** 418695 ms (сборка 2840 ms, симуляция 415855 ms)
- **Timestamp:** 2026-04-19T11:04:54.282Z

## Жёсткие инварианты

✅ Нарушений не найдено.

## Поведенческие аномалии

⚠ Найдено **118** паттернов по 5 типам:

| Тип | Кол-во |
|-----|-------:|
| `chronic_shortage` | 5 |
| `stuck_price` | 18 |
| `market_vanish` | 4 |
| `exponential_stock` | 90 |
| `systemic_deficit` | 1 |

### Подробности

- ход **23** · `chronic_shortage` · товар `incense` · shortage_streak=8 держится 15+ ходов подряд
- ход **23** · `chronic_shortage` · товар `purple_dye` · shortage_streak=8 держится 15+ ходов подряд
- ход **23** · `chronic_shortage` · товар `slaves` · shortage_streak=8 держится 15+ ходов подряд
- ход **24** · `chronic_shortage` · товар `iron` · shortage_streak=8 держится 15+ ходов подряд
- ход **25** · `chronic_shortage` · товар `fish` · shortage_streak=8 держится 15+ ходов подряд
- ход **101** · `stuck_price` · товар `wheat` · амплитуда 0.00% за 50 ходов
- ход **101** · `stuck_price` · товар `barley` · амплитуда 0.00% за 50 ходов
- ход **101** · `stuck_price` · товар `tuna` · амплитуда 0.00% за 50 ходов
- ход **101** · `stuck_price` · товар `olives` · амплитуда 0.00% за 50 ходов
- ход **101** · `stuck_price` · товар `olive_oil` · амплитуда 0.00% за 50 ходов
- ход **101** · `stuck_price` · товар `honey` · амплитуда 0.00% за 50 ходов
- ход **101** · `stuck_price` · товар `wine` · амплитуда 0.00% за 50 ходов
- ход **101** · `stuck_price` · товар `salt` · амплитуда 0.00% за 50 ходов
- ход **101** · `stuck_price` · товар `timber` · амплитуда 0.00% за 50 ходов
- ход **101** · `stuck_price` · товар `wool` · амплитуда 0.00% за 50 ходов
- ход **101** · `stuck_price` · товар `cloth` · амплитуда 0.00% за 50 ходов
- ход **101** · `stuck_price` · товар `leather` · амплитуда 0.00% за 50 ходов
- ход **101** · `stuck_price` · товар `pottery` · амплитуда 0.00% за 50 ходов
- ход **101** · `stuck_price` · товар `papyrus` · амплитуда 0.00% за 50 ходов
- ход **101** · `stuck_price` · товар `wax` · амплитуда 0.00% за 50 ходов
- ход **101** · `stuck_price` · товар `trade_goods` · амплитуда 0.00% за 50 ходов
- ход **101** · `stuck_price` · товар `sulfur` · амплитуда 0.00% за 50 ходов
- ход **101** · `stuck_price` · товар `cattle` · амплитуда 0.00% за 50 ходов
- ход **11** · `market_vanish` · товар `purple_dye` · supply=0 подряд 10+ ходов
- ход **11** · `market_vanish` · товар `slaves` · supply=0 подряд 10+ ходов
- ход **54** · `market_vanish` · товар `cattle` · supply=0 подряд 10+ ходов
- ход **62** · `market_vanish` · товар `horses` · supply=0 подряд 10+ ходов
- ход **101** · `exponential_stock` · нация `orobii` · товар `olive_oil` · 1444 → 17609 (×12.2) за 50 ходов
- ход **101** · `exponential_stock` · нация `orobii` · товар `olives` · 500 → 7058 (×14.1) за 50 ходов
- ход **101** · `exponential_stock` · нация `orobii` · товар `wax` · 831 → 10006 (×12.0) за 50 ходов
- ход **101** · `exponential_stock` · нация `syracuse` · товар `olives` · 115 → 2647 (×22.9) за 50 ходов
- ход **101** · `exponential_stock` · нация `acarnania` · товар `cloth` · 1590 → 32694 (×20.6) за 50 ходов
- ход **101** · `exponential_stock` · нация `acarnania` · товар `leather` · 275 → 13286 (×48.2) за 50 ходов
- ход **101** · `exponential_stock` · нация `acarnania` · товар `tools` · 231 → 17165 (×74.3) за 50 ходов
- ход **101** · `exponential_stock` · нация `taulantii` · товар `salt` · 26084 → 274761 (×10.5) за 50 ходов
- ход **101** · `exponential_stock` · нация `taulantii` · товар `wine` · 22585 → 227536 (×10.1) за 50 ходов
- ход **101** · `exponential_stock` · нация `taulantii` · товар `cloth` · 35763 → 432021 (×12.1) за 50 ходов
- ход **101** · `exponential_stock` · нация `taulantii` · товар `pottery` · 31054 → 347128 (×11.2) за 50 ходов
- ход **101** · `exponential_stock` · нация `taulantii` · товар `tools` · 18520 → 219002 (×11.8) за 50 ходов
- ход **101** · `exponential_stock` · нация `taulantii` · товар `iron` · 1970 → 24642 (×12.5) за 50 ходов
- ход **101** · `exponential_stock` · нация `taulantii` · товар `bronze` · 9093 → 109281 (×12.0) за 50 ходов
- ход **101** · `exponential_stock` · нация `brutii` · товар `wheat` · 7995 → 287296 (×35.9) за 50 ходов
- ход **101** · `exponential_stock` · нация `insubri` · товар `cloth` · 6406 → 65783 (×10.3) за 50 ходов
- ход **101** · `exponential_stock` · нация `salassi` · товар `wine` · 214 → 3420 (×15.9) за 50 ходов
- ход **101** · `exponential_stock` · нация `mauretania` · товар `iron` · 270 → 4668 (×17.3) за 50 ходов
- ход **101** · `exponential_stock` · нация `kyzikios` · товар `cloth` · 750 → 16544 (×22.1) за 50 ходов
- ход **101** · `exponential_stock` · нация `kyzikios` · товар `tools` · 237 → 8421 (×35.5) за 50 ходов
- ход **101** · `exponential_stock` · нация `maeotae` · товар `barley` · 557 → 9139 (×16.4) за 50 ходов
- ход **101** · `exponential_stock` · нация `apasiacae` · товар `leather` · 837 → 11002 (×13.1) за 50 ходов
- ход **101** · `exponential_stock` · нация `apasiacae` · товар `pottery` · 925 → 19887 (×21.5) за 50 ходов
- ход **101** · `exponential_stock` · нация `apasiacae` · товар `tools` · 264 → 12416 (×47.0) за 50 ходов
- ход **101** · `exponential_stock` · нация `arismaspians` · товар `honey` · 1270 → 23329 (×18.4) за 50 ходов
- ход **101** · `exponential_stock` · нация `arismaspians` · товар `barley` · 7734 → 121181 (×15.7) за 50 ходов
- ход **101** · `exponential_stock` · нация `arismaspians` · товар `wool` · 964 → 22699 (×23.6) за 50 ходов
- ход **101** · `exponential_stock` · нация `carpetani` · товар `barley` · 562 → 7503 (×13.3) за 50 ходов
- ход **101** · `exponential_stock` · нация `carpetani` · товар `tools` · 490 → 8269 (×16.9) за 50 ходов
- ход **101** · `exponential_stock` · нация `celtiberi` · товар `wheat` · 19161 → 6735411 (×351.5) за 50 ходов
- ход **101** · `exponential_stock` · нация `celtiberi` · товар `olive_oil` · 1160 → 447818 (×386.2) за 50 ходов
- ход **101** · `exponential_stock` · нация `celtiberi` · товар `cloth` · 2220 → 919021 (×414.0) за 50 ходов
- ход **101** · `exponential_stock` · нация `celtiberi` · товар `pottery` · 761 → 458688 (×603.0) за 50 ходов
- ход **101** · `exponential_stock` · нация `celtiberi` · товар `papyrus` · 1227 → 559550 (×456.1) за 50 ходов
- ход **101** · `exponential_stock` · нация `celtiberi` · товар `wax` · 694 → 314390 (×453.2) за 50 ходов
- ход **101** · `exponential_stock` · нация `celtiberi` · товар `honey` · 1256 → 403649 (×321.5) за 50 ходов
- ход **101** · `exponential_stock` · нация `celtiberi` · товар `barley` · 9465 → 2327181 (×245.9) за 50 ходов
- ход **101** · `exponential_stock` · нация `celtiberi` · товар `tools` · 203 → 3823 (×18.8) за 50 ходов
- ход **101** · `exponential_stock` · нация `derbices` · товар `tools` · 247 → 3513 (×14.2) за 50 ходов
- ход **101** · `exponential_stock` · нация `goguryeo` · товар `wheat` · 54977 → 887425 (×16.1) за 50 ходов
- ход **101** · `exponential_stock` · нация `goguryeo` · товар `wine` · 4841 → 71547 (×14.8) за 50 ходов
- ход **101** · `exponential_stock` · нация `goguryeo` · товар `olive_oil` · 7298 → 92678 (×12.7) за 50 ходов
- ход **101** · `exponential_stock` · нация `goguryeo` · товар `olives` · 8496 → 115981 (×13.7) за 50 ходов
- ход **101** · `exponential_stock` · нация `goguryeo` · товар `papyrus` · 2751 → 34904 (×12.7) за 50 ходов
- ход **101** · `exponential_stock` · нация `goguryeo` · товар `wax` · 2475 → 31434 (×12.7) за 50 ходов
- ход **101** · `exponential_stock` · нация `goguryeo` · товар `barley` · 26306 → 291170 (×11.1) за 50 ходов
- ход **101** · `exponential_stock` · нация `goguryeo` · товар `tools` · 477 → 5708 (×12.0) за 50 ходов
- ход **101** · `exponential_stock` · нация `goguryeo` · товар `iron` · 2906 → 49853 (×17.2) за 50 ходов
- ход **101** · `exponential_stock` · нация `goguryeo` · товар `stone` · 429 → 7346 (×17.1) за 50 ходов
- ход **101** · `exponential_stock` · нация `goguryeo` · товар `bronze` · 193 → 3687 (×19.1) за 50 ходов
- ход **101** · `exponential_stock` · нация `gortyna` · товар `cloth` · 2694 → 34530 (×12.8) за 50 ходов
- ход **101** · `exponential_stock` · нация `gortyna` · товар `tools` · 1361 → 17794 (×13.1) за 50 ходов
- ход **101** · `exponential_stock` · нация `gortyna` · товар `pottery` · 1766 → 26417 (×15.0) за 50 ходов
- ход **101** · `exponential_stock` · нация `gortyna` · товар `leather` · 893 → 13218 (×14.8) за 50 ходов
- ход **101** · `exponential_stock` · нация `gortyna` · товар `wine` · 833 → 13158 (×15.8) за 50 ходов
- ход **101** · `exponential_stock` · нация `gortyna` · товар `bronze` · 555 → 8772 (×15.8) за 50 ходов
- ход **101** · `exponential_stock` · нация `hippasii` · товар `wheat` · 9867 → 176539 (×17.9) за 50 ходов
- ход **101** · `exponential_stock` · нация `hippasii` · товар `olive_oil` · 755 → 16296 (×21.6) за 50 ходов
- ход **101** · `exponential_stock` · нация `hippasii` · товар `olives` · 544 → 11248 (×20.7) за 50 ходов
- ход **101** · `exponential_stock` · нация `hippasii` · товар `papyrus` · 539 → 12853 (×23.9) за 50 ходов
- ход **101** · `exponential_stock` · нация `hippasii` · товар `wax` · 366 → 8661 (×23.7) за 50 ходов
- ход **101** · `exponential_stock` · нация `hippasii` · товар `barley` · 4888 → 68360 (×14.0) за 50 ходов
- ход **101** · `exponential_stock` · нация `hippasii` · товар `tools` · 217 → 4519 (×20.8) за 50 ходов
- ход **101** · `exponential_stock` · нация `hippasii` · товар `stone` · 130 → 7323 (×56.3) за 50 ходов
- ход **101** · `exponential_stock` · нация `hunyu` · товар `olives` · 153 → 2463 (×16.1) за 50 ходов
- ход **101** · `exponential_stock` · нация `kazusa` · товар `cloth` · 750 → 9097 (×12.1) за 50 ходов
- ход **101** · `exponential_stock` · нация `kazusa` · товар `tools` · 247 → 4632 (×18.8) за 50 ходов
- ход **101** · `exponential_stock` · нация `odessa` · товар `cloth` · 750 → 30607 (×40.8) за 50 ходов
- ход **101** · `exponential_stock` · нация `odessa` · товар `tools` · 313 → 16932 (×54.1) за 50 ходов
- ход **101** · `exponential_stock` · нация `oreos` · товар `cloth` · 750 → 13054 (×17.4) за 50 ходов
- ход **101** · `exponential_stock` · нация `oreos` · товар `tools` · 263 → 7079 (×26.9) за 50 ходов
- ход **101** · `exponential_stock` · нация `solymia` · товар `iron` · 164 → 2652 (×16.2) за 50 ходов
- ход **101** · `exponential_stock` · нация `van_lang` · товар `wine` · 2290 → 52293 (×22.8) за 50 ходов
- ход **101** · `exponential_stock` · нация `van_lang` · товар `cloth` · 6094 → 124433 (×20.4) за 50 ходов
- ход **101** · `exponential_stock` · нация `van_lang` · товар `leather` · 2337 → 52341 (×22.4) за 50 ходов
- ход **101** · `exponential_stock` · нация `van_lang` · товар `pottery` · 4570 → 104493 (×22.9) за 50 ходов
- ход **101** · `exponential_stock` · нация `van_lang` · товар `tools` · 3324 → 69860 (×21.0) за 50 ходов
- ход **101** · `exponential_stock` · нация `van_lang` · товар `bronze` · 1527 → 34863 (×22.8) за 50 ходов
- ход **101** · `exponential_stock` · нация `alauni` · товар `olive_oil` · 110 → 2314 (×21.1) за 50 ходов
- ход **101** · `exponential_stock` · нация `alauni` · товар `wool` · 319 → 4593 (×14.4) за 50 ходов
- ход **101** · `exponential_stock` · нация `caucasian_albania` · товар `salt` · 108019 → 2912062 (×27.0) за 50 ходов
- ход **101** · `exponential_stock` · нация `caucasian_albania` · товар `wine` · 51794 → 1727627 (×33.4) за 50 ходов
- ход **101** · `exponential_stock` · нация `caucasian_albania` · товар `cloth` · 121602 → 4494928 (×37.0) за 50 ходов
- ход **101** · `exponential_stock` · нация `caucasian_albania` · товар `leather` · 51841 → 1727675 (×33.3) за 50 ходов
- ход **101** · `exponential_stock` · нация `caucasian_albania` · товар `pottery` · 103584 → 3455199 (×33.4) за 50 ходов
- ход **101** · `exponential_stock` · нация `caucasian_albania` · товар `tools` · 69368 → 2303717 (×33.2) за 50 ходов
- ход **101** · `exponential_stock` · нация `caucasian_albania` · товар `bronze` · 34529 → 1151752 (×33.4) за 50 ходов
- ход **101** · `exponential_stock` · нация `verbigeni` · товар `iron` · 228 → 3303 (×14.5) за 50 ходов
- ход **101** · `exponential_stock` · нация `gelonii` · товар `wool` · 144 → 3958 (×27.4) за 50 ходов
- ход **101** · `exponential_stock` · нация `cosuaneti` · товар `iron` · 223 → 5893 (×26.4) за 50 ходов
- ход **10** · `systemic_deficit` · 85% наций в минусе подряд 5+ ходов

## Динамика казны (начало → конец прогонa)

### Топ-5 рост

| Нация | От | До | Δ |
|-------|----:|----:|---:|
| `seleukid_empire` | 67 560 | 54 550 043 | +54 482 483 |
| `maurya_empire` | 33 933 | 53 655 714 | +53 621 781 |
| `chu` | 15 923 | 21 168 586 | +21 152 663 |
| `qin` | 19 725 | 14 386 290 | +14 366 565 |
| `bosporan_kingdom` | 12 320 | 7 612 542 | +7 600 222 |

### Топ-5 падение

| Нация | От | До | Δ |
|-------|----:|----:|---:|
| `insubri` | 4 162 | -3 677 461 | -3 681 623 |
| `getae` | 900 | -2 827 860 | -2 828 760 |
| `cenomanni` | 3 341 | -2 531 967 | -2 535 308 |
| `xiongnu` | 1 136 | -2 152 580 | -2 153 716 |
| `zhao` | 8 107 | -1 721 068 | -1 729 175 |

## Дисперсия цен (CV = σ/μ)

| Товар | Среднее | σ | CV% | p10 | p50 | p90 |
|-------|--------:|---:|----:|----:|----:|----:|
| `iron` | 268.04 | 135.61 | 50.6% | 75.09 | 272.31 | 450.00 |
| `fish` | 96.07 | 47.83 | 49.8% | 24.34 | 102.03 | 150.00 |
| `slaves` | 847.71 | 405.61 | 47.8% | 288.10 | 845.88 | 1403.66 |
| `incense` | 320.95 | 147.76 | 46.0% | 117.09 | 320.29 | 523.48 |
| `purple_dye` | 912.19 | 370.84 | 40.7% | 400.55 | 910.52 | 1420.49 |
| `tools` | 46.27 | 17.29 | 37.4% | 25.00 | 44.25 | 71.65 |
| `horses` | 83.42 | 28.32 | 33.9% | 60.00 | 64.57 | 130.75 |
| `bronze` | 51.87 | 15.57 | 30.0% | 31.35 | 50.55 | 75.00 |
| `cattle` | 42.17 | 11.89 | 28.2% | 35.00 | 35.00 | 63.82 |
| `trade_goods` | 14.20 | 3.41 | 24.0% | 12.50 | 12.50 | 20.27 |
| `papyrus` | 21.58 | 5.19 | 24.0% | 19.00 | 19.00 | 30.82 |
| `pottery` | 8.40 | 1.95 | 23.3% | 7.50 | 7.50 | 11.76 |
| `wax` | 13.99 | 3.25 | 23.3% | 12.50 | 12.50 | 19.60 |
| `sulfur` | 22.25 | 5.15 | 23.2% | 20.00 | 20.00 | 30.84 |
| `cloth` | 15.58 | 3.56 | 22.9% | 14.00 | 14.00 | 21.57 |
| `wool` | 11.07 | 2.49 | 22.5% | 10.00 | 10.00 | 15.14 |
| `leather` | 15.50 | 3.49 | 22.5% | 14.00 | 14.00 | 21.20 |
| `honey` | 24.90 | 5.61 | 22.5% | 22.50 | 22.50 | 34.07 |
| `wine` | 16.45 | 3.59 | 21.8% | 15.00 | 15.00 | 21.90 |
| `timber` | 12.06 | 2.63 | 21.8% | 11.00 | 11.00 | 16.06 |
| `olive_oil` | 17.41 | 3.70 | 21.2% | 16.00 | 16.00 | 22.50 |
| `olives` | 9.79 | 2.08 | 21.2% | 9.00 | 9.00 | 12.65 |
| `wheat` | 5.38 | 1.12 | 20.8% | 5.00 | 5.00 | 6.34 |
| `salt` | 9.68 | 1.95 | 20.1% | 9.00 | 9.00 | 11.68 |
| `tuna` | 11.83 | 2.38 | 20.1% | 11.00 | 11.00 | 14.28 |
| `barley` | 3.75 | 0.74 | 19.6% | 3.50 | 3.50 | 4.35 |
