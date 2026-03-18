// ══════════════════════════════════════════════════════════════════════════
//  ДВИЖОК РЕЛИГИИ — Сицилия ~301 до н.э.
//
//  Структура GAME_STATE:
//    .religions          — { id: { institutionalization, ... } }    (копия из RELIGIONS)
//    .region_religions   — { regionId: { official, beliefs: [...] } }
//    .religion_policy    — { nationId: { patronage: null|id, persecution: null|id } }
//    .syncretic_religions — { id: { ... } }  (рождённые синкретизмом)
//    ._religion_coexist  — { regionId_relA_relB: turns }  (счётчик сосуществования)
//
//  Тик-цикл:
//    Каждый ход:    updateInstitutionalization(), applyReligionBonuses()
//    Каждые 12 ходов: processReligionSpread(), checkSyncretism(),
//                     processReligionEvents(), checkReligiousCrisis()
// ══════════════════════════════════════════════════════════════════════════

// ── ИНИЦИАЛИЗАЦИЯ ────────────────────────────────────────────────────────

function initReligions() {
  if (GAME_STATE.religions) return; // уже инициализировано (загрузка)

  GAME_STATE.religions = {};
  for (const [id, def] of Object.entries(RELIGIONS)) {
    GAME_STATE.religions[id] = {
      id,
      name: def.name,
      group: def.group,
      color: def.color,
      icon: def.icon,
      institutionalization: def.institutionalization,
      sacred_sites: [...def.sacred_sites],
    };
  }

  GAME_STATE.syncretic_religions = GAME_STATE.syncretic_religions || {};
  GAME_STATE._religion_coexist = GAME_STATE._religion_coexist || {};
}

function initRegionReligions() {
  if (GAME_STATE.region_religions) return;

  GAME_STATE.region_religions = {};
  for (const [regionId, def] of Object.entries(REGION_RELIGIONS)) {
    GAME_STATE.region_religions[regionId] = {
      official: def.official,
      beliefs: (def.beliefs || []).map(b => ({ ...b })),
    };
  }

  // Регионы без начальных данных — назначаем по культуре
  for (const regionId of Object.keys(GAME_STATE.regions || {})) {
    if (!GAME_STATE.region_religions[regionId]) {
      GAME_STATE.region_religions[regionId] = _inferReligionFromCulture(regionId);
    }
  }

  // Политика наций
  GAME_STATE.religion_policy = GAME_STATE.religion_policy || {};
  for (const nationId of Object.keys(GAME_STATE.nations || {})) {
    if (!GAME_STATE.religion_policy[nationId]) {
      GAME_STATE.religion_policy[nationId] = { patronage: null, persecution: null };
    }
  }
}

function _inferReligionFromCulture(regionId) {
  const rc = GAME_STATE.region_cultures?.[regionId];
  const cultureToReligion = {
    greek_sicilian: 'olympian',
    greek_colonial: 'olympian',
    punic_sicilian: 'punic_pantheon',
    sikel: 'earth_spirits',
    sican: 'sican_earth',
    elymian: 'elymian_aphrodite',
  };
  const primary = rc?.primary || 'greek_sicilian';
  const rel = cultureToReligion[primary] || 'olympian';
  return {
    official: rel,
    beliefs: [{ religion: rel, fervor: 0.50 }],
  };
}

// ── ГЛАВНЫЙ ТИК ──────────────────────────────────────────────────────────

function religionTick() {
  initReligions();
  initRegionReligions();

  // Гарантируем инициализацию religion_policy для всех наций
  if (!GAME_STATE.religion_policy) GAME_STATE.religion_policy = {};
  for (const nationId of Object.keys(GAME_STATE.nations)) {
    if (!GAME_STATE.religion_policy[nationId]) {
      GAME_STATE.religion_policy[nationId] = { patronage: null, persecution: null };
    }
  }

  const turn = GAME_STATE.turn || 0;

  // Каждый ход
  for (const nationId of Object.keys(GAME_STATE.nations)) {
    _updateInstitutionalization(nationId);
    _applyReligionPolicy(nationId);
  }

  // Каждые 12 ходов (1 год)
  if (turn % 12 === 0) {
    for (const nationId of Object.keys(GAME_STATE.nations)) {
      _processReligionSpread(nationId);
      _processReligionEvents(nationId);
    }
    _checkSyncretism();

    // Каждые 10 лет — кризисы
    if (turn % RELIGION_CONFIG.CRISIS_CHECK_INTERVAL === 0 && turn > 0) {
      for (const nationId of Object.keys(GAME_STATE.nations)) {
        _checkReligiousCrisis(nationId);
      }
    }
  }
}

// ── ИНСТИТУЦИОНАЛИЗАЦИЯ ──────────────────────────────────────────────────

function _updateInstitutionalization(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  // Собираем: какие религии представлены в регионах этой нации
  const relInst = {};
  for (const regionId of (nation.regions || [])) {
    const rr = GAME_STATE.region_religions[regionId];
    if (!rr) continue;
    for (const b of rr.beliefs) {
      if (!relInst[b.religion]) relInst[b.religion] = { totalFervor: 0, temples: 0 };
      relInst[b.religion].totalFervor += b.fervor;
    }
    // Храмы увеличивают институционализацию
    const region = GAME_STATE.regions[regionId];
    if (region?.buildings) {
      for (const bld of region.buildings) {
        if (_isBuildingReligious(bld)) {
          const rel = rr.official || (rr.beliefs[0]?.religion);
          if (rel && relInst[rel]) relInst[rel].temples++;
        }
      }
    }
  }

  const stability = nation.government?.stability || 50;
  const atWar = (nation.military?.at_war_with || []).length > 0;

  for (const [relId, data] of Object.entries(relInst)) {
    const rel = GAME_STATE.religions[relId] || GAME_STATE.syncretic_religions?.[relId];
    if (!rel) continue;

    let delta = 0;
    // Храмы → рост
    delta += data.temples * RELIGION_CONFIG.INST_GROWTH_PER_TEMPLE / 12;
    // Стабильность → рост
    if (stability > 60) delta += RELIGION_CONFIG.INST_GROWTH_STABILITY / 12;
    // Война → упадок
    if (atWar) delta -= RELIGION_CONFIG.INST_DECAY_WAR / 12;

    rel.institutionalization = _clamp(rel.institutionalization + delta, 0, 100);
  }
}

// ── ПОЛИТИКА: ПОКРОВИТЕЛЬСТВО И ГОНЕНИЯ ──────────────────────────────────

function _applyReligionPolicy(nationId) {
  const policy = GAME_STATE.religion_policy?.[nationId];
  if (!policy) return;

  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  for (const regionId of (nation.regions || [])) {
    const rr = GAME_STATE.region_religions[regionId];
    if (!rr) continue;

    for (const b of rr.beliefs) {
      // Покровительство: медленный рост fervor
      if (policy.patronage === b.religion) {
        b.fervor = Math.min(1, b.fervor + RELIGION_CONFIG.OFFICIAL_RELIGION_BONUS / 12);
      }

      // Гонения: потеря fervor, но рискованно
      if (policy.persecution === b.religion) {
        b.fervor = Math.max(0, b.fervor - RELIGION_CONFIG.PERSECUTION_FERVOR_LOSS / 12);
      }
    }

    // Покровительство может добавить новую веру
    if (policy.patronage && !rr.beliefs.find(b => b.religion === policy.patronage)) {
      rr.beliefs.push({ religion: policy.patronage, fervor: 0.01 });
    }

    // Очистка: удаляем мёртвые верования
    rr.beliefs = rr.beliefs.filter(b => b.fervor > 0.005);
  }

  // Покровительство стоит денег
  if (policy.patronage) {
    nation.economy.treasury -= RELIGION_CONFIG.PATRONAGE_COST_PER_TURN;
    if (nation.economy.treasury < 0) {
      policy.patronage = null; // не хватает денег
    }
  }

  // Гонения стоят счастья
  if (policy.persecution) {
    // Проверяем раз в 12 ходов чтобы не обнулить мгновенно
    if ((GAME_STATE.turn % 12) === 0) {
      nation.population.happiness = Math.max(0,
        nation.population.happiness - RELIGION_CONFIG.PERSECUTION_HAPPINESS_COST);
    }
  }
}

// ── РАСПРОСТРАНЕНИЕ РЕЛИГИИ ──────────────────────────────────────────────

function _processReligionSpread(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  for (const regionId of (nation.regions || [])) {
    const rr = GAME_STATE.region_religions[regionId];
    if (!rr) continue;

    // 1. Официальная религия растёт естественно
    const officialBelief = rr.beliefs.find(b => b.religion === rr.official);
    if (officialBelief) {
      officialBelief.fervor = Math.min(1, officialBelief.fervor + 0.005);
    } else if (rr.official) {
      rr.beliefs.push({ religion: rr.official, fervor: 0.02 });
    }

    // 2. Священные места — мощный бонус
    for (const b of rr.beliefs) {
      const def = _getReligionDef(b.religion);
      if (def?.sacred_sites?.includes(regionId)) {
        b.fervor = Math.min(1, b.fervor + RELIGION_CONFIG.SPREAD_SACRED_SITE_BONUS);
      }
    }

    // 3. Распространение по торговым путям
    const tradeRoutes = nation.economy?.trade_routes || [];
    for (const route of tradeRoutes) {
      const partnerId = route.partner || route.nation;
      const partnerNation = GAME_STATE.nations[partnerId];
      if (!partnerNation) continue;

      // Находим доминирующую религию партнёра
      const partnerRel = _getNationDominantReligion(partnerId);
      if (!partnerRel) continue;

      const def = _getReligionDef(partnerRel);
      if (!def || def.spread_method !== 'trade') continue;

      // Проверяем affinity
      const groupMod = RELIGION_GROUPS[def.group]?.spread_modifier || 1.0;
      const rate = RELIGION_CONFIG.SPREAD_BASE_RATE * RELIGION_CONFIG.SPREAD_TRADE_MULTIPLIER * groupMod;

      _addFervor(rr, partnerRel, rate);
    }

    // 4. Мистериальные культы распространяются независимо от государства
    // Условие: город > 5000 населения + счастье < 50 (люди ищут утешение)
    const region = GAME_STATE.regions[regionId];
    const pop = region?.population || 0;
    const happiness = nation.population?.happiness || 50;

    if (pop > 5000 && happiness < 50) {
      _addFervor(rr, 'dionysian', RELIGION_CONFIG.SPREAD_BASE_RATE * 1.5);
      _addFervor(rr, 'demeter_kore', RELIGION_CONFIG.SPREAD_BASE_RATE * 0.8);
    }

    // 5. Диффузия от соседних регионов
    const neighbors = _getNeighborRegions(regionId, nationId);
    for (const nbrId of neighbors) {
      const nbrRr = GAME_STATE.region_religions[nbrId];
      if (!nbrRr) continue;
      for (const nb of nbrRr.beliefs) {
        if (nb.fervor > 0.3) {
          _addFervor(rr, nb.religion, RELIGION_CONFIG.SPREAD_NEIGHBOR_RATE * nb.fervor);
        }
      }
    }

    // 6. Естественное угасание малых верований
    for (const b of rr.beliefs) {
      if (b.fervor < 0.1 && b.religion !== rr.official) {
        b.fervor *= 0.95; // медленное угасание
      }
    }

    // Очистка
    rr.beliefs = rr.beliefs.filter(b => b.fervor > 0.005);
  }
}

function _addFervor(rr, religionId, amount) {
  const existing = rr.beliefs.find(b => b.religion === religionId);
  if (existing) {
    existing.fervor = Math.min(1, existing.fervor + amount);
  } else if (amount > 0.005) {
    rr.beliefs.push({ religion: religionId, fervor: amount });
  }
}

// ── СИНКРЕТИЗМ ───────────────────────────────────────────────────────────

function _checkSyncretism() {
  const coexist = GAME_STATE._religion_coexist;

  for (const regionId of Object.keys(GAME_STATE.region_religions)) {
    const rr = GAME_STATE.region_religions[regionId];
    if (!rr) continue;

    // Найти пары религий с fervor >= порога
    const significant = rr.beliefs.filter(b => b.fervor >= RELIGION_CONFIG.SYNCRETISM_THRESHOLD);

    for (let i = 0; i < significant.length; i++) {
      for (let j = i + 1; j < significant.length; j++) {
        const a = significant[i].religion;
        const b = significant[j].religion;
        const key = `${regionId}_${[a, b].sort().join('_')}`;

        // Считаем годы сосуществования
        coexist[key] = (coexist[key] || 0) + 1;

        if (coexist[key] >= RELIGION_CONFIG.SYNCRETISM_YEARS) {
          // Проверяем affinity
          const defA = _getReligionDef(a);
          const defB = _getReligionDef(b);
          const affinity = defA?.affinity?.[b] || defB?.affinity?.[a] || 0;

          // Шанс зависит от affinity: высокое сродство → больше шанс
          const chance = RELIGION_CONFIG.SYNCRETISM_CHANCE * (0.5 + affinity);

          if (Math.random() < chance) {
            _createSyncreticReligion(a, b, regionId);
            delete coexist[key];
          }
        }
      }
    }
  }
}

function _createSyncreticReligion(relA, relB, birthRegionId) {
  const defA = _getReligionDef(relA);
  const defB = _getReligionDef(relB);
  if (!defA || !defB) return;

  // Проверяем: не создан ли уже такой синкретизм?
  const pairKey = [relA, relB].sort().join('_');
  for (const existing of Object.values(GAME_STATE.syncretic_religions || {})) {
    if (existing._pair === pairKey) return;
  }

  const id = `sync_${pairKey}`;
  const regionName = MAP_REGIONS?.[birthRegionId]?.name || birthRegionId;

  // Смешиваем имена
  const name = `${defA.name.split(' ')[0]}-${defB.name.split(' ')[0]}`;

  // Смешиваем цвета (простое среднее)
  const color = _blendColors(defA.color, defB.color);

  // Объединяем домены
  const domains = [...new Set([...(defA.domains || []), ...(defB.domains || [])])].slice(0, 6);

  const syncretic = {
    id,
    _pair: pairKey,
    name: `Синкретизм ${name}`,
    group: 'syncretic',
    color,
    icon: '🔮',
    desc: `Синкретическая религия, родившаяся в ${regionName} от слияния ${defA.name} и ${defB.name}.`,
    institutionalization: Math.round((defA.institutionalization + defB.institutionalization) / 2 * 0.6),
    domains,
    bonuses: {
      base: { assimilation_speed: 0.04, diplomacy: 2, happiness: 1 },
      fervor_50: { assimilation_speed: 0.06, diplomacy: 3, happiness: 2, stability: 0.01 },
      fervor_80: { assimilation_speed: 0.10, diplomacy: 5, happiness: 3, trade_income: 0.03 },
    },
    sacred_sites: [birthRegionId],
    spread_method: 'pilgrimage',
    affinity: { [relA]: 0.8, [relB]: 0.8 },
  };

  GAME_STATE.syncretic_religions[id] = syncretic;

  // Добавляем в регион рождения
  const rr = GAME_STATE.region_religions[birthRegionId];
  if (rr) {
    _addFervor(rr, id, 0.15);
  }

  addEventLog(`🔮 В ${regionName} родилась новая вера: ${syncretic.name} — слияние ${defA.name} и ${defB.name}`, 'religion');
}

// ── СОБЫТИЯ-ТРИГГЕРЫ ─────────────────────────────────────────────────────

function _processReligionEvents(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  const atWar = (nation.military?.at_war_with || []).length > 0;
  const happiness = nation.population?.happiness || 50;
  const stability = nation.government?.stability || 50;

  // 1. Победа в войне → +fervor официальной религии в столице
  // (Проверяем через изменение территории — упрощённо)
  if (atWar && nation._last_battle_won) {
    const capitalRegion = nation.regions?.[0];
    if (capitalRegion) {
      const rr = GAME_STATE.region_religions[capitalRegion];
      if (rr) {
        const off = rr.beliefs.find(b => b.religion === rr.official);
        if (off) {
          off.fervor = Math.min(1, off.fervor + 0.03);
          if (nationId === GAME_STATE.player_nation) {
            addEventLog('⚡ Победа укрепила веру народа! Рвение официальной религии растёт.', 'religion');
          }
        }
      }
    }
    delete nation._last_battle_won;
  }

  // 2. Голод → культы плодородия растут
  const foodNeeded = (nation.population?.total || 0) * 0.3;
  const food = nation.economy?.stockpile?.wheat || 0;
  if (food < foodNeeded * 0.8) {
    for (const regionId of (nation.regions || [])) {
      const rr = GAME_STATE.region_religions[regionId];
      if (!rr) continue;
      _addFervor(rr, 'demeter_kore', 0.02);
      // Подрыв веры в официальную религию
      const off = rr.beliefs.find(b => b.religion === rr.official);
      if (off && off.religion !== 'demeter_kore') {
        off.fervor = Math.max(0.05, off.fervor - 0.01);
      }
    }
  }

  // 3. Несчастье → мистериальные культы растут
  if (happiness < 35) {
    for (const regionId of (nation.regions || [])) {
      const rr = GAME_STATE.region_religions[regionId];
      if (!rr) continue;
      const region = GAME_STATE.regions[regionId];
      if ((region?.population || 0) > 3000) {
        _addFervor(rr, 'dionysian', 0.015);
      }
    }
  }

  // 4. Высокая стабильность → институционализация растёт (обрабатывается в updateInstitutionalization)
}

// ── РЕЛИГИОЗНЫЕ КРИЗИСЫ ──────────────────────────────────────────────────

function _checkReligiousCrisis(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  // 1. РАСКОЛ — институционализированная религия с разным уровнем веры
  const dominantRel = _getNationDominantReligion(nationId);
  if (dominantRel) {
    const def = _getReligionDef(dominantRel);
    if (def && def.institutionalization >= RELIGION_CONFIG.SCHISM_INST_THRESHOLD) {
      // Проверяем: есть ли регионы с низким fervor (< 0.2)?
      let lowFervorRegions = 0;
      let totalRegions = 0;
      for (const regionId of (nation.regions || [])) {
        const rr = GAME_STATE.region_religions[regionId];
        if (!rr) continue;
        totalRegions++;
        const b = rr.beliefs.find(bl => bl.religion === dominantRel);
        if (!b || b.fervor < 0.20) lowFervorRegions++;
      }

      // Если >40% регионов слабо верят → шанс раскола
      if (totalRegions > 2 && lowFervorRegions / totalRegions > 0.4) {
        if (Math.random() < 0.15) {
          _triggerSchism(nationId, dominantRel);
        }
      }
    }
  }

  // 2. ПРОРОК — при высоком страдании
  const cultureId = typeof getNationPrimaryCulture === 'function'
    ? getNationPrimaryCulture(nationId) : null;
  const culture = cultureId ? GAME_STATE.cultures?.[cultureId] : null;
  const suffering = culture?.experience?.exp_suffering || 0;

  if (suffering >= RELIGION_CONFIG.PROPHET_SUFFERING_THRESHOLD && nation.population?.happiness < 30) {
    if (Math.random() < 0.08) {
      _triggerProphet(nationId);
    }
  }
}

function _triggerSchism(nationId, religionId) {
  const nation = GAME_STATE.nations[nationId];
  const def = _getReligionDef(religionId);
  if (!def) return;

  // Раскол: −stability, −legitimacy, +религиозное напряжение
  nation.government.stability = Math.max(0, (nation.government.stability || 50) - 8);
  nation.government.legitimacy = Math.max(0, (nation.government.legitimacy || 50) - 5);

  // Уменьшаем fervor доминирующей религии в случайных регионах
  const regions = [...(nation.regions || [])];
  const affected = regions.slice(0, Math.ceil(regions.length * 0.3));
  for (const regionId of affected) {
    const rr = GAME_STATE.region_religions[regionId];
    if (!rr) continue;
    const b = rr.beliefs.find(bl => bl.religion === religionId);
    if (b) b.fervor = Math.max(0.05, b.fervor * 0.7);
  }

  const nationName = nation.name || nationId;
  addEventLog(`⚡ Религиозный раскол в ${nationName}! Жречество ${def.name} раскололось — реформаторы против ортодоксов. Стабильность −8.`, 'religion');
}

function _triggerProphet(nationId) {
  const nation = GAME_STATE.nations[nationId];
  if (!nation) return;

  // Пророк усиливает мистериальные культы
  const capitalRegion = nation.regions?.[0];
  if (capitalRegion) {
    const rr = GAME_STATE.region_religions[capitalRegion];
    if (rr) {
      _addFervor(rr, 'dionysian', 0.10);
      _addFervor(rr, 'demeter_kore', 0.08);
      // Немного подрываем официальную
      const off = rr.beliefs.find(b => b.religion === rr.official);
      if (off) off.fervor = Math.max(0.1, off.fervor - 0.05);
    }
  }

  // Эффект: +happiness (надежда), −legitimacy (угроза власти)
  nation.population.happiness = Math.min(100, (nation.population.happiness || 50) + 5);
  nation.government.legitimacy = Math.max(0, (nation.government.legitimacy || 50) - 4);

  const nationName = nation.name || nationId;
  addEventLog(`🔥 В ${nationName} появился бродячий пророк! Народ утешен, но власть встревожена. Мистерии набирают силу.`, 'religion');
}

// ── БОНУСЫ РЕЛИГИИ К НАЦИИ ──────────────────────────────────────────────

function getReligionBonus(nationId, bonusType) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return 0;

  let total = 0;
  let regionCount = 0;

  for (const regionId of (nation.regions || [])) {
    const rr = GAME_STATE.region_religions[regionId];
    if (!rr) continue;
    regionCount++;

    for (const b of rr.beliefs) {
      const def = _getReligionDef(b.religion);
      if (!def?.bonuses) continue;

      // Базовый бонус
      const base = def.bonuses.base?.[bonusType] || 0;
      // Бонус при fervor > 50%
      const mid = (b.fervor >= 0.50) ? (def.bonuses.fervor_50?.[bonusType] || 0) : 0;
      // Бонус при fervor > 80%
      const high = (b.fervor >= 0.80) ? (def.bonuses.fervor_80?.[bonusType] || 0) : 0;

      total += (base + mid + high) * b.fervor;
    }
  }

  // Усредняем по регионам
  return regionCount > 0 ? total / regionCount : 0;
}

function getAllReligionBonuses(nationId) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return {};

  const bonuses = {};
  const regionCount = (nation.regions || []).length || 1;

  for (const regionId of (nation.regions || [])) {
    const rr = GAME_STATE.region_religions[regionId];
    if (!rr) continue;

    for (const b of rr.beliefs) {
      const def = _getReligionDef(b.religion);
      if (!def?.bonuses) continue;

      for (const tier of ['base', 'fervor_50', 'fervor_80']) {
        if (tier === 'fervor_50' && b.fervor < 0.50) continue;
        if (tier === 'fervor_80' && b.fervor < 0.80) continue;
        const tierBonuses = def.bonuses[tier];
        if (!tierBonuses) continue;
        for (const [key, val] of Object.entries(tierBonuses)) {
          bonuses[key] = (bonuses[key] || 0) + val * b.fervor;
        }
      }
    }
  }

  // Усредняем
  for (const key of Object.keys(bonuses)) {
    bonuses[key] /= regionCount;
  }
  return bonuses;
}

// ── СТАТИСТИКА ДЛЯ UI ───────────────────────────────────────────────────

function getNationReligionStats(nationId) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return { religions: [], byRegion: [], totalPopulation: 0 };

  const relPopMap = {}; // religion → weighted population
  const byRegion = [];
  let totalPop = 0;

  for (const regionId of (nation.regions || [])) {
    const region = GAME_STATE.regions?.[regionId];
    const pop = region?.population || 0;
    totalPop += pop;

    const rr = GAME_STATE.region_religions[regionId];
    const segments = [];

    if (rr) {
      // Нормализуем fervor → %
      const totalFervor = rr.beliefs.reduce((s, b) => s + b.fervor, 0) || 1;
      for (const b of rr.beliefs) {
        const pct = (b.fervor / totalFervor) * 100;
        const def = _getReligionDef(b.religion);
        segments.push({
          religion: b.religion,
          fervor: b.fervor,
          pct,
          name: def?.name || b.religion,
          color: def?.color || '#888',
        });
        relPopMap[b.religion] = (relPopMap[b.religion] || 0) + pop * (b.fervor / totalFervor);
      }
    }

    byRegion.push({
      regionId,
      name: MAP_REGIONS?.[regionId]?.name || regionId,
      population: pop,
      official: rr?.official || null,
      segments: segments.sort((a, b) => b.pct - a.pct),
    });
  }

  byRegion.sort((a, b) => b.population - a.population);

  const religions = Object.entries(relPopMap)
    .map(([id, pop]) => {
      const def = _getReligionDef(id);
      return {
        id,
        name: def?.name || 'Неизвестная',
        color: def?.color || '#888',
        icon: def?.icon || '❓',
        group: def?.group ? (RELIGION_GROUPS[def.group]?.name || def.group) : '',
        institutionalization: def?.institutionalization || 0,
        population: Math.round(pop),
        percentage: totalPop > 0 ? (pop / totalPop) * 100 : 0,
      };
    })
    .sort((a, b) => b.population - a.population);

  return { totalPopulation: totalPop, religions, byRegion };
}

// ── ВСПОМОГАТЕЛЬНЫЕ ──────────────────────────────────────────────────────

function _getReligionDef(id) {
  return RELIGIONS[id]
    || GAME_STATE.religions?.[id]
    || GAME_STATE.syncretic_religions?.[id]
    || null;
}

function _getNationDominantReligion(nationId) {
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return null;

  const fervorSum = {};
  for (const regionId of (nation.regions || [])) {
    const rr = GAME_STATE.region_religions[regionId];
    if (!rr) continue;
    for (const b of rr.beliefs) {
      fervorSum[b.religion] = (fervorSum[b.religion] || 0) + b.fervor;
    }
  }

  let best = null, bestVal = 0;
  for (const [rel, val] of Object.entries(fervorSum)) {
    if (val > bestVal) { best = rel; bestVal = val; }
  }
  return best;
}

function _getNeighborRegions(regionId, nationId) {
  // Простая эвристика: другие регионы той же нации
  const nation = GAME_STATE.nations?.[nationId];
  if (!nation) return [];
  return (nation.regions || []).filter(r => r !== regionId).slice(0, 4);
}

function _isBuildingReligious(buildingName) {
  if (!buildingName) return false;
  const lower = (typeof buildingName === 'string') ? buildingName.toLowerCase() : '';
  return lower.includes('храм') || lower.includes('temple')
    || lower.includes('святилище') || lower.includes('shrine')
    || lower.includes('алтарь') || lower.includes('altar');
}

function _clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function _blendColors(colorA, colorB) {
  const parseHex = (hex) => {
    const c = hex.replace('#', '');
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  };
  try {
    const a = parseHex(colorA), b = parseHex(colorB);
    const r = Math.round((a[0] + b[0]) / 2);
    const g = Math.round((a[1] + b[1]) / 2);
    const bl = Math.round((a[2] + b[2]) / 2);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
  } catch {
    return '#AA77CC';
  }
}

// ── API для интерфейса управления политикой ──────────────────────────────

function setReligionPatronage(nationId, religionId) {
  if (!GAME_STATE.religion_policy) GAME_STATE.religion_policy = {};
  if (!GAME_STATE.religion_policy[nationId]) {
    GAME_STATE.religion_policy[nationId] = { patronage: null, persecution: null };
  }
  const old = GAME_STATE.religion_policy[nationId].patronage;
  GAME_STATE.religion_policy[nationId].patronage = religionId;
  // Нельзя одновременно покровительствовать и преследовать одну и ту же
  if (religionId && GAME_STATE.religion_policy[nationId].persecution === religionId) {
    GAME_STATE.religion_policy[nationId].persecution = null;
  }
  const def = _getReligionDef(religionId);
  if (religionId && def) {
    addEventLog(`🏛 Покровительство: ${def.name}. Казна тратит ${RELIGION_CONFIG.PATRONAGE_COST_PER_TURN} монет/ход.`, 'religion');
  } else if (!religionId && old) {
    addEventLog('🏛 Покровительство отменено.', 'religion');
  }
}

function setReligionPersecution(nationId, religionId) {
  if (!GAME_STATE.religion_policy) GAME_STATE.religion_policy = {};
  if (!GAME_STATE.religion_policy[nationId]) {
    GAME_STATE.religion_policy[nationId] = { patronage: null, persecution: null };
  }
  const old = GAME_STATE.religion_policy[nationId].persecution;
  GAME_STATE.religion_policy[nationId].persecution = religionId;
  if (religionId && GAME_STATE.religion_policy[nationId].patronage === religionId) {
    GAME_STATE.religion_policy[nationId].patronage = null;
  }
  const def = _getReligionDef(religionId);
  if (religionId && def) {
    addEventLog(`⚔ Гонения на ${def.name}! Счастье населения снижается.`, 'religion');
  } else if (!religionId && old) {
    addEventLog('⚔ Гонения прекращены.', 'religion');
  }
}
