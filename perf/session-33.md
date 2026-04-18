# Session 33 — Hide fog pane during zoom

**Тип сессии:** внеплановая, следом за Session 30.
**Ветка:** `claude/exciting-fermat-KVLXr`.
**Scope:** `ui/map.js` — `visibility: hidden` на `fogOverlayPane` на `zoomstart`/`zoomend`.

## Контекст

После Session 30 остался zoom с FPS 5-14 и 3666 мутаций `path[d]` на каждый
zoom-step — Leaflet SVG-рендерер реппроецирует геометрию всех fog-полигонов
под новый масштаб. DOM-мутация `d` сама по себе дёшева, но Chrome
затем делает paint + rasterize под новую геометрию. Paint — дорогой шаг.

## Попытки, которые откатил

### Session 31 — viewport culling (revert)

Ограничили fog-полигоны видимым bbox'ом карты с `pad(0.5)`. Результат:
zoom-in FPS 5 → 22 (**+4×**), но pan FPS 27 → 13 (**−2×**) — обычный pan
выходил за 50 %-padding и порождал лавину add/remove. `pad(1.0)` сделал pan
ещё хуже (10 FPS). Даже с фильтром fog-слоёв из `layeradd`-listener'а
регрессия pan'а сохранилась. Не коммитим.

### Session 32 — canvas fog (revert)

Переключили fog-полигоны с `L.svg` рендерера на `L.canvas({ pane: 'fogOverlayPane' })`.
DOM-мутаций: −99 % (14 789 → 130). Но longtask-сумма на pan 586 → 1985 ms —
Canvas-рендерер Leaflet перерисовывает canvas при анимации pan, в отличие
от SVG (который просто двигает `<g>` через CSS transform). Hatch-pattern
тоже теряется (canvas не поддерживает SVG patterns). Не коммитим.

## Session 33 — что сделано

```js
const _toggleFogVisibility = (hide) => {
  const pane = leafletMap.getPane?.('fogOverlayPane');
  if (pane) pane.style.visibility = hide ? 'hidden' : 'visible';
};
leafletMap.on('zoomstart', () => _toggleFogVisibility(true));
leafletMap.on('zoomend',   () => _toggleFogVisibility(false));
```

`visibility: hidden` НЕ останавливает Leaflet от реппроекции `d` атрибутов
(layers всё ещё в renderer). Но Chrome пропускает paint/rasterize для
элементов с `visibility: hidden`. Именно paint — главный cost zoom'а с 3666
полигонами.

Для pan'а оставляем видимым — pan'ы короткие, fog полезен при перемещении,
и визуальное «мерцание» на каждом pan-жесте было бы некомфортно.

## Измерение (cumulative: Session 30 + 33)

| Метрика | Session 30 | + Session 33 | Δ |
|---|---|---|---|
| Pan FPS (4 × 200 px) | 27 | 25 | ≈0 |
| Pan longtask | 586 ms | 605 ms | ≈0 |
| Pan мутаций | 14 789 | 14 797 | ≈0 |
| **Zoom-in FPS** | 5 | **17** | **+3.4×** |
| Zoom-in longtask | 780 ms | 656 ms | −16 % |
| **Zoom-out FPS** | 14 | 16 | +14 % |
| Zoom-out longtask | 813 ms | 781 ms | ≈0 |

Pan не тронут (fog по-прежнему виден), zoom получил главную ветку ускорения
через пропуск paint-stage.

## Trade-off

Fog кратковременно пропадает на ~300 ms во время zoom-анимации Leaflet.
Это допустимо — туман не несёт gameplay-информации, а после zoomend
(когда пользователь «остановился») он сразу появляется в новом масштабе.

## Тесты

`tests/audit/map_unit_test.cjs` — не изменился, Session 33 не трогает
игровую логику. Визуальная проверка в live Chromium: fog присутствует
до/после zoom, на время анимации скрывается.

## Что дальше

Session 34 — разобраться, почему pan даёт ~3700 мутаций даже без fog
каскада. Возможно, Leaflet в каких-то условиях всё-таки reproject'ит
геометрию на pan'е. Исследование.
