// ══════════════════════════════════════════════════════════════════════
// GOVERNMENT TAB — адаптивный оверлей форм правления
// Рендерится динамически из объекта government.
// Не падает на нестандартных структурах — если поля нет, блок не рендерится.
// ══════════════════════════════════════════════════════════════════════

function showGovernmentOverlay() {
  const overlay = document.getElementById('gov-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  renderGovernmentOverlay();
}

function hideGovernmentOverlay() {
  const overlay = document.getElementById('gov-overlay');
  if (overlay) overlay.style.display = 'none';
}

function renderGovernmentOverlay() {
  const container = document.getElementById('gov-content');
  if (!container) return;
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  if (!nation) return;
  container.innerHTML = renderGovernmentTab(nation);
}

// ──────────────────────────────────────────────────────────────────────
// ГЛАВНЫЙ РЕНДЕР — генерируется из объекта government
// ──────────────────────────────────────────────────────────────────────

function renderGovernmentTab(nation) {
  const gov = nation.government;
  if (!gov) return '<div class="gov-empty">Нет данных о правительстве.</div>';

  // GOV_003: Конструктор правительства — перехватываем рендер если нужна настройка
  if (gov.needs_setup) {
    return renderGovernmentConstructor(nation);
  }

  const sections = [];

  // 1. Заголовок с типом правления и ключевыми метриками
  sections.push(renderGovHeader(gov));

  // 2. Баннер активного перехода (приоритет — показывается первым)
  if (gov.active_transition?.status === 'in_progress') {
    sections.push(renderTransitionBanner(gov.active_transition));
  }

  // 3. Правящий актор
  if (gov.ruler) {
    sections.push(renderRulerBlock(gov.ruler, nation));
  }

  // 3.5. Зал власти (адаптируется к типу правления)
  sections.push(renderGovernmentHall(gov, nation));

  // 4. Ресурс власти
  if (gov.power_resource) {
    sections.push(renderPowerResourceBlock(gov.power_resource, gov));
  }

  // 5. Институты — каждый адаптирован под свой type
  if (gov.institutions?.length) {
    sections.push(`<div class="gov-section-title">🏛 Институты власти</div>`);
    sections.push(gov.institutions.map(inst => renderInstitutionBlock(inst, nation)).join(''));
  }

  // 5.5. Сенат (Lazy Materialization) — только для республиканских типов правления
  const SENATE_GOVS = ['republic', 'oligarchy', 'democracy'];
  const hasSenate = SENATE_GOVS.includes(gov.type);
  if (hasSenate) {
    const senateBlock = renderSenateLazyBlock(GAME_STATE.player_nation);
    if (senateBlock) sections.push(senateBlock);
  } else if (gov.type === 'tyranny') {
    sections.push(renderTyrannyCouncilBlock(nation));
  }

  // 5.6. Конституционный строй (если есть state_architecture)
  const arch = nation.senate_config?.state_architecture;
  if (arch) sections.push(renderConstitutionBlock(arch, nation));

  // 6. Активные механики (только включённые)
  if (gov.elections?.enabled) {
    sections.push(renderElectionBlock(gov.elections));
  }
  if (gov.succession?.tracked) {
    sections.push(renderSuccessionBlock(gov.succession, nation));
  }
  if (gov.conspiracies) {
    sections.push(renderConspiracyBlock(gov.conspiracies, nation));
  }

  // Блок заговорщиков игрока (персонажи с тегом [Player_Conspirator])
  sections.push(renderPlayerConspiracyBlock(nation));

  // 7. Кастомные механики
  if (gov.custom_mechanics?.length) {
    sections.push(renderCustomMechanicsBlock(gov.custom_mechanics));
  }

  // 8. История переходов (компактно)
  if (gov.transition_history?.length) {
    sections.push(renderTransitionHistory(gov.transition_history));
  }

  // 9. Система приказов и делегирования
  sections.push(renderOrdersSection(nation));

  // 10. Поле реформы правительства
  sections.push(renderReformInput());

  return sections.filter(Boolean).join('');
}

// ══════════════════════════════════════════════════════════════════════
// GOV_003: КОНСТРУКТОР ПРАВИТЕЛЬСТВА — мастер из 3 шагов
// Показывается когда government.needs_setup === true
// ══════════════════════════════════════════════════════════════════════

const GOV_TYPE_DESCRIPTIONS = {
  republic:   { icon:'⚖️', name:'Республика',       bonus:'Стабильность +10, Легитимность +15',   penalty:'Решения требуют голосования сената',       desc:'Власть делегирована избранным представителям народа.' },
  oligarchy:  { icon:'💰', name:'Олигархия',        bonus:'Торговля +15, богатство растёт быстрее', penalty:'Легитимность −5, народное недовольство',    desc:'Богатейшие семьи управляют государством в своих интересах.' },
  democracy:  { icon:'🗳️', name:'Демократия',      bonus:'Счастье +15, Торговля +5',              penalty:'Военные решения: порог голосования 60%',   desc:'Граждане голосуют напрямую по всем вопросам.' },
  monarchy:   { icon:'👑', name:'Монархия',          bonus:'Армия +15, Стабильность +5',            penalty:'Зависимость от качества монарха',           desc:'Наследственная власть одного правителя над государством.' },
  tyranny:    { icon:'⚔️', name:'Тирания',          bonus:'Армия +20, решения мгновенны',          penalty:'Легитимность ≤40, Счастье −10',             desc:'Абсолютная власть через силу, страх и личную гвардию.' },
  tribal:     { icon:'🏕️', name:'Племенной вождь', bonus:'Армия +10, Рост населения +5',          penalty:'Стабильность падает без войн (−3/ход)',     desc:'Власть основана на воинской доблести и уважении старейшин.' },
  theocracy:  { icon:'🕊️', name:'Теократия',       bonus:'Легитимность +20, Счастье +10',         penalty:'Торговля −10, оракул влияет на решения',   desc:'Власть от имени богов через жрецов и священные законы.' },
};

const GOV_SETUP_INSTITUTIONS_BY_TYPE = {
  republic:   ['senate','consulate','praetorship','censorship','tribune'],
  oligarchy:  ['council_elders','merchant_guild','trade_court','noble_assembly'],
  democracy:  ['assembly','strategos','jury_courts','ephors'],
  monarchy:   ['royal_council','chancellery','military_command','court_justice'],
  tyranny:    ['personal_guard','secret_police','privy_council','tax_collectors'],
  tribal:     ['council_elders','war_band','shamanic_council','hunting_council'],
  theocracy:  ['high_priest','oracle_chamber','temple_guard','prophets_guild'],
};

const GOV_INSTITUTION_NAMES = {
  senate:           'Сенат',
  consulate:        'Консулат',
  praetorship:      'Преторий',
  censorship:       'Цензура',
  tribune:          'Трибунат',
  council_elders:   'Совет старейшин',
  merchant_guild:   'Купеческая гильдия',
  trade_court:      'Торговый суд',
  noble_assembly:   'Дворянское собрание',
  assembly:         'Народное собрание',
  strategos:        'Стратег',
  jury_courts:      'Суды присяжных',
  ephors:           'Эфоры',
  royal_council:    'Королевский совет',
  chancellery:      'Канцелярия',
  military_command: 'Военное командование',
  court_justice:    'Суд правосудия',
  personal_guard:   'Личная гвардия',
  secret_police:    'Тайная полиция',
  privy_council:    'Тайный совет',
  tax_collectors:   'Сборщики налогов',
  war_band:         'Военная дружина',
  shamanic_council: 'Совет шаманов',
  hunting_council:  'Охотничий совет',
  high_priest:      'Верховный жрец',
  oracle_chamber:   'Палата оракула',
  temple_guard:     'Храмовая стража',
  prophets_guild:   'Гильдия пророков',
};

const GOV_INSTITUTION_DESC = {
  senate:           'Законодательный орган · Голосование большинством',
  consulate:        'Исполнительная власть · Два избираемых консула',
  praetorship:      'Судебная власть · Администрация провинций',
  censorship:       'Надзор за нравами · Контроль переписи',
  tribune:          'Защита плебеев · Право вето на законы',
  council_elders:   'Совет богатейших семей · Взвешенное голосование',
  merchant_guild:   'Торговые интересы · +10% к доходам от торговли',
  trade_court:      'Коммерческий суд · Разрешение торговых споров',
  noble_assembly:   'Собрание аристократов · Контроль над землёй',
  assembly:         'Все граждане голосуют · Прямая демократия',
  strategos:        'Военный лидер · Избирается народом',
  jury_courts:      'Народные суды · Случайные присяжные',
  ephors:           'Надзор за властью · Ежегодно переизбираются',
  royal_council:    'Советники монарха · Обеспечивает стабильность',
  chancellery:      'Управление документами · Административная эффективность',
  military_command: 'Единое командование армией',
  court_justice:    'Королевский суд · Апелляции и высшая юстиция',
  personal_guard:   'Преданная охрана тирана · Защита от заговоров',
  secret_police:    'Слежка за населением · +40% к обнаружению заговоров',
  privy_council:    'Ближние советники · Loyality-based власть',
  tax_collectors:   'Принудительный сбор · +20% к налоговым доходам',
  war_band:         'Элитные воины вождя · Prestige в бою',
  shamanic_council: 'Духовные лидеры · Оракул и предсказания',
  hunting_council:  'Старейшины охоты · Знания местности',
  high_priest:      'Глава церкви · Divine Mandate +5/ход',
  oracle_chamber:   'Пророчества богов · Влияет на голосования советников',
  temple_guard:     'Святая стража · Защита святилища и правителя',
  prophets_guild:   'Прорицатели · Событийные пророчества',
};

function renderGovernmentConstructor(nation) {
  if (!window._govSetupState) {
    window._govSetupState = { step: 1, type: null, institutions: [] };
  }
  const state = window._govSetupState;

  const stepLabels = [
    { n: 1, label: '1. Тип правления' },
    { n: 2, label: '2. Институты' },
    { n: 3, label: '3. Подтверждение' },
  ];

  const stepsHtml = stepLabels.map(s => `
    <span style="
      padding:4px 12px;
      border-radius:12px;
      font-size:12px;
      background:${state.step >= s.n ? '#1565C0' : '#333'};
      color:${state.step >= s.n ? '#fff' : '#888'};
      margin:0 3px;
    ">${s.label}</span>
  `).join('<span style="color:#555;margin:0 2px">›</span>');

  let content = '';
  if (state.step === 1) content = renderGovSetupStep1(nation);
  else if (state.step === 2) content = renderGovSetupStep2(state.type, state.institutions);
  else content = renderGovSetupStep3(state.type, state.institutions, nation);

  return `
    <div style="
      background:linear-gradient(135deg,#0a0a1a 0%,#111128 100%);
      border:2px solid #1565C0;
      border-radius:12px;
      padding:20px;
      margin:8px 0;
    ">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;border-bottom:1px solid #1565C0;padding-bottom:12px">
        <span style="font-size:20px">🏗️</span>
        <span style="font-size:16px;font-weight:bold;color:#90CAF9">Основание правительства</span>
      </div>
      <div style="display:flex;justify-content:center;gap:4px;margin-bottom:16px;flex-wrap:wrap">
        ${stepsHtml}
      </div>
      ${content}
    </div>
  `;
}

function renderGovSetupStep1(nation) {
  const currentType = nation.government?.type ?? '';
  const cards = Object.entries(GOV_TYPE_DESCRIPTIONS).map(([type, info]) => {
    const isCurrent = type === currentType;
    return `
      <div
        onclick="govSetupStep2('${type}')"
        style="
          background:${isCurrent ? '#1a2a4a' : '#15151f'};
          border:2px solid ${isCurrent ? '#1565C0' : '#333'};
          border-radius:8px;
          padding:12px 14px;
          cursor:pointer;
          transition:border-color 0.15s;
          min-width:180px;
          flex:1;
        "
        onmouseover="this.style.borderColor='#42A5F5'"
        onmouseout="this.style.borderColor='${isCurrent ? '#1565C0' : '#333'}'"
      >
        <div style="font-size:22px;margin-bottom:6px">${info.icon}</div>
        <div style="font-size:14px;font-weight:bold;color:#E3F2FD;margin-bottom:6px">${info.name}</div>
        <div style="font-size:11px;color:#888;margin-bottom:8px;line-height:1.4">${info.desc}</div>
        <div style="font-size:11px;color:#4CAF50;margin-bottom:3px">+ ${info.bonus}</div>
        <div style="font-size:11px;color:#ef9a9a">− ${info.penalty}</div>
      </div>
    `;
  }).join('');

  return `
    <div style="font-size:13px;color:#90CAF9;margin-bottom:12px">Выберите тип правления:</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px">
      ${cards}
    </div>
  `;
}

function renderGovSetupStep2(type, selected) {
  const info = GOV_TYPE_DESCRIPTIONS[type] ?? { icon:'⚙️', name: type };
  const available = GOV_SETUP_INSTITUTIONS_BY_TYPE[type] ?? [];
  const selSet = new Set(selected);
  const count = selSet.size;
  const canNext = count >= 2 && count <= 3;

  const items = available.map(instId => {
    const isSel = selSet.has(instId);
    return `
      <div
        onclick="govSetupToggleInst('${instId}')"
        style="
          background:${isSel ? '#1a2a4a' : '#15151f'};
          border:2px solid ${isSel ? '#42A5F5' : '#333'};
          border-radius:8px;
          padding:10px 14px;
          cursor:pointer;
          display:flex;
          align-items:flex-start;
          gap:10px;
          margin-bottom:8px;
        "
      >
        <span style="font-size:16px;margin-top:2px">${isSel ? '☑' : '☐'}</span>
        <div>
          <div style="font-size:13px;font-weight:bold;color:#E3F2FD">${GOV_INSTITUTION_NAMES[instId] ?? instId}</div>
          <div style="font-size:11px;color:#888;margin-top:2px">${GOV_INSTITUTION_DESC[instId] ?? ''}</div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <span style="font-size:18px">${info.icon}</span>
      <span style="font-size:14px;font-weight:bold;color:#90CAF9">${info.name}</span>
      <span style="font-size:12px;color:#555">— выберите 2–3 института</span>
    </div>
    ${items}
    <div style="font-size:12px;color:${canNext ? '#4CAF50' : '#FF9800'};margin-bottom:12px">
      ${canNext ? `✓ Выбрано: ${count}` : `Выберите ${count < 2 ? 'ещё ' + (2 - count) : 'не более 3'} института`}
    </div>
    <div style="display:flex;gap:10px">
      <button onclick="govSetupBack()" style="
        background:#222;border:1px solid #555;color:#ccc;
        padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px
      ">← Назад</button>
      <button onclick="govSetupStep3()" ${canNext ? '' : 'disabled'} style="
        background:${canNext ? '#1565C0' : '#333'};
        border:none;color:${canNext ? '#fff' : '#666'};
        padding:8px 20px;border-radius:6px;
        cursor:${canNext ? 'pointer' : 'not-allowed'};font-size:13px
      ">Далее →</button>
    </div>
  `;
}

function renderGovSetupStep3(type, institutions, nation) {
  const info = GOV_TYPE_DESCRIPTIONS[type] ?? { icon:'⚙️', name: type };
  const gov = nation.government ?? {};
  const currentLeg = Math.round(gov.legitimacy ?? 50);
  const currentStab = Math.round(gov.stability ?? 50);

  // Расчёт изменений от смены типа
  const GOV_SETUP_EFFECTS_UI = {
    republic:   { leg: +15, stab: +10 },
    oligarchy:  { leg:  -5, stab:  +5 },
    democracy:  { leg: +10, stab:  +5 },
    monarchy:   { leg: +10, stab: +15 },
    tyranny:    { leg: -20, stab: -10 },
    tribal:     { leg:   0, stab:  -5 },
    theocracy:  { leg: +20, stab: +10 },
  };
  const eff = GOV_SETUP_EFFECTS_UI[type] ?? { leg: 0, stab: 0 };
  const newLeg  = Math.min(100, Math.max(0, currentLeg  + eff.leg));
  const newStab = Math.min(100, Math.max(0, currentStab + eff.stab));

  const fmtDelta = v => v > 0 ? `<span style="color:#4CAF50">+${v}</span>` : v < 0 ? `<span style="color:#ef9a9a">${v}</span>` : `<span style="color:#888">0</span>`;

  const instList = institutions.map(id =>
    `<li style="color:#90CAF9;font-size:13px;margin:3px 0">${GOV_INSTITUTION_NAMES[id] ?? id}</li>`
  ).join('');

  const isTypeChange = gov.type && gov.type !== type;

  return `
    <div style="font-size:13px;color:#888;margin-bottom:14px">Проверьте параметры перед подтверждением:</div>

    <div style="background:#15151f;border:1px solid #333;border-radius:8px;padding:14px;margin-bottom:12px">
      <div style="font-size:15px;font-weight:bold;color:#E3F2FD;margin-bottom:10px">
        ${info.icon} ${info.name}
      </div>
      <div style="font-size:12px;color:#888;margin-bottom:8px">Институты власти:</div>
      <ul style="margin:0;padding-left:20px">${instList}</ul>
    </div>

    <div style="background:#15151f;border:1px solid #333;border-radius:8px;padding:14px;margin-bottom:16px">
      <div style="font-size:12px;color:#888;margin-bottom:8px">Изменения параметров:</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <div style="font-size:12px;color:#ccc">Легитимность</div>
          <div style="font-size:13px">${currentLeg}% → <strong>${newLeg}%</strong> ${fmtDelta(eff.leg)}</div>
        </div>
        <div>
          <div style="font-size:12px;color:#ccc">Стабильность</div>
          <div style="font-size:13px">${currentStab}% → <strong>${newStab}%</strong> ${fmtDelta(eff.stab)}</div>
        </div>
      </div>
      ${isTypeChange ? `<div style="font-size:11px;color:#FF9800;margin-top:8px">⚠️ Смена типа правления записана в историю переходов</div>` : ''}
    </div>

    <div style="display:flex;gap:10px">
      <button onclick="govSetupBack()" style="
        background:#222;border:1px solid #555;color:#ccc;
        padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px
      ">← Назад</button>
      <button onclick="govSetupConfirm()" style="
        background:#2E7D32;border:none;color:#fff;
        padding:8px 24px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold
      ">✅ Основать правительство</button>
    </div>
  `;
}

// ── Wizard-навигация ──────────────────────────────────────────────────

function govSetupStep2(type) {
  window._govSetupState = { step: 2, type, institutions: [] };
  renderGovernmentOverlay();
}

function govSetupToggleInst(instId) {
  const state = window._govSetupState;
  if (!state) return;
  const idx = state.institutions.indexOf(instId);
  if (idx >= 0) {
    state.institutions.splice(idx, 1);
  } else if (state.institutions.length < 3) {
    state.institutions.push(instId);
  }
  renderGovernmentOverlay();
}

function govSetupStep3() {
  const state = window._govSetupState;
  if (!state || state.institutions.length < 2) return;
  state.step = 3;
  renderGovernmentOverlay();
}

function govSetupBack() {
  const state = window._govSetupState;
  if (!state) return;
  if (state.step > 1) {
    state.step--;
    if (state.step === 1) {
      state.type = null;
      state.institutions = [];
    }
    renderGovernmentOverlay();
  }
}

function govSetupConfirm() {
  const state = window._govSetupState;
  if (!state) return;
  const nationId = GAME_STATE.player_nation;
  applyGovernmentSetup(nationId, { type: state.type, institutions: state.institutions });
  window._govSetupState = null;
  renderGovernmentOverlay();
  if (typeof renderLeftPanel === 'function') renderLeftPanel();
}

// ──────────────────────────────────────────────────────────────────────
// 1. ЗАГОЛОВОК
// ──────────────────────────────────────────────────────────────────────

function renderGovHeader(gov) {
  const typeName = getGovernmentNameFull(gov.type, gov.custom_name);
  const legColor = gov.legitimacy > 60 ? '#4CAF50' : gov.legitimacy > 30 ? '#FF9800' : '#f44336';
  const stabColor = (gov.stability ?? 50) > 60 ? '#4CAF50'
                  : (gov.stability ?? 50) > 30 ? '#FF9800' : '#f44336';

  return `
    <div class="gov-header">
      <div class="gov-type-badge">${getGovTypeIcon(gov.type)} ${typeName}</div>
      <div class="gov-metrics">
        <div class="gov-metric">
          <span class="gov-metric-label">Легитимность</span>
          <div class="bar-container"><div class="bar-fill" style="width:${gov.legitimacy}%;background:${legColor}"></div></div>
          <span class="gov-metric-val" style="color:${legColor}">${+gov.legitimacy.toFixed(2)}%</span>
        </div>
        <div class="gov-metric">
          <span class="gov-metric-label">Стабильность</span>
          <div class="bar-container"><div class="bar-fill" style="width:${gov.stability ?? 50}%;background:${stabColor}"></div></div>
          <span class="gov-metric-val" style="color:${stabColor}">${+(gov.stability ?? 50).toFixed(2)}%</span>
        </div>
      </div>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────────────
// 2. БАННЕР ПЕРЕХОДА
// ──────────────────────────────────────────────────────────────────────

function renderTransitionBanner(trans) {
  const from = getGovernmentNameFull(trans.from);
  const to   = getGovernmentNameFull(trans.to);
  return `
    <div class="gov-transition-banner">
      <div class="transition-title">🔄 Переходный период</div>
      <div class="transition-route">${from} → ${to}</div>
      <div class="transition-meta">
        Ход ${trans.turns_elapsed ?? 0} из ~10 · Причина: ${trans.cause}
      </div>
      <div class="transition-warning">⚠️ Активны штрафы к стабильности и лояльности армии</div>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────────────
// 3. ПРАВЯЩИЙ АКТОР
// ──────────────────────────────────────────────────────────────────────

function renderRulerBlock(ruler, nation) {
  if (!ruler) return '';

  if (ruler.type === 'person') {
    return renderPersonRuler(ruler, nation);
  } else if (ruler.type === 'council') {
    return renderCouncilRuler(ruler, nation);
  } else if (ruler.type === 'deity_proxy') {
    return renderDeityProxyRuler(ruler, nation);
  }

  // Fallback — неизвестный тип правителя
  return `<div class="gov-section"><div class="gov-section-title">👑 Правитель</div><div class="gov-text">${ruler.name ?? '?'}</div></div>`;
}

function renderPersonRuler(ruler, nation) {
  const char = (nation.characters ?? []).find(c => ruler.character_ids?.includes(c.id));
  const powerColor = ruler.personal_power > 70 ? '#f44336'
                   : ruler.personal_power > 40 ? '#FF9800' : '#4CAF50';

  return `
    <div class="gov-section">
      <div class="gov-section-title">👑 Правитель</div>
      <div class="gov-ruler-card">
        <div class="gov-ruler-portrait">${char?.portrait ?? '👤'}</div>
        <div class="gov-ruler-info">
          <div class="gov-ruler-name">${ruler.name}</div>
          ${char ? `<div class="gov-ruler-role">${getRoleLabel(char.role)} · ${char.age} лет · ❤️ ${char.health}/100</div>` : ''}
          <div class="gov-metric small" title="Личная власть: концентрация воли правителя.&#10;&#10;Влияет на:&#10;• Голосования: ≥70 → +10% поддержки сенаторов; ≤25 → −8%&#10;• Заговоры: ≥75 → риск ×0.5; ≤25 → риск ×1.8&#10;• Легитимность: ≥70 → +0.3/ход; ≤25 → −0.5/ход&#10;• Стабильность: ≤20 → −1/ход&#10;&#10;Рассчитывается из: тип правления + легитимность + ресурс власти&#10;+ поддержка армии + доминирование фракции − штраф за заговоры">
            <span class="gov-metric-label">Личная власть</span>
            <div class="bar-container"><div class="bar-fill" style="width:${ruler.personal_power ?? 50}%;background:${powerColor}"></div></div>
            <span class="gov-metric-val">${ruler.personal_power ?? 50}</span>
          </div>
        </div>
        ${char ? `<button class="gov-char-link" onclick="showCharacterDetail('${char.id}');hideGovernmentOverlay()">📋 Досье</button>` : ''}
      </div>
    </div>
  `;
}

function renderCouncilRuler(ruler, nation) {
  // Ищем nationId по объекту нации, чтобы получить реальное число сенаторов
  const nationId    = Object.keys(GAME_STATE.nations).find(k => GAME_STATE.nations[k] === nation);
  const senateMgr   = nationId ? getSenateManager(nationId) : null;
  const _govInsts   = nation?.government?.institutions ?? [];
  const _factionInst = _govInsts.find(i => i.factions?.some(f => f.seats));
  const memberCount = _factionInst
    ? _factionInst.factions.reduce((s, f) => s + (f.seats ?? 0), 0)
    : (senateMgr ? senateMgr.senators.length : (ruler.character_ids?.length || null));

  const memberStr = memberCount != null ? memberCount : 'неизвестно';

  return `
    <div class="gov-section">
      <div class="gov-section-title">🏛 Правящий орган</div>
      <div class="gov-council-card">
        <div class="gov-council-name">${ruler.name}</div>
        <div class="gov-council-meta">
          Членов: ${memberStr} ·
          <span title="Личная власть: концентрация воли главы совета.&#10;&#10;Влияет на:&#10;• Голосования: ≥70 → +10% поддержки; ≤25 → −8%&#10;• Заговоры: ≥75 → риск ×0.5; ≤25 → риск ×1.8&#10;• Легитимность и стабильность при крайних значениях&#10;&#10;Рассчитывается автоматически каждый ход">Личная власть главы совета: ${ruler.personal_power ?? 20}/100</span>
        </div>
        <div class="gov-council-note">⚖️ Решения принимаются коллегиально</div>
      </div>
    </div>
  `;
}

function renderDeityProxyRuler(ruler, nation) {
  const priest = (nation.characters ?? []).find(c => ruler.character_ids?.includes(c.id));
  return `
    <div class="gov-section">
      <div class="gov-section-title">🕊️ Власть богов</div>
      <div class="gov-deity-card">
        <div class="gov-deity-title">${ruler.name}</div>
        ${priest
          ? `<div class="gov-deity-proxy">Воплощён через: ${priest.portrait ?? '👤'} <strong>${priest.name}</strong></div>`
          : '<div class="gov-deity-proxy">Верховный жрец ещё не назначен</div>'
        }
        <div class="gov-deity-note">Все решения освящаются именем богов</div>
      </div>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────────────
// 4. РЕСУРС ВЛАСТИ
// ──────────────────────────────────────────────────────────────────────

function renderPowerResourceBlock(pr, gov) {
  const name  = getPowerResourceName(pr.type);
  const color = getPowerResourceColor(pr.type);
  const val   = Math.round(pr.current ?? 0);
  const icon  = getPowerResourceIcon(pr.type);

  const restoredList = (pr.restored_by ?? [])
    .map(r => `<span class="gov-tag">${formatWant(r)}</span>`).join('');

  const warningText = getResourceWarning(pr.type, val, gov);

  return `
    <div class="gov-section">
      <div class="gov-section-title">${icon} Ресурс власти: ${name}</div>
      <div class="gov-power-bar-row">
        <div class="bar-container wide">
          <div class="bar-fill" style="width:${val}%;background:${color}"></div>
        </div>
        <span class="gov-power-val" style="color:${color}">${val}/100</span>
      </div>
      <div class="gov-power-decay">
        Распад: −${pr.decay_per_turn ?? 0.5}/ход
      </div>
      ${restoredList ? `<div class="gov-power-restore">Восстанавливают: ${restoredList}</div>` : ''}
      ${warningText ? `<div class="gov-power-warning">${warningText}</div>` : ''}
    </div>
  `;
}

function getResourceWarning(type, val, gov) {
  if (type === 'fear' && val < 30) return '⚠️ Страх ослаб. Заговорщики осмелели.';
  if (type === 'legitimacy' && val < 25) return '🔴 Легитимность критически мала. Государство под угрозой.';
  if (type === 'prestige' && val < 20) return '⚠️ Потеря престижа. Воины сомневаются в вожде.';
  if (type === 'divine_mandate' && val < 30) return '⚠️ Боги отвернулись. Народ ропщет.';
  if (gov.type === 'tyranny' && val > 80) return '💪 Страх на пике. Никто не смеет возражать.';
  return null;
}

// ──────────────────────────────────────────────────────────────────────
// 5. ИНСТИТУТЫ
// ──────────────────────────────────────────────────────────────────────

function renderInstitutionBlock(inst, nation) {
  // Пропускаем незаполненные объекты (могут прийти из AI-дельты без имени)
  if (!inst || !inst.name) return '';

  const typeLabel = getInstTypeLabel(inst.type);
  const methodLabel = getDecisionMethodLabel(inst.decision_method);

  // Фракции не показываем — они визуализируются в Зале Сената/Совета
  const powersHtml = inst.powers?.length
    ? `<div class="gov-inst-powers">${inst.powers.map(p => `<span class="gov-tag green">${formatWant(p)}</span>`).join('')}</div>`
    : '';

  const limitsHtml = inst.limitations?.length
    ? `<div class="gov-inst-limits">${inst.limitations.map(l => `<span class="gov-tag red">${formatWant(l)}</span>`).join('')}</div>`
    : '';

  return `
    <div class="gov-institution">
      <div class="gov-inst-header">
        <span class="gov-inst-name">${inst.name ?? '?'}</span>
        ${typeLabel ? `<span class="gov-inst-type">${typeLabel}</span>` : ''}
        ${inst.size ? `<span class="gov-inst-size">${inst.size} чел.</span>` : ''}
      </div>
      <div class="gov-inst-method">⚖️ ${methodLabel ?? inst.decision_method ?? '—'}${inst.quorum ? ` · Кворум: ${inst.quorum}%` : ''}</div>
      ${powersHtml}
      ${limitsHtml}
    </div>
  `;
}

function renderFactionList(factions) {
  const total = factions.reduce((s, f) => s + (f.seats ?? 0), 0);

  const bars = factions.map((f, i) => {
    const pct = total > 0 ? Math.round(f.seats / total * 100) : 0;
    const color = FACTION_COLORS[i % FACTION_COLORS.length];
    return `<div class="faction-bar-seg" style="width:${pct}%;background:${color}" title="${f.name}: ${f.seats} мест (${pct}%)"></div>`;
  }).join('');

  const labels = factions.map((f, i) => {
    const color = FACTION_COLORS[i % FACTION_COLORS.length];
    const wantsStr = (f.wants ?? []).slice(0, 2).map(w => formatWant(w)).join(', ');
    return `
      <div class="faction-item">
        <span class="faction-dot" style="background:${color}"></span>
        <span class="faction-name">${f.name}</span>
        <span class="faction-seats">${f.seats} мест</span>
        ${wantsStr ? `<span class="faction-wants" title="Хотят: ${wantsStr}">💬 ${wantsStr}</span>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="gov-factions">
      <div class="faction-bar">${bars}</div>
      <div class="faction-legend">${labels}</div>
    </div>
  `;
}

const FACTION_COLORS = ['#8B4513', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#f44336'];

// ──────────────────────────────────────────────────────────────────────
// 6. ВЫБОРЫ
// ──────────────────────────────────────────────────────────────────────

function renderElectionBlock(elections) {
  const urgency = elections.next_election <= 2 ? 'danger'
                : elections.next_election <= 5 ? 'warning' : 'info';
  const urgencyColor = urgency === 'danger' ? '#f44336' : urgency === 'warning' ? '#FF9800' : '#4CAF50';

  return `
    <div class="gov-section">
      <div class="gov-section-title">🗳️ Выборы</div>
      <div class="gov-election-row">
        <span class="gov-election-label">До следующих выборов:</span>
        <span class="gov-election-count" style="color:${urgencyColor}">
          ${elections.next_election} ход(а)
        </span>
      </div>
      <div class="gov-election-meta">
        Голосуют: ${formatVoters(elections.eligible_voters)} ·
        Периодичность: ${elections.frequency_turns ?? '?'} ходов
      </div>
      ${elections.offices?.length
        ? `<div class="gov-election-offices">Должности: ${elections.offices.map(o => `<span class="gov-tag">${o}</span>`).join('')}</div>`
        : ''}
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────────────
// 7. ПРЕЕМСТВЕННОСТЬ
// ──────────────────────────────────────────────────────────────────────

function renderSuccessionBlock(succession, nation) {
  const heir = succession.heir
    ? (nation.characters ?? []).find(c => c.id === succession.heir)
    : null;

  return `
    <div class="gov-section">
      <div class="gov-section-title">👶 Преемственность</div>
      ${heir
        ? `<div class="gov-heir">${heir.portrait ?? '👤'} <strong>${heir.name}</strong> · ${heir.age} лет · ❤️ ${heir.health}/100</div>`
        : `<div class="gov-heir-none">⚠️ Наследник не назначен${succession.crisis_if_no_heir ? ' — смерть правителя вызовет кризис!' : ''}</div>`
      }
      ${succession.claim_types?.length
        ? `<div class="gov-claim-types">Права: ${succession.claim_types.map(c => `<span class="gov-tag">${c}</span>`).join('')}</div>`
        : ''}
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────────────
// 8. ЗАГОВОРЫ (тирания)
// ──────────────────────────────────────────────────────────────────────

function renderConspiracyBlock(conspiracies, nation) {
  const chance = Math.round(calculateConspiracyChance(nation) * 100);
  const riskColor = chance > 40 ? '#f44336' : chance > 20 ? '#FF9800' : '#4CAF50';
  const sp = conspiracies.secret_police;

  // Активные (обнаруженные) заговоры из движка
  const nationId = GAME_STATE.player_nation;
  const activeConsp = (GAME_STATE.nations[nationId]?.conspiracies || [])
    .filter(c => c.status === 'detected');

  const detectedHtml = activeConsp.map(cons => {
    const opts = CONSPIRACY_ENGINE.get_player_options(cons.id, nationId);
    const optBtns = opts.map(opt => `
      <button class="gov-consp-action-btn" onclick="resolveConspiracy('${cons.id}','${opt.id}')"
        title="${opt.risk}">${opt.label}</button>
    `).join('');
    return `
      <div class="gov-detected-conspiracy">
        <div class="gov-consp-header">
          ⚠️ <strong>${cons.secret_name || 'Неизвестный заговор'}</strong>
          <span class="gov-consp-stage">обнаружен</span>
        </div>
        <div class="gov-consp-desc dim">${cons.goal_description || 'Свергнуть действующую власть'}</div>
        <div class="gov-consp-members dim">Участников: ~${cons.members?.length ?? '?'} сенаторов</div>
        <div class="gov-consp-actions">${optBtns}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="gov-section">
      <div class="gov-section-title">🗡️ Заговоры</div>
      <div class="gov-conspiracy-row">
        <span class="gov-metric-label">Риск за ход:</span>
        <div class="bar-container"><div class="bar-fill" style="width:${Math.min(100,chance*2)}%;background:${riskColor}"></div></div>
        <span style="color:${riskColor}"><strong>${chance}%</strong></span>
      </div>
      ${sp
        ? `<div class="gov-sp-row ${sp.enabled ? 'active' : 'inactive'}">
            🕵️ Тайная полиция: ${sp.enabled
              ? `<span class="positive">активна (−${sp.cost_per_turn} монет/ход, −${Math.round(sp.conspiracy_detection_bonus*100)}% риска)</span>`
              : '<span class="dim">неактивна</span>'}
            ${!sp.enabled
              ? `<button class="gov-sp-btn" onclick="enableSecretPolice()">Активировать (${sp.cost_per_turn} монет/ход)</button>`
              : `<button class="gov-sp-btn red" onclick="disableSecretPolice()">Расформировать</button>`
            }
          </div>`
        : ''
      }
      ${detectedHtml || ''}
    </div>
  `;
}

async function resolveConspiracy(conspiracyId, outcome) {
  const nationId = GAME_STATE.player_nation;
  const result = await CONSPIRACY_ENGINE.resolve_conspiracy(nationId, conspiracyId, outcome);
  renderGovernmentOverlay();
  renderRightPanel();
}

function enableSecretPolice() {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const sp = nation.government.conspiracies?.secret_police;
  if (!sp) return;
  sp.enabled = true;
  addEventLog('🕵️ Тайная полиция активирована. Слежка усилена.', 'info');
  renderGovernmentOverlay();
}

function disableSecretPolice() {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const sp = nation.government.conspiracies?.secret_police;
  if (!sp) return;
  sp.enabled = false;
  addEventLog('🕵️ Тайная полиция расформирована.', 'info');
  renderGovernmentOverlay();
}

// ──────────────────────────────────────────────────────────────────────
// ЗАГОВОРЫ ИГРОКА — персонажи с тегом [Player_Conspirator]
// ──────────────────────────────────────────────────────────────────────

function renderPlayerConspiracyBlock(nation) {
  const conspirators = (nation.characters ?? []).filter(c =>
    c.alive && (c.dialogue?.lts_tags ?? []).includes('[Player_Conspirator]')
  );
  if (!conspirators.length) return '';

  const rows = conspirators.map(c => {
    const loyalty = c.traits?.loyalty ?? 50;
    const lColor  = loyalty > 60 ? '#4CAF50' : loyalty > 30 ? '#FF9800' : '#f44336';
    return `
      <div class="gov-consp-row">
        <span class="gov-consp-portrait">${c.portrait ?? '👤'}</span>
        <span class="gov-consp-name">${c.name}</span>
        <span class="gov-consp-role dim">${c.role}</span>
        <span class="gov-consp-loyalty" style="color:${lColor}">Лояльность: ${loyalty}</span>
        <div class="gov-consp-actions">
          <button class="gov-consp-btn danger" onclick="dismissConspiratorByPlayer('${c.id}')">🔪 Устранить</button>
          <button class="gov-consp-btn"        onclick="rewardConspirator('${c.id}')">💰 Наградить</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="gov-section">
      <div class="gov-section-title">🗡️ Ваши заговорщики <span class="count-badge">${conspirators.length}</span></div>
      <div class="gov-consp-list">${rows}</div>
    </div>
  `;
}

function dismissConspiratorByPlayer(charId) {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const char   = (nation.characters ?? []).find(c => c.id === charId);
  if (!char) return;

  // Убираем тег — персонаж выходит из заговора
  const tags = char.dialogue?.lts_tags ?? [];
  const idx  = tags.indexOf('[Player_Conspirator]');
  if (idx !== -1) tags.splice(idx, 1);
  tags.push('[Dismissed_By_Player]');

  char.traits.loyalty = Math.max(0, (char.traits.loyalty ?? 50) - 20);
  addEventLog(`🗡️ ${char.name} отстранён от заговора. Лояльность −20.`, 'character');
  renderGovernmentOverlay();
}

function rewardConspirator(charId) {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const char   = (nation.characters ?? []).find(c => c.id === charId);
  if (!char) return;

  const cost = 800;
  if (nation.economy.treasury < cost) {
    addEventLog('Недостаточно средств для награды.', 'warning');
    return;
  }
  nation.economy.treasury -= cost;
  char.traits.loyalty = Math.min(100, (char.traits.loyalty ?? 50) + 15);
  char.resources = char.resources ?? {};
  char.resources.gold = (char.resources.gold ?? 0) + cost;
  addEventLog(`💰 ${char.name} получил ${cost} монет. Лояльность +15.`, 'good');
  renderGovernmentOverlay();
}

// ──────────────────────────────────────────────────────────────────────
// 9. КАСТОМНЫЕ МЕХАНИКИ
// ──────────────────────────────────────────────────────────────────────

function renderCustomMechanicsBlock(mechanics) {
  const items = mechanics.map(m => `
    <div class="gov-custom-mech">
      <span class="gov-mech-name">⚙️ ${m.name}</span>
      <span class="gov-mech-desc">${m.description ?? ''}</span>
      <span class="gov-mech-trigger dim">Срабатывает: ${m.trigger ?? '?'}</span>
    </div>
  `).join('');

  return `
    <div class="gov-section">
      <div class="gov-section-title">⚙️ Особые механики</div>
      ${items}
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────────────
// 10. ИСТОРИЯ ПЕРЕХОДОВ
// ──────────────────────────────────────────────────────────────────────

function renderTransitionHistory(history) {
  if (!history.length) return '';
  const items = history.slice().reverse().slice(0, 4).map(h => {
    const from = h.from ? getGovernmentNameFull(h.from) : 'Начало';
    const to   = getGovernmentNameFull(h.to);
    return `<div class="gov-hist-item">Ход ${h.turn}: ${from} → ${to} · <em>${h.cause}</em></div>`;
  }).join('');
  return `
    <div class="gov-section collapsed">
      <div class="gov-section-title clickable" onclick="this.parentElement.classList.toggle('collapsed')">
        📜 История переходов ▾
      </div>
      <div class="gov-hist-list">${items}</div>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────────────
// 11. ПОЛЕ РЕФОРМЫ (вызывает Claude API)
// ──────────────────────────────────────────────────────────────────────

function renderReformInput() {
  return `
    <div class="gov-reform-section">
      <div class="gov-section-title">✍️ Реформировать правительство</div>
      <div class="gov-reform-hint">
        Опишите свободным текстом. Например: «Ввести выборы стратегов» или «Создать теократию Аполлона»
      </div>
      <div class="gov-reform-row">
        <input
          type="text"
          id="gov-reform-input"
          class="gov-reform-text"
          placeholder="Ваша реформа..."
          onkeydown="if(event.key==='Enter') submitGovernmentReform()"
        >
        <button class="gov-reform-btn" onclick="submitGovernmentReform()">⚖️ Провести</button>
      </div>
      <div id="gov-reform-status" class="gov-reform-status hidden"></div>
    </div>
  `;
}

async function submitGovernmentReform() {
  const input  = document.getElementById('gov-reform-input');
  const status = document.getElementById('gov-reform-status');
  if (!input || !input.value.trim()) return;

  const text = input.value.trim();
  input.value = '';

  if (status) {
    status.className = 'gov-reform-status';
    status.textContent = '⏳ Claude анализирует реформу...';
  }

  try {
    const delta = await parseGovernmentDescription(text);
    if (delta) {
      applyGovernmentDelta(GAME_STATE.player_nation, delta);
      addEventLog(`⚖️ Реформа принята: "${text}"`, 'positive');
      renderGovernmentOverlay();
      renderLeftPanel();
      if (status) {
        status.className = 'gov-reform-status positive';
        status.textContent = '✅ Реформа применена.';
      }
    }
  } catch (err) {
    console.error('Gov reform error:', err);
    if (status) {
      status.className = 'gov-reform-status error';
      status.textContent = `❌ Ошибка: ${err.message}`;
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// 5.6. КОНСТИТУЦИОННЫЙ СТРОЙ
// ──────────────────────────────────────────────────────────────────────

function renderConstitutionBlock(arch, nation) {
  const votingLabels = { Plutocracy: 'Плутократия', Meritocracy: 'Меритократия', Democracy: 'Демократия' };
  const powerLabels  = { Limited: 'Ограниченные', Standard: 'Стандартные', Dictatorial: 'Диктаторские' };
  return `
    <div class="gov-section">
      <div class="gov-section-title">📜 Конституция</div>
      <div class="gov-constitution-grid">
        <div class="gov-const-row"><span class="gov-metric-label">Мест в Сенате:</span><strong>${arch.senate_capacity}</strong></div>
        <div class="gov-const-row"><span class="gov-metric-label">Срок консула:</span><strong>${arch.consul_term} лет</strong></div>
        <div class="gov-const-row"><span class="gov-metric-label">Выборы каждые:</span><strong>${arch.election_cycle} лет</strong></div>
        <div class="gov-const-row"><span class="gov-metric-label">Полномочия консула:</span><strong>${powerLabels[arch.consul_powers] ?? arch.consul_powers}</strong></div>
        <div class="gov-const-row"><span class="gov-metric-label">Система голосования:</span><strong>${votingLabels[arch.voting_system] ?? arch.voting_system}</strong></div>
        <div class="gov-const-row"><span class="gov-metric-label">Право вето народа:</span><strong>${arch.veto_rights ? '✅ Да' : '❌ Нет'}</strong></div>
      </div>
      <button class="gov-sp-btn" onclick="openConstitutionDialog()" style="margin-top:8px">⚖️ Изменить конституцию</button>
    </div>
  `;
}

// Возвращает определения конституционных пунктов с предустановленными вариантами
function _getConstProvisionDefs(arch) {
  return {
    senate_capacity: {
      label: 'Мест в Сенате',
      current: arch.senate_capacity,
      options: [100, 150, 200, 300, 450, 600].map(v => ({ value: v, label: `${v} мест` })),
    },
    consul_term: {
      label: 'Срок консула',
      current: arch.consul_term,
      options: [{v:1,l:'1 год'},{v:2,l:'2 года'},{v:3,l:'3 года'},{v:5,l:'5 лет'},{v:10,l:'10 лет'}]
               .map(({v,l}) => ({ value: v, label: l })),
    },
    election_cycle: {
      label: 'Цикл выборов',
      current: arch.election_cycle,
      options: [{v:2,l:'2 года'},{v:4,l:'4 года'},{v:6,l:'6 лет'},{v:8,l:'8 лет'},{v:12,l:'12 лет'}]
               .map(({v,l}) => ({ value: v, label: l })),
    },
    consul_powers: {
      label: 'Полномочия консула',
      current: arch.consul_powers,
      options: [
        { value: 'Limited',     label: 'Ограниченные' },
        { value: 'Standard',    label: 'Стандартные' },
        { value: 'Dictatorial', label: 'Диктаторские' },
      ],
    },
    voting_system: {
      label: 'Система голосования',
      current: arch.voting_system,
      options: [
        { value: 'Democracy',   label: 'Демократия' },
        { value: 'Meritocracy', label: 'Меритократия' },
        { value: 'Plutocracy',  label: 'Плутократия' },
      ],
    },
    veto_rights: {
      label: 'Право вето народа',
      current: arch.veto_rights,
      options: [
        { value: 'true',  label: 'Да — наделить народ правом вето' },
        { value: 'false', label: 'Нет — упразднить право вето' },
      ],
    },
  };
}

function openConstitutionDialog() {
  const nationId = GAME_STATE.player_nation;
  const arch = GAME_STATE.nations[nationId]?.senate_config?.state_architecture;
  if (!arch) return;

  document.getElementById('constitution-dialog-overlay')?.remove();

  const defs = _getConstProvisionDefs(arch);
  const firstKey = Object.keys(defs)[0];

  const provisionOptions = Object.entries(defs).map(([k, d]) =>
    `<option value="${k}">${d.label} (сейчас: ${d.options.find(o => String(o.value) === String(d.current))?.label ?? d.current})</option>`
  ).join('');

  const valueOptions = defs[firstKey].options.map(o =>
    `<option value="${o.value}" ${String(o.value) === String(defs[firstKey].current) ? 'selected' : ''}>${o.label}</option>`
  ).join('');

  const mgr = typeof getSenateManager === 'function' ? getSenateManager(nationId) : null;
  const senCount = mgr?.senators?.length ?? '?';
  const needed   = mgr?.senators?.length ? Math.ceil(mgr.senators.length * 2 / 3) : '?';

  const overlay = document.createElement('div');
  overlay.id = 'constitution-dialog-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.82);display:flex;align-items:center;justify-content:center;z-index:2000;';
  overlay.innerHTML = `
    <div class="senate-law-form" style="max-width:480px">
      <div class="slf-title">📜 Поправка к Конституции</div>
      <div class="slf-hint">
        Конституционные изменения требуют коллегиального большинства —
        <strong>2/3 сенаторов</strong> (нужно ${needed} из ${senCount}).
        Подготовьте убедительную речь.
      </div>

      <label class="slf-label">Что изменить
        <select id="cd-provision" class="slf-select" onchange="updateConstitutionValueOptions()">
          ${provisionOptions}
        </select>
      </label>

      <label class="slf-label">Новое значение
        <select id="cd-new-value" class="slf-select">
          ${valueOptions}
        </select>
      </label>

      <label class="slf-label">Ваша речь перед Сенатом
        <span style="color:#888;font-size:10px">(влияет на поддержку фракций)</span>
        <textarea id="cd-speech" class="slf-textarea" rows="4"
          placeholder="Отцы-сенаторы! Предлагаю внести поправку в Конституцию...&#10;Обоснуйте необходимость изменения — убедите большинство."></textarea>
      </label>

      <div class="slf-buttons">
        <button class="slf-btn-submit" onclick="submitConstitutionAmendment()">⚖️ Внести на голосование</button>
        <button class="slf-btn-cancel" onclick="document.getElementById('constitution-dialog-overlay').remove()">Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// Обновляет список вариантов при смене пункта конституции
function updateConstitutionValueOptions() {
  const arch = GAME_STATE.nations[GAME_STATE.player_nation]?.senate_config?.state_architecture;
  if (!arch) return;
  const key = document.getElementById('cd-provision')?.value;
  if (!key) return;
  const def = _getConstProvisionDefs(arch)[key];
  if (!def) return;
  const sel = document.getElementById('cd-new-value');
  if (!sel) return;
  const cur = String(def.current);
  sel.innerHTML = def.options.map(o =>
    `<option value="${o.value}" ${String(o.value) === cur ? 'selected' : ''}>${o.label}</option>`
  ).join('');
}

// Отправляет поправку на голосование Сената (порог 2/3)
function submitConstitutionAmendment() {
  const nationId = GAME_STATE.player_nation;
  const arch = GAME_STATE.nations[nationId]?.senate_config?.state_architecture;
  if (!arch) return;

  const key    = document.getElementById('cd-provision')?.value;
  const rawVal = document.getElementById('cd-new-value')?.value;
  const speech = (document.getElementById('cd-speech')?.value ?? '').trim();

  if (!key || rawVal == null) return;

  const defs = _getConstProvisionDefs(arch);
  const def  = defs[key];
  if (!def) return;

  // Приводим тип
  let newValue = rawVal;
  if (key === 'senate_capacity' || key === 'consul_term' || key === 'election_cycle') {
    newValue = parseInt(rawVal);
  } else if (key === 'veto_rights') {
    newValue = rawVal === 'true';
  }

  if (String(newValue) === String(def.current)) {
    alert('Выберите значение, отличное от текущего.');
    return;
  }

  const chosenLabel = def.options.find(o => String(o.value) === rawVal)?.label ?? rawVal;

  document.getElementById('constitution-dialog-overlay')?.remove();

  const law = {
    id:               `CONST_${String(Date.now()).slice(-6)}`,
    name:             `Поправка: ${def.label} → ${chosenLabel}`,
    text:             `Предлагается изменить конституционный параметр «${def.label}» с текущего значения на «${chosenLabel}».`,
    type:             'reform',
    tags:             ['constitution'],
    threshold:        67,
    proposed_turn:    GAME_STATE.turn,
    effects_per_turn: {},
    requires_vote:    true,
    vote:             null,
    constitution_change: {
      field:     key,
      new_value: newValue,
      old_value: def.current,
      label:     `${def.label}: ${chosenLabel}`,
    },
  };

  startSenateDebate(nationId, law, speech);
}

// ──────────────────────────────────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ──────────────────────────────────────────────────────────────────────

function getGovTypeIcon(type) {
  const icons = {
    tyranny:   '⚔️',
    monarchy:  '👑',
    republic:  '⚖️',
    oligarchy: '💰',
    democracy: '🗳️',
    tribal:    '🏕️',
    theocracy: '🕊️',
    custom:    '⚙️',
  };
  return icons[type] ?? '🏛';
}

function getInstTypeLabel(type) {
  const labels = {
    legislative: 'Законодательный',
    executive:   'Исполнительный',
    judicial:    'Судебный',
    military:    'Военный',
    religious:   'Религиозный',
    advisory:    'Совещательный',
  };
  return labels[type] ?? type;
}

function getDecisionMethodLabel(method) {
  const labels = {
    majority_vote:    'Голосование большинством',
    unanimous:        'Единогласно',
    single_person:    'Единолично',
    weighted_by_wealth: 'По весу богатства',
    random_oracle:    'Оракул решает',
  };
  return labels[method] ?? method;
}

function formatVoters(s) {
  const map = {
    male_citizens:  'мужчины-граждане',
    all_citizens:   'все граждане',
    council_only:   'только совет',
    landowners:     'землевладельцы',
  };
  return map[s] ?? s ?? '?';
}

// ══════════════════════════════════════════════════════════════════════
// ЗАЛЫ ВЛАСТИ — адаптивная система для всех форм правления
// ══════════════════════════════════════════════════════════════════════

const FACTION_HALL_COLORS = {
  // Республика
  'Оптиматы':              '#8B4513',
  'Популяры':              '#1565C0',
  'Новые люди':            '#2E7D32',
  // Карфаген (олигархия)
  'Клан Баркидов':         '#8B0000',
  'Торговый совет':        '#1B5E20',
  'Жреческая коллегия':    '#4A148C',
  'Земельная аристократия':'#4E342E',
};

const FACTION_AUTO_COLORS = ['#3A86D4','#D44040','#3EA858','#D4942A','#9B5DC4','#38A0A0','#C4704A','#5C5CC4'];

function getFactionColor(name, idx) {
  return FACTION_HALL_COLORS[name] ?? FACTION_AUTO_COLORS[idx % FACTION_AUTO_COLORS.length];
}

const HALL_META = {
  tyranny:    { icon: '🗡️',  name: 'Цитадель власти',     btnLabel: '🗡️ Войти в цитадель власти',   css: 'hall-tyranny'   },
  monarchy:   { icon: '👑',  name: 'Тронный зал',         btnLabel: '👑 Войти в тронный зал',        css: 'hall-monarchy'  },
  republic:   { icon: '🏛',  name: 'Зал Сената',          btnLabel: '🏛 Войти в зал Сената',         css: 'hall-republic'  },
  oligarchy:  { icon: '💰',  name: 'Совет богатых',       btnLabel: '💰 Войти в совет богатых',      css: 'hall-oligarchy' },
  democracy:  { icon: '🗳️', name: 'Народное собрание',   btnLabel: '🗳️ Открыть народное собрание', css: 'hall-democracy' },
  tribal:     { icon: '🏕',  name: 'Совет старейшин',     btnLabel: '🏕 Сесть у костра старейшин',  css: 'hall-tribal'    },
  theocracy:  { icon: '🔱',  name: 'Святилище',           btnLabel: '🔱 Войти в святилище',         css: 'hall-theocracy' },
  custom:     { icon: '⚙️',  name: 'Кастомный зал',       btnLabel: '⚙️ Настроить зал власти',      css: 'hall-custom'    },
};

function getDispositionIcon(disp) {
  if (disp >= 70) return '😄';
  if (disp >= 55) return '🙂';
  if (disp >= 40) return '😐';
  if (disp >= 25) return '😒';
  return '😠';
}

// ── ГЛАВНЫЙ РЕНДЕР ЗАЛА ──────────────────────────────────────────────
function renderGovernmentHall(gov, nation) {
  const meta = HALL_META[gov.type] ?? HALL_META.custom;
  return `
    <div class="gov-section">
      <div class="gov-section-title">${meta.icon} ${meta.name}</div>
      <button class="hall-entry-btn" onclick="toggleGovernmentHall('${gov.type}')">
        ${meta.btnLabel}
      </button>
      <div id="gov-hall-container" style="display:none"></div>
    </div>
  `;
}

function toggleGovernmentHall(govType) {
  const container = document.getElementById('gov-hall-container');
  if (!container) return;
  if (container.style.display !== 'none') { container.style.display = 'none'; return; }

  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const gov    = nation.government;
  const meta   = HALL_META[govType] ?? HALL_META.custom;

  container.innerHTML = `<div class="${meta.css}">${buildHallContent(gov, nation, govType)}</div>`;
  container.style.display = 'block';
}

function buildHallContent(gov, nation, govType) {
  switch (govType) {
    case 'tyranny':   return buildThroneRoomContent(gov, nation);
    case 'monarchy':  return buildRoyalCourtContent(gov, nation);
    case 'republic':  return buildSenateContent(gov, nation);
    case 'oligarchy': return buildTradeCouncilContent(gov, nation);
    case 'democracy': return buildPeoplesAssemblyContent(gov, nation);
    case 'tribal':    return buildElderCouncilContent(gov, nation);
    case 'theocracy': return buildPriestlySynodContent(gov, nation);
    case 'custom':    return buildCustomHallContent(gov, nation);
    default:          return buildSenateContent(gov, nation);
  }
}

// ── ВСПОМОГАТЕЛЬНЫЕ ──────────────────────────────────────────────────
function getHallActors(gov, nation) {
  // Ищем персонажей из всех институтов
  const allIds = new Set();
  for (const inst of (gov.institutions ?? [])) {
    (inst.character_ids ?? []).forEach(id => allIds.add(id));
  }
  (gov.ruler?.character_ids ?? []).forEach(id => allIds.add(id));
  return (nation.characters ?? []).filter(c => allIds.has(c.id));
}

function getActorsNoIds(gov, nation) {
  // Если нет character_ids — возвращаем всех персонажей нации
  const actors = getHallActors(gov, nation);
  if (actors.length) return actors;
  return nation.characters ?? [];
}

function renderActorCard(actor, govType) {
  const disp = actor.disposition ?? 50;
  const dispIcon = getDispositionIcon(disp);

  // Для племени — честь; для монархии — ранг; для всех — лояльность
  let barValue, barColor, barLabel;
  if (govType === 'tribal') {
    barValue = actor.honor ?? actor.traits?.loyalty ?? 50;
    barColor = '#FF9800';
    barLabel = `Честь: ${barValue}`;
  } else {
    barValue = actor.traits?.loyalty ?? 50;
    barColor = barValue > 65 ? '#4CAF50' : barValue > 35 ? '#FF9800' : '#f44336';
    barLabel = `Лоял.: ${barValue}`;
  }

  const wantStr = (actor.wants ?? []).slice(0,1).map(w => formatWant(w)).join('');
  const ambition = (actor.ambition_goal ?? '').replace(/_/g,' ');
  const rankBadge = actor.court_rank
    ? `<span class="hall-court-rank-badge hall-rank-${actor.court_rank}">${['','★ Первый','▲ Второй','◆ Третий'][actor.court_rank] ?? ''}</span>`
    : '';
  const roleLabel = (actor.court_role ?? actor.role ?? '').replace(/_/g,' ');

  return `
    <div class="senator-card" onclick="openActorNegotiation('${actor.id}')">
      <span class="senator-disp">${dispIcon}</span>
      <div class="senator-card-top">
        <span class="senator-portrait">${actor.portrait ?? '👤'}</span>
        <span class="senator-name">${actor.name}</span>
      </div>
      ${rankBadge}
      <div class="senator-meta">${actor.age} лет · ${roleLabel}</div>
      ${wantStr ? `<div class="senator-meta" style="color:#90CAF9">✨ ${wantStr}</div>` : ''}
      <div class="senator-loyalty-bar">
        <div class="senator-loyalty-fill" style="width:${barValue}%;background:${barColor}"></div>
      </div>
      ${ambition ? `<div class="senator-ambition">🎯 ${ambition}</div>` : ''}
    </div>
  `;
}

function renderEmptyHall(msg) {
  return `<div class="gov-text" style="padding:10px 0;color:var(--text-dim)">${msg}</div>`;
}

// ── ЦИТАДЕЛЬ ВЛАСТИ (тирания) ────────────────────────────────────────
function buildThroneRoomContent(gov, nation) {
  const ruler = gov.ruler;
  const power = gov.power_resource?.current ?? 50;
  const fearColor = power > 65 ? '#f44336' : power > 35 ? '#FF9800' : '#4CAF50';
  const actors = getActorsNoIds(gov, nation);

  // --- Показатель 1: Fear-метр ---
  const fearHtml = `
    <div class="hall-citadel-metrics">
      <div class="hall-citadel-metric">
        <span class="hall-citadel-label">⚡ Страх</span>
        <div class="bar-container wide">
          <div class="bar-fill" style="width:${power}%;background:${fearColor}"></div>
        </div>
        <span class="hall-citadel-val" style="color:${fearColor}">${Math.round(power)}/100</span>
      </div>
      ${power < 30 ? '<div class="hall-citadel-warning">⚠️ Страх ослаб — заговорщики осмелели</div>' : ''}
      ${power > 80 ? '<div class="hall-citadel-info">💪 Страх на пике — никто не смеет возражать</div>' : ''}
    </div>
  `;

  // --- Показатель 2: Личная гвардия ---
  const guard = gov.personal_guard;
  const guardHtml = guard
    ? (() => {
        const gColor = guard.loyalty > 65 ? '#4CAF50' : guard.loyalty > 35 ? '#FF9800' : '#f44336';
        return `
          <div class="hall-citadel-guard">
            <div class="hall-citadel-section-title">⚔️ Личная гвардия</div>
            <div class="hall-citadel-guard-row">
              <span>Численность: <strong>${guard.size}/100</strong></span>
              <span>Содержание: <strong>${guard.cost_per_turn ?? 0} монет/ход</strong></span>
            </div>
            <div class="hall-citadel-metric">
              <span class="hall-citadel-label">Лояльность</span>
              <div class="bar-container wide">
                <div class="bar-fill" style="width:${guard.loyalty}%;background:${gColor}"></div>
              </div>
              <span class="hall-citadel-val" style="color:${gColor}">${guard.loyalty}</span>
            </div>
            ${guard.loyalty < 30 ? '<div class="hall-citadel-warning">⚠️ Гвардия ненадёжна — риск переворота</div>' : ''}
          </div>`;
      })()
    : `<div class="hall-citadel-guard hall-citadel-empty">
        <div class="hall-citadel-section-title">⚔️ Личная гвардия</div>
        <div class="hall-citadel-guard-empty">Гвардия не набрана</div>
       </div>`;

  // --- Показатель 3: Список казнённых ---
  const executed = (nation.characters ?? []).filter(c => !c.alive && c.death_cause === 'executed');
  const executedHtml = executed.length
    ? `<div class="hall-citadel-executed">
        <div class="hall-citadel-section-title">💀 Последние казни</div>
        ${executed.slice(-3).reverse().map(c =>
          `<div class="hall-citadel-executed-row">
            <span class="hall-citadel-executed-name">${c.portrait ?? '💀'} ${c.name}</span>
            <span class="hall-citadel-executed-role dim">${c.role ?? ''}</span>
          </div>`
        ).join('')}
      </div>`
    : `<div class="hall-citadel-executed hall-citadel-empty">
        <div class="hall-citadel-section-title">💀 Казни</div>
        <div class="dim">Казней не было</div>
      </div>`;

  const rulerHtml = `
    <div class="hall-citadel-top">
      <span class="hall-citadel-portrait">🗡️</span>
      <div>
        <div class="hall-citadel-name">${ruler?.name ?? 'Тиран'}</div>
        <div class="hall-citadel-title">Единовластный правитель</div>
      </div>
    </div>
  `;

  const metricsBlock = `<div class="hall-citadel-metrics-grid">${fearHtml}${guardHtml}${executedHtml}</div>`;

  if (!actors.length) return rulerHtml + metricsBlock + renderEmptyHall('Приближённых нет. Используйте ✨ Созвать советников.');

  const cards = actors.map(a => renderActorCard(a, 'tyranny')).join('');
  return `
    ${rulerHtml}
    ${metricsBlock}
    <div class="hall-inner-circle">⚔️ Ближний круг — приближённые тирана</div>
    <div class="senate-senators-grid">${cards}</div>
  `;
}

// ── ТРОННЫЙ ЗАЛ (монархия) ───────────────────────────────────────────
function buildRoyalCourtContent(gov, nation) {
  const actors = getActorsNoIds(gov, nation);
  const ruler  = gov.ruler;

  // --- Герб и трон ---
  const emblem  = nation.flag_emoji ?? nation.emblem ?? '🛡️';
  const dynName = gov.dynasty_name ?? gov.custom_name ?? '';
  const legVal  = gov.legitimacy ?? 50;
  const legColor = legVal > 65 ? '#4CAF50' : legVal > 35 ? '#FF9800' : '#f44336';
  const stabVal  = gov.stability ?? 50;
  const stabColor = stabVal > 65 ? '#4CAF50' : stabVal > 35 ? '#FF9800' : '#f44336';

  // Наследник
  const heir = gov.succession?.heir
    ? (nation.characters ?? []).find(c => c.id === gov.succession.heir)
    : null;
  const heirHtml = heir
    ? `<div class="hall-throne-heir">👶 Наследник: <strong>${heir.name}</strong> · ${heir.age} лет</div>`
    : `<div class="hall-throne-heir" style="color:#f44336">⚠️ Наследник не назначен</div>`;

  const headerHtml = `
    <div class="hall-throne-header">
      <div class="hall-throne-emblem">${emblem}</div>
      <div class="hall-throne-info">
        <div class="hall-throne-ruler-name">${ruler?.name ?? 'Король'}</div>
        ${dynName ? `<div class="hall-throne-dynasty">Династия ${dynName}</div>` : ''}
        ${heirHtml}
      </div>
    </div>
  `;

  // --- 3 ключевых показателя: легитимность, стабильность, армия ---
  const armyLoyalty = nation.military?.army_loyalty ?? nation.military?.loyalty ?? null;
  const armyHtml = armyLoyalty !== null
    ? `<div class="hall-throne-metric">
        <span class="hall-throne-metric-label">⚔️ Верность армии</span>
        <div class="bar-container wide">
          <div class="bar-fill" style="width:${armyLoyalty}%;background:${armyLoyalty > 60 ? '#4CAF50' : '#FF9800'}"></div>
        </div>
        <span>${armyLoyalty}/100</span>
      </div>`
    : '';

  const metricsHtml = `
    <div class="hall-throne-metrics">
      <div class="hall-throne-metric">
        <span class="hall-throne-metric-label">📜 Легитимность</span>
        <div class="bar-container wide">
          <div class="bar-fill" style="width:${legVal}%;background:${legColor}"></div>
        </div>
        <span style="color:${legColor}">${legVal.toFixed(0)}/100</span>
      </div>
      <div class="hall-throne-metric">
        <span class="hall-throne-metric-label">⚖️ Стабильность</span>
        <div class="bar-container wide">
          <div class="bar-fill" style="width:${stabVal}%;background:${stabColor}"></div>
        </div>
        <span style="color:${stabColor}">${stabVal.toFixed(0)}/100</span>
      </div>
      ${armyHtml}
    </div>
  `;

  if (!actors.length) return headerHtml + metricsHtml + renderEmptyHall('Придворные не назначены. Используйте ✨ Созвать советников.');

  // Сортируем по court_rank (1 — ближайший к трону)
  const sorted = [...actors].sort((a,b) => (a.court_rank ?? 99) - (b.court_rank ?? 99));
  const cards = sorted.map(a => renderActorCard(a, 'monarchy')).join('');
  return `
    ${headerHtml}
    ${metricsHtml}
    <div class="hall-inner-circle">👑 Иерархия двора — от ближайшего к трону</div>
    <div class="senate-senators-grid">${cards}</div>
  `;
}

// ── ЗАЛ СЕНАТА (республика) ──────────────────────────────────────────
function buildSenateContent(gov, nation) {
  const insts = gov.institutions ?? [];

  // Институт с реальными персонажами (для интерактивных мест)
  const charInst    = insts.find(i => i.character_ids?.length) ?? null;
  // Институт с данными о фракциях и числе мест (может быть другим)
  const factionInst = insts.find(i => i.factions?.some(f => f.seats)) ?? charInst;

  const senators = charInst
    ? (nation.characters ?? []).filter(c => charInst.character_ids.includes(c.id))
    : (nation.characters ?? []);

  if (!senators.length && !factionInst?.factions?.length)
    return renderEmptyHall('Членов нет. Используйте ✨ Созвать советников.');

  // Строим группы фракций из того института, где есть данные о местах
  const rawFactions = factionInst?.factions ?? [];
  const byFaction   = {};

  if (rawFactions.length) {
    for (const f of rawFactions) byFaction[f.name] = { faction: f, senators: [] };
  } else {
    byFaction[''] = { faction: { name: 'Сенат' }, senators: [] };
  }

  // Привязываем реальных персонажей к фракциям
  const unassigned = [];
  for (const s of senators) {
    const key = s.faction_name ?? '';
    if (byFaction[key] !== undefined) byFaction[key].senators.push(s);
    else unassigned.push(s);
  }

  // Нераспределённых раздаём: сначала по одному на каждую пустую фракцию,
  // потом остатки — в первую фракцию
  if (unassigned.length) {
    const keys = Object.keys(byFaction);
    let ui = 0;
    // Первый проход: каждой фракции без персонажей — по одному лидеру
    for (const key of keys) {
      if (ui >= unassigned.length) break;
      if (byFaction[key].senators.length === 0)
        byFaction[key].senators.push(unassigned[ui++]);
    }
    // Остальные → в первую фракцию
    for (; ui < unassigned.length; ui++)
      byFaction[keys[0]].senators.push(unassigned[ui]);
  }

  const groups  = Object.values(byFaction);
  const total   = groups.reduce((s, g) => s + (g.faction.seats ?? g.senators.length), 0);
  const majority = Math.floor(total / 2) + 1;

  const svgHtml = _buildParliamentSVG(groups, total);

  const legend = groups.map(({ faction, senators: sns }, gi) => {
    const color       = getFactionColor(faction.name || 'Сенат', gi);
    const seatCount   = faction.seats ?? sns.length;
    const leader      = sns.find(s => s.id === faction.leader_id) ?? sns[0] ?? null;
    const leaderFirst = leader?.name?.split(' ')[0] ?? '';
    return `
      <div class="parl-faction-row">
        <span class="parl-faction-dot" style="background:${color}"></span>
        <span class="parl-faction-name">${faction.name || 'Сенат'}</span>
        <span class="parl-faction-count">${seatCount}</span>
        ${leader ? `<button class="parl-leader-btn" onclick="openActorNegotiation('${leader.id}')"
          title="Переговоры с лидером фракции">${leader.portrait ?? '👤'} ${leaderFirst}</button>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="parliament-container">
      <div class="parliament-header">
        <span class="parliament-title">Зал Сената · ${total} мест</span>
        <span class="parliament-majority">Для большинства: ${majority}</span>
      </div>
      ${svgHtml}
      <div class="parl-legend">${legend}</div>
    </div>`;
}

function _buildParliamentSVG(groups, total) {
  const W = 340, H = 195;
  const cx = W / 2, cy = H - 6;
  const SEP = total > 60 ? 14 : total > 30 ? 17 : 20; // плотность зависит от числа мест

  // Ряды: радиусы от внутреннего к внешнему
  const rowRadii = [];
  for (let r = 48; r <= 178; r += (SEP + 5)) rowRadii.push(r);

  const caps = rowRadii.map(r => Math.max(3, Math.floor(Math.PI * r / SEP)));

  // Распределяем полное число мест по рядам
  const rows = [];
  let rem = total;
  for (let i = 0; i < rowRadii.length && rem > 0; i++) {
    const n = Math.min(rem, caps[i]);
    rows.push({ r: rowRadii[i], n });
    rem -= n;
  }

  // Плоский список всех мест: сначала реальные персонажи, потом анонимные
  const allSeats = [];
  groups.forEach((g, gi) => {
    const color       = getFactionColor(g.faction.name || 'Сенат', gi);
    const seatCount   = g.faction.seats ?? g.senators.length;
    const namedIds    = new Set(g.senators.map(s => s.id));
    const leaderId    = g.faction.leader_id ?? g.senators[0]?.id ?? null;

    // Реальные персонажи
    for (const s of g.senators) {
      allSeats.push({ color, id: s.id, name: s.name,
                      interactive: true, isLeader: s.id === leaderId });
    }
    // Анонимные кресла до нужного числа мест
    for (let i = g.senators.length; i < seatCount; i++) {
      allSeats.push({ color, id: null,
                      name: `${g.faction.name || 'Сенат'} · сенатор`,
                      interactive: false, isLeader: false });
    }
  });

  // Размещаем кресла по рядам
  const SR_NAMED = 7, SR_ANON = 5.5;
  let idx = 0;
  const circles = [];
  for (const row of rows) {
    for (let i = 0; i < row.n; i++) {
      const angle = Math.PI * (1 - (i + 0.5) / row.n);
      const x = +(cx + row.r * Math.cos(angle)).toFixed(1);
      const y = +(cy - row.r * Math.sin(angle)).toFixed(1);
      const seat = allSeats[idx++];
      if (!seat) break;

      if (seat.interactive) {
        const ring = seat.isLeader
          ? `stroke="#FFD700" stroke-width="2.5"`
          : `stroke="rgba(255,255,255,0.5)" stroke-width="1.2"`;
        circles.push(
          `<circle cx="${x}" cy="${y}" r="${SR_NAMED}" fill="${seat.color}" ${ring} ` +
          `class="parl-seat" onclick="openActorNegotiation('${seat.id}')">` +
          `<title>${seat.name}${seat.isLeader ? ' ★ лидер' : ''}</title></circle>`
        );
      } else {
        circles.push(
          `<circle cx="${x}" cy="${y}" r="${SR_ANON}" fill="${seat.color}" ` +
          `opacity="0.55" stroke="rgba(0,0,0,0.25)" stroke-width="0.5">` +
          `<title>${seat.name}</title></circle>`
        );
      }
    }
  }

  const baseY = (cy + 2).toFixed(1);
  const base  = `<line x1="0" y1="${baseY}" x2="${W}" y2="${baseY}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;

  return `<svg viewBox="0 0 ${W} ${H}" class="parliament-svg">${base}${circles.join('')}</svg>`;
}

// ── СОВЕТ БОГАТЫХ (олигархия) ─────────────────────────────────────────
function buildTradeCouncilContent(gov, nation) {
  const actors = getActorsNoIds(gov, nation);
  if (!actors.length) return renderEmptyHall('Члены совета не назначены. Используйте ✨ Созвать советников.');

  const totalGold = actors.reduce((s,a) => s + (a.resources?.gold ?? 0), 1);

  // --- Показатель 1: Wealth rankings (топ-3 богатейших) ---
  const sortedByWealth = [...actors].sort((a,b) => (b.resources?.gold ?? 0) - (a.resources?.gold ?? 0));
  const rankMedals = ['🥇','🥈','🥉'];
  const wealthRankingHtml = `
    <div class="hall-oligarchy-rankings">
      <div class="hall-oligarchy-title">💰 Богатейшие члены совета</div>
      ${sortedByWealth.slice(0,3).map((a,i) => {
        const gold = a.resources?.gold ?? 0;
        const pct  = Math.round(gold / totalGold * 100);
        return `
          <div class="hall-oligarchy-rank-row">
            <span class="hall-oligarchy-medal">${rankMedals[i] ?? '·'}</span>
            <span class="hall-oligarchy-name">${a.name}</span>
            <div class="bar-container" style="flex:1">
              <div class="bar-fill" style="width:${pct}%;background:#FFD700"></div>
            </div>
            <span class="hall-oligarchy-gold">${gold.toLocaleString()} зол. (${pct}%)</span>
          </div>`;
      }).join('')}
    </div>
  `;

  // --- Показатель 2: Общее богатство и казна ---
  const totalWealth = actors.reduce((s,a) => s + (a.resources?.gold ?? 0), 0);
  const treasury    = nation.economy?.treasury ?? 0;
  const wealthStatsHtml = `
    <div class="hall-oligarchy-stats">
      <span>💼 Совокупное состояние: <strong>${totalWealth.toLocaleString()} зол.</strong></span>
      <span>🏦 Казна государства: <strong>${treasury.toLocaleString()} зол.</strong></span>
    </div>
  `;

  // Полоска влияния по богатству
  const segs = actors.map((a, i) => {
    const pct   = Math.round((a.resources?.gold ?? 0) / totalGold * 100);
    const colors = ['#4CAF50','#2196F3','#FF9800','#9C27B0','#f44336','#00BCD4'];
    const color  = colors[i % colors.length];
    return `<div class="hall-influence-seg" style="width:${pct}%;background:${color}" title="${a.name}: ${pct}% влияния"></div>`;
  }).join('');

  // Фракционные группы, если есть
  const byFaction = {};
  for (const a of actors) {
    const key = a.faction_name ?? '─';
    if (!byFaction[key]) byFaction[key] = [];
    byFaction[key].push(a);
  }
  const hasFactions = Object.keys(byFaction).length > 1 || !byFaction['─'];

  let cardsHtml;
  if (hasFactions) {
    cardsHtml = Object.entries(byFaction).map(([fName, members]) => {
      const color = FACTION_HALL_COLORS[fName] ?? '#2E7D32';
      const cards = members.map(a => renderActorCard(a, 'oligarchy')).join('');
      return `
        <div class="senate-faction-group">
          <div class="senate-faction-header" style="background:${color}22;border-left:3px solid ${color}">
            <span style="color:${color}">●</span><span>${fName}</span>
          </div>
          <div class="senate-senators-grid">${cards}</div>
        </div>`;
    }).join('');
  } else {
    const cards = actors.map(a => renderActorCard(a, 'oligarchy')).join('');
    cardsHtml = `<div class="senate-senators-grid hall-council-table">${cards}</div>`;
  }

  return `
    ${wealthRankingHtml}
    ${wealthStatsHtml}
    <div class="hall-influence-ring">${segs}</div>
    <div class="hall-inner-circle">💰 Доля влияния пропорциональна состоянию</div>
    ${cardsHtml}
  `;
}

// ── НАРОДНОЕ СОБРАНИЕ (демократия) ────────────────────────────────────
function buildPeoplesAssemblyContent(gov, nation) {
  const pop   = nation.population ?? {};
  const happy = pop.happiness ?? 50;
  const prof  = pop.by_profession ?? {};

  const groups = [
    { id:'farmers',   icon:'🌾', name:'Земледельцы', size:prof.farmers??0,   want:'land_reform',     fear:'drought'       },
    { id:'craftsmen', icon:'⚒️', name:'Ремесленники',size:prof.craftsmen??0, want:'fair_wages',      fear:'import_goods'  },
    { id:'merchants', icon:'⚖️', name:'Торговцы',    size:prof.merchants??0, want:'free_trade',      fear:'war'           },
    { id:'soldiers',  icon:'⚔️', name:'Воины',       size:prof.soldiers??0,  want:'military_glory',  fear:'defeat'        },
    { id:'clergy',    icon:'🏛️', name:'Жрецы',       size:prof.clergy??0,    want:'temple_funds',    fear:'sacrilege'     },
  ].filter(g => g.size > 0);

  if (!groups.length) return renderEmptyHall('Нет данных о населении.');

  const rows = groups.map(g => {
    const sat = happy + Math.round((Math.random() * 10 - 5));
    const satColor = sat > 65 ? '#4CAF50' : sat > 40 ? '#FF9800' : '#f44336';
    const fmtSize = g.size > 999999 ? (g.size/1000000).toFixed(1)+'М' : g.size > 999 ? Math.round(g.size/1000)+'К' : g.size;
    return `
      <div class="hall-pop-group" onclick="openGroupNegotiation('${g.id}','${gov.type}')">
        <span class="hall-pop-icon">${g.icon}</span>
        <div class="hall-pop-info">
          <div class="hall-pop-name">${g.name}</div>
          <div class="hall-pop-size">${fmtSize} чел.</div>
          <div class="hall-pop-want">✨ ${formatWant(g.want)}</div>
        </div>
        <div class="hall-pop-sat-bar">
          <div class="hall-pop-sat-outer">
            <div class="hall-pop-sat-fill" style="width:${sat}%;background:${satColor}"></div>
          </div>
          <div class="hall-pop-sat-val">${sat}%</div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="hall-inner-circle">🗳️ Голосуют блоки граждан</div>
    <div class="hall-democracy-groups">${rows}</div>
  `;
}

// ── СОВЕТ СТАРЕЙШИН (племя) ───────────────────────────────────────────
function buildElderCouncilContent(gov, nation) {
  const actors = getActorsNoIds(gov, nation);

  // --- Показатель 1: Prestige-метр ---
  const prestige = gov.power_resource?.current ?? 50;
  const presColor = prestige > 60 ? '#FF9800' : prestige > 30 ? '#FF9800' : '#f44336';
  const lastWar   = gov._last_war_turn ?? 0;
  const peaceYears = Math.max(0, GAME_STATE.turn - lastWar - 10);
  const atPeace   = GAME_STATE.turn - lastWar;

  const prestigeHtml = `
    <div class="hall-tribal-metrics">
      <div class="hall-tribal-metric">
        <span class="hall-tribal-metric-label">🏆 Престиж вождя</span>
        <div class="bar-container wide">
          <div class="bar-fill" style="width:${prestige}%;background:${presColor}"></div>
        </div>
        <span style="color:${presColor}">${Math.round(prestige)}/100</span>
      </div>
      ${prestige < 30 ? '<div class="hall-tribal-warning">⚠️ Вождь теряет уважение племени!</div>' : ''}
    </div>
  `;

  // --- Показатель 2: Годы без войны ---
  const peaceColor = atPeace <= 4 ? '#4CAF50' : atPeace <= 9 ? '#FF9800' : '#f44336';
  const peaceHtml = `
    <div class="hall-tribal-peace">
      <span class="hall-tribal-metric-label">⚔️ Ходов без войны:</span>
      <span class="hall-tribal-peace-val" style="color:${peaceColor}">
        ${atPeace} ${atPeace <= 4 ? '(норма)' : atPeace <= 9 ? '(воины ропщут)' : '(опасно!)'}
      </span>
    </div>
  `;

  // --- Показатель 3: Кнопка «Объявить набег» если prestij < 30 ---
  const raidBtn = prestige < 50
    ? `<button class="hall-tribal-raid-btn" onclick="declareTribeRaid()" title="Набег восстановит престиж вождя">
        ⚔️ Объявить набег ${prestige < 20 ? '(СРОЧНО!)' : ''}
      </button>`
    : '';

  const headerHtml = `
    <div class="hall-campfire">🔥 🪨 🔥</div>
    ${prestigeHtml}
    ${peaceHtml}
    ${raidBtn}
  `;

  if (!actors.length) return headerHtml + renderEmptyHall('Старейшины не назначены. Используйте ✨ Созвать советников.');

  const cards = actors.map(a => renderActorCard(a, 'tribal')).join('');
  return `
    ${headerHtml}
    <div class="hall-tribal-circle">${cards}</div>
    <div class="hall-inner-circle">🏕 Решения принимаются у священного костра</div>
  `;
}

function declareTribeRaid() {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const gov    = nation?.government;
  if (!gov) return;
  // Флаг для движка — объявить малую войну для восстановления престижа
  gov._raid_declared = true;
  if (window.UI?.notify) window.UI.notify('⚔️ Вождь объявил набег. Воины воодушевлены!');
  else if (typeof addEventLog === 'function') addEventLog('⚔️ Вождь объявил набег. Воины воодушевлены!', 'military');
  if (typeof renderGovernmentOverlay === 'function') renderGovernmentOverlay();
}

// ── СВЯТИЛИЩЕ (теократия) ──────────────────────────────────────────────
function buildPriestlySynodContent(gov, nation) {
  const actors = getActorsNoIds(gov, nation);

  // --- Показатель 1: Divine mandate метр ---
  const divMandate = gov.power_resource?.current ?? gov.divine_mandate ?? 50;
  const mandateColor = divMandate > 60 ? '#FFD700' : divMandate > 30 ? '#FF9800' : '#f44336';
  const mandateHtml = `
    <div class="hall-shrine-metrics">
      <div class="hall-shrine-metric">
        <span class="hall-shrine-metric-label">✨ Воля богов</span>
        <div class="bar-container wide">
          <div class="bar-fill" style="width:${divMandate}%;background:${mandateColor}"></div>
        </div>
        <span style="color:${mandateColor}">${Math.round(divMandate)}/100</span>
      </div>
      ${divMandate < 20 ? '<div class="hall-shrine-warning">🔴 Кризис жречества — боги отвернулись!</div>' : ''}
      ${divMandate > 80 ? '<div class="hall-shrine-blessing">🌟 Боги благосклонны. Народ верует.</div>' : ''}
    </div>
  `;

  // --- Показатель 2: Оракул (последнее пророчество) ---
  const lastProphecy = gov.last_oracle_prophecy;
  const oracleHtml = `
    <div class="hall-shrine-oracle">
      <div class="hall-shrine-oracle-title">🔮 Оракул</div>
      ${lastProphecy
        ? `<div class="hall-shrine-prophecy">"${lastProphecy}"</div>`
        : `<div class="hall-shrine-prophecy dim">Оракул молчит. Ждите знамения.</div>`
      }
    </div>
  `;

  // --- Показатель 3: Эффект на голосования ---
  const oracleBonus = gov.oracle_voting_bonus ?? 0;
  const oracleBonusHtml = oracleBonus !== 0
    ? `<div class="hall-shrine-oracle-effect ${oracleBonus > 0 ? 'positive' : 'negative'}">
        ${oracleBonus > 0 ? '📈' : '📉'} Пророчество влияет на голоса: ${oracleBonus > 0 ? '+' : ''}${oracleBonus}
      </div>`
    : '';

  const altarHtml = `
    <div class="hall-synod-altar">🔱 ☽ 🔱</div>
    ${mandateHtml}
    ${oracleHtml}
    ${oracleBonusHtml}
  `;

  if (!actors.length) return altarHtml + renderEmptyHall('Жрецы не назначены. Используйте ✨ Созвать советников.');

  const sorted = [...actors].sort((a,b) => (a.court_rank??99)-(b.court_rank??99));
  const cards  = sorted.map(a => {
    const rankLabel = a.court_rank === 1 ? 'Верховный жрец' : a.court_rank === 2 ? 'Жрец высшего круга' : 'Жрец';
    return `
      <div class="senator-card" onclick="openActorNegotiation('${a.id}')">
        <span class="senator-disp">${getDispositionIcon(a.disposition??50)}</span>
        <div class="senator-card-top">
          <span class="senator-portrait">${a.portrait??'🕊️'}</span>
          <span class="senator-name">${a.name}</span>
        </div>
        <div class="hall-priest-rank">${rankLabel}</div>
        <div class="senator-meta">${(a.court_role??'').replace(/_/g,' ')}</div>
        <div class="senator-loyalty-bar">
          <div class="senator-loyalty-fill" style="width:${a.traits?.piety??50}%;background:#FFD700"></div>
        </div>
      </div>`;
  }).join('');

  return `
    ${altarHtml}
    <div class="senate-senators-grid">${cards}</div>
    <div class="hall-inner-circle">🙏 Все решения освящаются именем богов</div>
  `;
}

// ── КАСТОМНЫЙ ЗАЛ ────────────────────────────────────────────────────
function buildCustomHallContent(gov, nation) {
  const custom = gov.custom_hall;

  if (custom?.actors?.length) {
    // Показываем сконфигурированных акторов
    const cards = custom.actors.map(a => `
      <div class="senator-card" style="cursor:default">
        <div class="senator-card-top">
          <span class="senator-portrait">${a.icon ?? '👤'}</span>
          <span class="senator-name">${a.name}</span>
        </div>
        <div class="senator-meta">${(a.role??'').replace(/_/g,' ')}</div>
      </div>`).join('');
    return `
      <div class="hall-inner-circle">${custom.icon??'⚙️'} ${custom.hall_name??'Кастомный зал'}</div>
      <div class="custom-hall-actors-display">${cards}</div>
      <button class="custom-hall-add-btn" onclick="openCustomHallBuilder()">✏️ Редактировать структуру</button>`;
  }

  return renderCustomHallBuilder(gov, nation);
}

function renderCustomHallBuilder(gov, nation) {
  return `
    <div class="custom-hall-builder" id="custom-hall-builder">
      <div class="custom-hall-builder-title">⚙️ Настройка зала власти</div>
      <div class="custom-hall-field">
        <label class="custom-hall-label">Название зала</label>
        <input class="custom-hall-input" id="ch-name" placeholder="Тайный совет семи...">
      </div>
      <div class="custom-hall-field">
        <label class="custom-hall-label">Иконка зала</label>
        <input class="custom-hall-input" id="ch-icon" placeholder="⚙️" style="width:60px">
      </div>
      <div class="custom-hall-field">
        <label class="custom-hall-label">Механика голосования</label>
        <select class="custom-hall-select" id="ch-mechanic">
          <option value="single_person">Единолично (правитель решает)</option>
          <option value="majority_vote">Голосование большинством</option>
          <option value="weighted_by_wealth">По богатству</option>
          <option value="unanimous">Единогласно</option>
          <option value="ritual">Через ритуал/знамение</option>
        </select>
      </div>
      <div class="custom-hall-field">
        <label class="custom-hall-label">Акторы зала</label>
        <div class="custom-hall-actors" id="ch-actors">
          <div class="custom-hall-actor-row">
            <input class="custom-hall-input custom-hall-actor-input" placeholder="Имя актора..." data-field="name">
            <input class="custom-hall-input" placeholder="Роль..." data-field="role" style="width:80px">
            <input class="custom-hall-input" placeholder="🧙" data-field="icon" style="width:40px">
            <button class="custom-hall-actor-remove" onclick="removeCustomActor(this)">✕</button>
          </div>
        </div>
        <button class="custom-hall-add-btn" onclick="addCustomActorRow()">+ Добавить актора</button>
      </div>
      <button class="custom-hall-save-btn" onclick="saveCustomHall()">💾 Сохранить структуру</button>
    </div>
  `;
}

function addCustomActorRow() {
  const container = document.getElementById('ch-actors');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'custom-hall-actor-row';
  row.innerHTML = `
    <input class="custom-hall-input custom-hall-actor-input" placeholder="Имя актора..." data-field="name">
    <input class="custom-hall-input" placeholder="Роль..." data-field="role" style="width:80px">
    <input class="custom-hall-input" placeholder="🧙" data-field="icon" style="width:40px">
    <button class="custom-hall-actor-remove" onclick="removeCustomActor(this)">✕</button>
  `;
  container.appendChild(row);
}

function removeCustomActor(btn) {
  btn.closest('.custom-hall-actor-row')?.remove();
}

function saveCustomHall() {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const gov    = nation.government;

  const hallName  = document.getElementById('ch-name')?.value?.trim() || 'Кастомный зал';
  const hallIcon  = document.getElementById('ch-icon')?.value?.trim() || '⚙️';
  const mechanic  = document.getElementById('ch-mechanic')?.value || 'single_person';

  const actorRows = document.querySelectorAll('#ch-actors .custom-hall-actor-row');
  const actors = [];
  actorRows.forEach(row => {
    const name = row.querySelector('[data-field="name"]')?.value?.trim();
    const role = row.querySelector('[data-field="role"]')?.value?.trim();
    const icon = row.querySelector('[data-field="icon"]')?.value?.trim();
    if (name) actors.push({ name, role: role || 'актор', icon: icon || '👤', disposition: 50 });
  });

  gov.custom_hall = { hall_name: hallName, icon: hallIcon, mechanic, actors };

  const container = document.getElementById('gov-hall-container');
  if (container) {
    container.innerHTML = `<div class="hall-custom">${buildCustomHallContent(gov, nation)}</div>`;
  }
}

function openCustomHallBuilder() {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const container = document.getElementById('gov-hall-container');
  if (container) {
    container.innerHTML = `<div class="hall-custom">${renderCustomHallBuilder(nation.government, nation)}</div>`;
  }
}

// ── ПЕРЕГОВОРЫ С АКТОРОМ ─────────────────────────────────────────────
function openActorNegotiation(charId) {
  const nation  = GAME_STATE.nations[GAME_STATE.player_nation];
  const actor   = (nation.characters ?? []).find(c => c.id === charId);
  if (!actor) return;

  let overlay = document.getElementById('senator-negotiate-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'senator-negotiate-overlay';
    overlay.onclick = e => { if (e.target === overlay) closeActorNegotiation(); };
    document.body.appendChild(overlay);
  }

  const dlgBlock = renderDialogueBlock(charId, actor.name ?? actor.court_role ?? '?', GAME_STATE.player_nation);
  overlay.innerHTML = renderActorNegotiationPanel(actor, nation, dlgBlock);
  overlay.style.display = 'flex';
}

function closeActorNegotiation() {
  const overlay = document.getElementById('senator-negotiate-overlay');
  if (overlay) overlay.style.display = 'none';

  // Синхронизируем диалог и лояльность обратно в сенатора, затем очищаем реестр
  for (const pseudo of Object.values(_DIALOGUE_TEMP_CHARS)) {
    const sen = pseudo._senator_ref;
    if (!sen) continue;
    if (pseudo.dialogue)         sen.dialogue      = pseudo.dialogue;
    if (pseudo.traits?.loyalty !== undefined) {
      // Применяем изменения лояльности которые накопились за разговор
      sen.loyalty_score = Math.max(0, Math.min(100, pseudo.traits.loyalty));
    }
  }
  for (const k of Object.keys(_DIALOGUE_TEMP_CHARS)) delete _DIALOGUE_TEMP_CHARS[k];
}

// Оставляем старые алиасы для совместимости
function openSenatorNegotiation(charId) { openActorNegotiation(charId); }
function closeSenatorNegotiation()       { closeActorNegotiation(); }

function renderActorNegotiationPanel(actor, nation, extraHtml = '') {
  const govType = nation.government?.type ?? 'tyranny';
  const disp    = actor.disposition ?? 50;
  const dispColor = disp >= 70 ? '#4CAF50' : disp >= 40 ? '#FF9800' : '#f44336';
  const dispIcon  = getDispositionIcon(disp);

  const wantsTags = (actor.wants ?? []).map(w =>
    `<span class="senator-neg-tag want">${formatWant(w)}</span>`).join('');
  const fearsTags = (actor.fears ?? []).map(f =>
    `<span class="senator-neg-tag fear">😰 ${formatWant(f)}</span>`).join('');

  const actions    = getActorActions(actor, govType, nation);
  const actionsHtml = actions.map(a => {
    const chanceClass = a.chance >= 70 ? 'good' : a.chance >= 45 ? 'ok' : 'risky';
    return `
      <button class="senator-action-btn" onclick="executeActorAction('${actor.id}','${a.id}')"
              ${a.disabled ? 'disabled' : ''}>
        <span class="senator-action-title">${a.icon} ${a.label}</span>
        <span class="senator-action-cost">${a.costText}</span>
        <span class="senator-action-chance ${chanceClass}">${a.chance}% успеха</span>
      </button>`;
  }).join('');

  const historyLast = (actor.history ?? []).slice(-2).reverse()
    .map(h => `<div style="font-size:10px;color:var(--text-dim);margin-top:2px">• ${h.event}</div>`).join('');

  const roleLabel = (actor.court_role ?? actor.role ?? '').replace(/_/g,' ');
  const factionStr = actor.faction_name ? ` · ${actor.faction_name}` : '';

  return `
    <div class="senator-negotiate-panel">
      <div class="senator-neg-header">
        <span class="senator-neg-portrait">${actor.portrait ?? '👤'}</span>
        <div class="senator-neg-info">
          <div class="senator-neg-name">${actor.name}</div>
          <div class="senator-neg-faction">${roleLabel}${factionStr} · ${actor.age} лет</div>
        </div>
        <button class="senator-neg-close" onclick="closeActorNegotiation()">✕</button>
      </div>
      <div class="senator-neg-body">
        <div class="senator-neg-desc">${actor.description ?? ''}</div>
        <div class="senator-neg-disp-row">
          <span class="senator-neg-disp-label">${dispIcon} Расположение</span>
          <div class="senator-neg-disp-bar">
            <div class="senator-neg-disp-fill" style="width:${disp}%;background:${dispColor}"></div>
          </div>
          <span class="senator-neg-disp-val">${disp}/100</span>
        </div>
        ${wantsTags ? `<div class="senator-neg-section"><div class="senator-neg-section-title">✨ Желает</div><div class="senator-neg-tags">${wantsTags}</div></div>` : ''}
        ${fearsTags ? `<div class="senator-neg-section"><div class="senator-neg-section-title">😰 Боится</div><div class="senator-neg-tags">${fearsTags}</div></div>` : ''}
        ${actor.ambition_goal ? `<div class="senator-neg-section"><div class="senator-neg-section-title">🎯 Амбиция</div><div style="font-size:11px;color:var(--text-light)">${actor.ambition_goal.replace(/_/g,' ')}</div></div>` : ''}
        <div class="senator-neg-section">
          <div class="senator-neg-section-title">⚔️ Действия</div>
          <div class="senator-neg-actions">${actionsHtml}</div>
        </div>
        <div id="senator-neg-result"></div>
        ${historyLast ? `<div class="senator-neg-section" style="margin-top:8px"><div class="senator-neg-section-title">📜 Недавно</div>${historyLast}</div>` : ''}
        ${extraHtml}
      </div>
    </div>`;
}

function getActorActions(actor, govType, nation) {
  const disp    = actor.disposition ?? 50;
  const greed   = actor.traits?.greed    ?? 50;
  const caution = actor.traits?.caution  ?? 50;
  const piety   = actor.traits?.piety    ?? 50;
  const ambition= actor.traits?.ambition ?? 50;
  const power   = nation.government?.power_resource?.current ?? 50;
  const treasury= nation.economy?.treasury ?? 0;

  const bribeCost   = Math.round(500 + greed * 80);
  const bribeChance = Math.min(90, Math.round(30 + disp * 0.4 + greed * 0.3));
  const dealChance  = Math.min(85, Math.round(20 + disp * 0.6 - caution * 0.15));
  const pressChance = Math.min(70, Math.round(10 + power * 0.5 - caution * 0.2));
  const ritualCost  = Math.round(300 + piety * 30);
  const giftCost    = Math.round(200 + greed * 50);

  const ACTIONS = {
    // Тирания
    give_gift:       { id:'give_gift',       icon:'🎁',  label:'Поднести дар',         costText:`${giftCost} золота`,             chance: Math.min(80, 30+disp*0.4+greed*0.2),  disabled: treasury < giftCost },
    do_favor:        { id:'do_favor',        icon:'🤝',  label:'Оказать услугу',        costText:'Обещание выполнить желание',     chance: dealChance,                            disabled: false },
    flatter:         { id:'flatter',         icon:'🗣',  label:'Польстить',             costText:'Бесплатно (низкий шанс)',        chance: Math.min(50,15+disp*0.25+ambition*0.1),disabled: false },
    intimidate:      { id:'intimidate',      icon:'😤',  label:'Надавить страхом',      costText:`Требует власть ≥20 (есть: ${Math.round(power)})`, chance: pressChance, disabled: power < 20 },
    // Монархия
    request_audience:{ id:'request_audience',icon:'🤝',  label:'Запросить аудиенцию',  costText:'Открыть доступ к монарху',      chance: Math.min(75,15+disp*0.5),              disabled: false },
    court_gift:      { id:'court_gift',      icon:'🎁',  label:'Дар двору',             costText:`${giftCost} золота`,             chance: Math.min(80,25+disp*0.35+greed*0.3),  disabled: treasury < giftCost },
    offer_service:   { id:'offer_service',   icon:'📜',  label:'Предложить службу',     costText:'Обещание ресурсов или помощи',  chance: dealChance,                            disabled: false },
    intrigue:        { id:'intrigue',        icon:'🕵',  label:'Интрига',               costText:'Риск: использовать против другого', chance: Math.min(65,10+disp*0.4-caution*0.2),disabled: false },
    // Республика
    deal:            { id:'deal',            icon:'🤝',  label:'Предложить союз',       costText:'Обещание поддержки желания',    chance: dealChance,                            disabled: false },
    bribe:           { id:'bribe',           icon:'💰',  label:'Подкупить',             costText:`${bribeCost} золота`,            chance: bribeChance,                           disabled: treasury < bribeCost },
    appeal:          { id:'appeal',          icon:'🗣',  label:'Апеллировать',          costText:'Апелляция к интересам (бесплатно)', chance: Math.min(80,25+disp*0.5+ambition*0.1), disabled: false },
    pressure:        { id:'pressure',        icon:'😤',  label:'Надавить',              costText:`Власть ≥20 (есть: ${Math.round(power)})`, chance: pressChance, disabled: power < 20 },
    // Олигархия
    business_deal:   { id:'business_deal',   icon:'💼',  label:'Деловое предложение',  costText:'Торговый союз / контракт',      chance: Math.min(80,20+disp*0.5+greed*0.2),   disabled: false },
    trade_alliance:  { id:'trade_alliance',  icon:'📈',  label:'Торговый союз',         costText:'Долгосрочный альянс',           chance: Math.min(75,15+disp*0.45),             disabled: false },
    econ_pressure:   { id:'econ_pressure',   icon:'📉',  label:'Экон. давление',        costText:'Угроза торговой блокадой',      chance: Math.min(60,10+power*0.4-caution*0.3),disabled: power < 30 },
    // Племя
    tribal_gifts:    { id:'tribal_gifts',    icon:'🎁',  label:'Преподнести дары',      costText:`${giftCost} золота`,             chance: Math.min(85,30+disp*0.4+greed*0.2),  disabled: treasury < giftCost },
    battle_glory:    { id:'battle_glory',    icon:'⚔️',  label:'Боевая слава',          costText:'Упомянуть победы в войне',      chance: Math.min(80,20+disp*0.5+power*0.2),   disabled: false },
    ritual:          { id:'ritual',          icon:'🪶',  label:'Провести обряд',        costText:`${ritualCost} золота`,           chance: Math.min(85,30+piety*0.4+disp*0.3),  disabled: treasury < ritualCost },
    duel_challenge:  { id:'duel_challenge',  icon:'🗡️', label:'Вызов на поединок',     costText:'Высокий риск / высокая награда',chance: Math.min(60,10+power*0.5-caution*0.3),disabled: false },
    // Теократия
    temple_donation: { id:'temple_donation', icon:'🏛',  label:'Пожертвование храму',   costText:`${ritualCost} золота`,           chance: Math.min(85,30+piety*0.45+disp*0.25),disabled: treasury < ritualCost },
    cite_omen:       { id:'cite_omen',       icon:'🔮',  label:'Ссылка на знамение',    costText:'Благоприятное знамение',        chance: Math.min(75,20+piety*0.4+disp*0.2),   disabled: false },
    sponsor_ritual:  { id:'sponsor_ritual',  icon:'📿',  label:'Спонсировать ритуал',   costText:`${ritualCost*2} золота`,         chance: Math.min(90,40+piety*0.4+disp*0.3),  disabled: treasury < ritualCost*2 },
    spiritual_alliance:{id:'spiritual_alliance',icon:'🤝',label:'Духовный союз',       costText:'Общий интерес во имя богов',    chance: Math.min(70,15+piety*0.35+disp*0.35), disabled: false },
  };

  const SETS = {
    tyranny:   ['give_gift','do_favor','flatter','intimidate'],
    monarchy:  ['request_audience','court_gift','offer_service','intrigue'],
    republic:  ['deal','bribe','appeal','pressure'],
    oligarchy: ['business_deal','bribe','trade_alliance','econ_pressure'],
    democracy: ['deal','appeal','give_gift','pressure'],
    tribal:    ['tribal_gifts','battle_glory','ritual','duel_challenge'],
    theocracy: ['temple_donation','cite_omen','sponsor_ritual','spiritual_alliance'],
  };

  const set = SETS[govType] ?? SETS.republic;
  return set.map(id => ACTIONS[id]).filter(Boolean);
}

function executeActorAction(charId, actionId) {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const actor  = (nation.characters ?? []).find(c => c.id === charId);
  if (!actor) return;

  const govType = nation.government?.type ?? 'tyranny';
  const result  = negotiateActor(charId, GAME_STATE.player_nation, actionId, govType);

  // Применяем изменения
  actor.disposition = Math.max(0, Math.min(100, (actor.disposition ?? 50) + result.disposition_delta));
  if (actor.traits) actor.traits.loyalty = Math.max(0, Math.min(100, (actor.traits.loyalty ?? 50) + result.loyalty_delta));
  if (actor.honor !== undefined) actor.honor = Math.max(0, Math.min(100, actor.honor + (result.loyalty_delta ?? 0)));
  actor.history = actor.history ?? [];
  if (result.history_note) actor.history.push({ turn: GAME_STATE.turn, event: result.history_note });

  if (result.gold_spent > 0 && nation.economy) nation.economy.treasury -= result.gold_spent;

  // Показываем результат
  const resultEl = document.getElementById('senator-neg-result');
  if (resultEl) {
    resultEl.innerHTML = `
      <div class="senator-neg-result ${result.outcome}">
        ${result.message}
        ${result.loyalty_delta !== 0 ? `<div style="font-size:10px;margin-top:4px">
          Лояльность: ${result.loyalty_delta > 0?'+':''}${result.loyalty_delta} ·
          Расположение: ${result.disposition_delta > 0?'+':''}${result.disposition_delta}
        </div>` : ''}
      </div>`;
  }

  // Обновляем зал
  const container = document.getElementById('gov-hall-container');
  if (container && container.style.display !== 'none') {
    const meta = HALL_META[govType] ?? HALL_META.custom;
    container.innerHTML = `<div class="${meta.css}">${buildHallContent(nation.government, nation, govType)}</div>`;
  }

  document.querySelectorAll('.senator-action-btn').forEach(b => b.disabled = true);
}

// Переговоры с народной группой (демократия)
function openGroupNegotiation(groupId, govType) {
  const nation = GAME_STATE.nations[GAME_STATE.player_nation];
  const groups = {
    farmers:   { name:'Земледельцы',  icon:'🌾', wants:['land_reform'], fears:['drought'] },
    craftsmen: { name:'Ремесленники', icon:'⚒️', wants:['fair_wages'],  fears:['import_goods'] },
    merchants: { name:'Торговцы',     icon:'⚖️', wants:['free_trade'],  fears:['war'] },
    soldiers:  { name:'Воины',        icon:'⚔️', wants:['military_glory'], fears:['defeat'] },
    clergy:    { name:'Жрецы',        icon:'🏛️', wants:['temple_funds'], fears:['sacrilege'] },
  };
  const group = groups[groupId];
  if (!group) return;

  const pseudo = {
    id: 'GROUP_' + groupId,
    name: group.name,
    portrait: group.icon,
    age: 0,
    court_role: 'группа_граждан',
    disposition: nation.population?.happiness ?? 50,
    ambition_goal: group.wants[0],
    wants: group.wants,
    fears: group.fears,
    traits: { loyalty: nation.population?.happiness ?? 50, greed: 30, caution: 50, ambition: 40, piety: 40, cruelty: 10 },
    description: `Группа: ${group.name}. Удовлетворённость зависит от законов и решений правителя.`,
    history: [],
  };

  let overlay = document.getElementById('senator-negotiate-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'senator-negotiate-overlay';
    overlay.onclick = e => { if (e.target === overlay) closeActorNegotiation(); };
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = renderActorNegotiationPanel(pseudo, nation);
  overlay.style.display = 'flex';
}

// Удаляем старые senate-специфичные алиасы
function toggleSenateHall(instId) { toggleGovernmentHall(GAME_STATE.nations[GAME_STATE.player_nation]?.government?.type ?? 'republic'); }

// ══════════════════════════════════════════════════════════════════════
// SENATE — Lazy Materialization UI
// ══════════════════════════════════════════════════════════════════════

// Вставляется в renderGovernmentTab после институтов.
function renderSenateLazyBlock(nationId) {
  const mgr = getSenateManager(nationId);
  if (!mgr) return '';

  const stats       = mgr.getFactionStats();
  const materialized = mgr.getMaterialized();
  const matCount     = materialized.length;

  // Берём канонический total из government.institutions (то же что SVG-парламент)
  const _nation2    = GAME_STATE.nations[nationId];
  const _govInsts2  = _nation2?.government?.institutions ?? [];
  const _fInst2     = _govInsts2.find(i => i.factions?.some(f => f.seats));
  const total       = _fInst2
    ? _fInst2.factions.reduce((s, f) => s + (f.seats ?? 0), 0)
    : mgr.senators.length;

  // Фракционная полоска распределения мест
  const factionBars = mgr.factions.map(f => {
    const s = stats[f.id];
    const pct = Math.round((s.seats / total) * 100);
    return `<div class="senate-faction-bar" style="width:${pct}%;background:${f.color};title='${s.name}: ${s.seats} мест'"></div>`;
  }).join('');

  const factionLabels = mgr.factions.map(f => {
    const s = stats[f.id];
    const loyaltyColor = s.avg_loyalty > 60 ? '#4CAF50' : s.avg_loyalty > 35 ? '#FF9800' : '#f44336';
    const leader = mgr.getFactionLeader(f.id);
    const leaderHtml = leader
      ? `<span class="senate-faction-leader" title="Лидер фракции">${leader.portrait ?? '👤'} ${leader.name}</span>`
      : '';
    return `
      <div class="senate-faction-label">
        <span class="senate-faction-dot" style="background:${f.color}"></span>
        <span class="senate-faction-name">${f.name}</span>
        <span class="senate-faction-seats">${s.seats}</span>
        <span class="senate-faction-loyalty" style="color:${loyaltyColor}">~${s.avg_loyalty}%</span>
        ${leaderHtml}
      </div>`;
  }).join('');

  // Карточки материализованных сенаторов
  const matCards = materialized.map(s => {
    const faction    = mgr.factions.find(f => f.id === s.faction_id);
    const isLeader   = faction?.leader_senator_id === s.id;
    const loyColor   = s.loyalty_score > 60 ? '#4CAF50' : s.loyalty_score > 35 ? '#FF9800' : '#f44336';
    const tagHtml    = (s.traits ?? []).map(t =>
      `<span class="senate-tag">${t}</span>`
    ).join('');
    const leaderBadge = isLeader
      ? `<span class="senate-leader-badge" title="Лидер фракции">👑</span>`
      : '';
    const cardClass = isLeader
      ? 'senate-senator-card senate-senator-materialized senate-senator-leader'
      : 'senate-senator-card senate-senator-materialized';
    return `
      <div class="${cardClass}"
           onclick="openSenatorCard('${s.id}', '${nationId}')"
           title="${s.biography ?? ''}">
        <span class="senate-senator-portrait">${s.portrait ?? '👤'}${leaderBadge}</span>
        <div class="senate-senator-info">
          <div class="senate-senator-name">${s.name}</div>
          <div class="senate-senator-tags">${tagHtml}</div>
          <div class="senate-senator-faction" style="color:${faction?.color ?? '#aaa'}">${faction?.name ?? ''}${isLeader ? ' · лидер' : ''}</div>
        </div>
        <div class="senate-senator-loyalty" style="color:${loyColor}">${s.loyalty_score}%</div>
      </div>`;
  }).join('');

  // Карточки призраков (по одной на фракцию — компактный вид)
  const ghostSummary = mgr.factions.map(f => {
    const ghosts = mgr.getGhostsByFaction(f.id);
    if (!ghosts.length) return '';
    // Показываем только одного самого честолюбивого
    const topGhost = ghosts.sort((a, b) => b.ambition_level - a.ambition_level)[0];
    return `
      <div class="senate-senator-card senate-senator-ghost"
           onclick="onSenatorGhostClick('${topGhost.id}', '${nationId}')"
           title="Нажмите, чтобы узнать личность · Фракция: ${f.name}">
        <span class="senate-senator-portrait">❓</span>
        <div class="senate-senator-info">
          <div class="senate-senator-name" style="color:#888">Неизвестен</div>
          <div class="senate-senator-tags">
            <span class="senate-tag senate-tag-dim">Честолюбие: ${'★'.repeat(topGhost.ambition_level)}</span>
          </div>
          <div class="senate-senator-faction" style="color:${f.color}">${f.name} · ещё ${ghosts.length}</div>
        </div>
        <div class="senate-senator-loyalty" style="color:#888">${topGhost.loyalty_score}%</div>
      </div>`;
  }).join('');

  return `
    <div class="gov-section-title">🏛 Сенат (${total} мест)</div>
    <div class="senate-block">

      <div class="senate-mood-bar">
        💬 <em>${mgr.global_senate_state}</em>
      </div>

      <div class="senate-seats-bar">${factionBars}</div>
      <div class="senate-faction-legend">${factionLabels}</div>

      <div class="senate-stats-row">
        <span>Проявлено личностей: <b>${matCount}</b> из ${total}</span>
        <span>Неизвестных: <b>${total - matCount}</b></span>
      </div>

      ${matCards ? `<div class="senate-senators-list">${matCards}</div>` : ''}
      ${ghostSummary ? `<div class="senate-senators-list senate-ghosts">${ghostSummary}</div>` : ''}

      <div style="margin-top:8px;">
        <button onclick="openSenateLawProposal('${nationId}')"
                style="width:100%;padding:7px;background:rgba(100,180,255,0.1);border:1px solid rgba(100,180,255,0.3);
                       border-radius:4px;color:#88ccff;cursor:pointer;font-size:12px;">
          📋 Вынести закон на голосование Сената
        </button>
      </div>

    </div>`;
}

// ══════════════════════════════════════════════════════════════════════
// СОВЕТ ПРИБЛИЖЁННЫХ ТИРАНА — вместо Сената для 'tyranny'
// ══════════════════════════════════════════════════════════════════════

function renderTyrannyCouncilBlock(nation) {
  const gov = nation.government;
  // Инициализируем council если отсутствует
  if (!gov.tyranny_council) {
    gov.tyranny_council = _generateTyrannyCouncil();
  }
  const council = gov.tyranny_council;
  const members = council.members ?? [];

  const memberCards = members.map(m => {
    const loyColor = m.loyalty > 60 ? '#4CAF50' : m.loyalty > 30 ? '#FF9800' : '#f44336';
    const betrayalRisk = Math.max(0, Math.round(100 - m.loyalty - (gov.fear_meter ?? 50) * 0.5));
    const betrayalColor = betrayalRisk > 40 ? '#f44336' : betrayalRisk > 20 ? '#FF9800' : '#4CAF50';
    const roleIcon = { 'general': '⚔️', 'treasurer': '💰', 'spymaster': '🕵️', 'herald': '📯', 'advisor': '🧠' }[m.role] ?? '👤';
    return `
      <div class="gov-council-card" style="border-left:3px solid ${loyColor};padding:8px;margin:4px 0;background:rgba(30,10,10,0.4);border-radius:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:bold;">${roleIcon} ${m.name}</span>
          <span style="font-size:11px;color:#aaa">${m.title}</span>
        </div>
        <div style="display:flex;gap:12px;margin-top:4px;font-size:12px;">
          <span>Лояльность: <span style="color:${loyColor}">${m.loyalty}%</span></span>
          <span>Риск предательства: <span style="color:${betrayalColor}">${betrayalRisk}%</span></span>
        </div>
        ${m.grudge ? `<div style="color:#ff6666;font-size:11px;margin-top:2px;">⚠️ ${m.grudge}</div>` : ''}
      </div>`;
  }).join('');

  const totalBetrayal = members.length > 0
    ? Math.round(members.reduce((s, m) => s + Math.max(0, 100 - m.loyalty - (gov.fear_meter ?? 50) * 0.5), 0) / members.length)
    : 0;
  const conspiracyWarning = totalBetrayal > 35
    ? `<div style="color:#ff6666;margin-top:6px;font-size:12px;">⚠️ Среди приближённых зреет заговор!</div>` : '';

  return `
    <div class="gov-section-title">🗡 Совет приближённых</div>
    <div class="senate-block" style="border-color:rgba(180,50,50,0.4);">
      <div class="senate-mood-bar" style="color:#cc8888;">
        👁 ${council.mood ?? 'Приближённые боятся и покоряются воле тирана.'}
      </div>
      ${memberCards || '<div style="color:#888;font-size:12px;">Нет приближённых.</div>'}
      ${conspiracyWarning}
    </div>`;
}

function _generateTyrannyCouncil() {
  const names = [
    { name: 'Каллимах', title: 'Главный советник', role: 'advisor' },
    { name: 'Демон', title: 'Начальник стражи', role: 'general' },
    { name: 'Фрасибул', title: 'Казначей', role: 'treasurer' },
    { name: 'Никодем', title: 'Начальник тайной службы', role: 'spymaster' },
    { name: 'Архелай', title: 'Глашатай двора', role: 'herald' },
  ];
  const count = 3 + Math.floor(Math.random() * 3); // 3-5 членов
  const selected = names.slice(0, count);
  return {
    mood: 'Приближённые боятся и покоряются воле тирана.',
    members: selected.map(n => ({
      ...n,
      loyalty: 40 + Math.floor(Math.random() * 45), // 40-85
      grudge: null,
    })),
  };
}

// Клик по призраку — запускает материализацию
async function onSenatorGhostClick(senatorId, nationId) {
  const mgr = getSenateManager(nationId);
  if (!mgr) return;

  const card = event?.currentTarget ?? document.querySelector(`[onclick*="${senatorId}"]`);
  if (card) {
    card.innerHTML = `<span style="padding:8px;color:#aaa">⏳ Выясняем личность…</span>`;
    card.onclick = null;
  }

  const senator = await mgr.materialize_senator(senatorId, 'player_click');

  if (senator?.materialized) {
    addEventLog(`🔍 Вы изучили сенатора: ${senator.name} (${senator.traits?.join(', ')}).`, 'character');
  }

  // Перерисовываем блок
  renderGovernmentOverlay();
}

// Открыть карточку материализованного сенатора
function openSenatorCard(senatorId, nationId) {
  const mgr = getSenateManager(nationId);
  if (!mgr) return;
  const s = mgr.getSenatorById(senatorId);
  if (!s || !s.materialized) return;

  const faction = mgr.factions.find(f => f.id === s.faction_id);
  const loyColor = s.loyalty_score > 60 ? '#4CAF50' : s.loyalty_score > 35 ? '#FF9800' : '#f44336';

  // Используем существующую панель переговоров через pseudo-персонажа.
  // dialogueId: предпочитаем character_id (реальный персонаж), иначе используем s.id
  // и временно регистрируем pseudo в nation.characters чтобы dialogue engine нашёл его.
  const nation = GAME_STATE.nations[nationId];
  const dialogueId = s.character_id ?? `_senator_${s.id}`;

  const pseudo = {
    id:          dialogueId,
    name:        s.name,
    portrait:    s.portrait ?? '👤',
    age:         s.current_age ?? 0,
    role:        'senator',
    court_role:  `Сенатор · ${faction?.name ?? ''}`,
    disposition: s.loyalty_score,
    ambition_goal: (s.traits ?? []).join(', '),
    wants:       s.hidden_interests ?? [],
    fears:       [],
    alive:       true,
    health:      s.health_points ?? 80,
    traits: {
      loyalty:   s.loyalty_score,
      ambition:  s.ambition_level * 20,
      greed:     s.wealth > 5000 ? 60 : 40,
      caution:   50,
      piety:     40,
      cruelty:   10,
    },
    dialogue:    s.dialogue ?? undefined,
    description: s.biography ?? `${s.name} — сенатор фракции «${faction?.name ?? '?'}».`,
    history:     s.history ?? [],
    resources:   { gold: s.wealth ?? 0, land: 0, followers: 0, army_command: 0 },
  };

  // Регистрируем pseudo в глобальном реестре диалогового движка.
  // Если реальный персонаж уже есть в nation.characters — синхронизируем его диалог.
  const realChar = (nation?.characters ?? []).find(c => c.id === dialogueId);
  if (realChar) {
    if (s.dialogue) realChar.dialogue = s.dialogue;
  } else {
    // Храним ссылки для обратной синхронизации при закрытии карточки
    pseudo._senator_ref  = s;
    pseudo._senator_nation = nationId;
    _DIALOGUE_TEMP_CHARS[dialogueId] = pseudo;
  }

  const senFaction  = mgr.factions.find(f => f.id === s.faction_id);
  const isLeader    = senFaction?.leader_senator_id === s.id;
  const interests   = [
    ...(s.revealed_interests ?? []),
    ...(s.hidden_interests   ?? []).map(i => `❓${i}`)
  ].join(', ') || '—';

  const actionBtns = `
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
      <button style="background:rgba(100,180,255,0.1);border:1px solid #4499ff;color:#88ccff;
                     padding:5px 10px;border-radius:4px;cursor:pointer;font-size:11px;"
              onclick="senateReveal('${s.id}','${nationId}')">
        🔍 Разведать интересы
      </button>
    </div>
    <div style="font-size:10px;color:#777;margin-top:5px;">
      Интересы: ${interests} · Здоровье: ${s.health_points ?? '?'} · Влияние: ${s.influence ?? '?'}
      ${isLeader ? ' · 👑 Лидер фракции' : ''}
    </div>

    ${renderDialogueBlock(dialogueId, s.name, nationId)}
  `;

  let overlay = document.getElementById('senator-negotiate-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'senator-negotiate-overlay';
    document.body.appendChild(overlay);
  }
  overlay.onclick = e => {
    if (e.target === overlay) closeActorNegotiation();
  };
  overlay.innerHTML = renderActorNegotiationPanel(pseudo, nation, actionBtns);
  overlay.style.display = 'flex';
}

// ── Подкуп сенатора ──────────────────────────────────────────────────
function senateBribe(senatorId, nationId, amount) {
  const mgr    = getSenateManager(nationId);
  const nation = GAME_STATE.nations[nationId];
  if (!mgr || !nation) return;

  if ((nation.economy?.treasury ?? 0) < amount) {
    addEventLog('💸 Казна пуста — подкуп невозможен.', 'warning');
    return;
  }

  const result = mgr.attempt_bribe(senatorId, amount);
  if (result.success || result.scandal) nation.economy.treasury -= amount;

  if (result.success) {
    addEventLog(
      `💰 ${result.senator_name} принял ${amount} монет. Лояльность ${result.loyalty_before}% → ${result.loyalty_after}%.`,
      'good'
    );
    mgr._recalculateSenateState();
  } else if (result.scandal) {
    addEventLog(
      `😱 СКАНДАЛ! ${result.senator_name} разоблачил попытку подкупа. Честь Консула падает.`,
      'danger'
    );
  } else {
    addEventLog(`❌ ${result.senator_name} отказался от золота.`, 'warning');
  }

  document.getElementById('senator-negotiate-overlay').style.display = 'none';
  renderAll();
}

// ── Разведка интересов сенатора ─────────────────────────────────────
function senateReveal(senatorId, nationId) {
  const mgr = getSenateManager(nationId);
  if (!mgr) return;
  const revealed = mgr.reveal_interests(senatorId);
  const senator  = mgr.getSenatorById(senatorId);
  if (revealed.length) {
    addEventLog(
      `🔍 Шпионы раскрыли интересы ${senator?.name ?? '?'}: ${revealed.join(', ')}.`,
      'info'
    );
  } else {
    addEventLog(`🔍 Ничего подозрительного в досье ${senator?.name ?? '?'} не найдено.`, 'info');
  }
  document.getElementById('senator-negotiate-overlay').style.display = 'none';
  renderAll();
}

// ── «Предложить закон в Сенат» — выбор типа ─────────────────────────
function openSenateLawProposal(nationId) {
  let overlay = document.getElementById('senate-law-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'senate-law-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.82);display:flex;align-items:center;justify-content:center;z-index:2000;';
    overlay.onclick = e => { if (e.target === overlay) overlay.style.display = 'none'; };
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="senate-law-form">
      <div class="slf-title">🏛️ Вынести закон на голосование Сената</div>
      <div class="slf-subtitle">Консул, составьте текст закона и подготовьте речь перед отцами-сенаторами</div>

      <label class="slf-label">Название закона</label>
      <input id="slf-law-name" class="slf-input" type="text" maxlength="80"
             placeholder="Напр.: «О расширении портовых сборов»" />

      <label class="slf-label">Текст и суть закона</label>
      <textarea id="slf-law-text" class="slf-textarea" rows="3"
                placeholder="Опишите, что именно предлагается. Сенат будет читать это."></textarea>

      <label class="slf-label">Категория <span style="color:#888;font-size:10px;">(влияет на фракционное голосование)</span></label>
      <select id="slf-law-type" class="slf-select">
        <option value="trade">🪙 Торговля и рынки</option>
        <option value="war">⚔️ Военные ассигнования</option>
        <option value="build">🏗️ Строительство и инфраструктура</option>
        <option value="taxes">📊 Налоги и финансы</option>
        <option value="religion">🔱 Религия и обряды</option>
        <option value="diplomacy">🤝 Дипломатия</option>
        <option value="reform">⚖️ Административная реформа</option>
      </select>

      <label class="slf-label">Ваша речь перед Сенатом <span style="color:#888;font-size:10px;">(необязательно, но влияет на итог)</span></label>
      <textarea id="slf-law-speech" class="slf-textarea" rows="4"
                placeholder="Отцы-сенаторы! Обращаюсь к вам с этим законом потому...&#10;Упомяните торговлю, войну, народ, традиции — сенаторы заметят."></textarea>

      <div class="slf-btns">
        <button onclick="document.getElementById('senate-law-overlay').style.display='none'"
                class="slf-btn-cancel">Отмена</button>
        <button onclick="submitSenateLaw('${nationId}')" class="slf-btn-submit">
          ⚖️ Войти в зал Сената
        </button>
      </div>
    </div>
  `;
  overlay.style.display = 'flex';
}

function submitSenateLaw(nationId) {
  const nameEl   = document.getElementById('slf-law-name');
  const textEl   = document.getElementById('slf-law-text');
  const typeEl   = document.getElementById('slf-law-type');
  const speechEl = document.getElementById('slf-law-speech');

  const lawName   = (nameEl?.value  ?? '').trim();
  const lawText   = (textEl?.value  ?? '').trim();
  const lawType   = typeEl?.value   ?? 'reform';
  const speech    = (speechEl?.value ?? '').trim();

  if (!lawName) {
    nameEl?.focus();
    nameEl?.classList.add('slf-input-error');
    setTimeout(() => nameEl?.classList.remove('slf-input-error'), 1200);
    return;
  }

  document.getElementById('senate-law-overlay').style.display = 'none';

  const law = {
    id:               `LAW_${String(Date.now()).slice(-6)}`,
    name:             lawName,
    text:             lawText || `Консул выносит на голосование: «${lawName}».`,
    type:             lawType,
    proposed_turn:    GAME_STATE.turn,
    effects_per_turn: {},
    requires_vote:    true,
    vote:             null,
  };

  startSenateDebate(nationId, law, speech);
}

// ══════════════════════════════════════════════════════════════════════
// СВОБОДНЫЙ ДИАЛОГ С ПЕРСОНАЖЕМ
// ══════════════════════════════════════════════════════════════════════

// Общий рендер блока диалога — используется в ЛЮБОЙ панели персонажа.
// charId    — id персонажа
// charName  — имя для placeholder
// nationId  — нация (строка); null → GAME_STATE.player_nation
function renderDialogueBlock(charId, charName, nationId) {
  const nId    = nationId ?? GAME_STATE.player_nation;
  const nation = GAME_STATE.nations[nId];
  const char   = (nation?.characters ?? []).find(c => c.id === charId);

  const patience      = char?.dialogue?.patience_score ?? 100;
  const patienceColor = patience > 60 ? '#4CAF50' : patience > 30 ? '#FF9800' : '#f44336';
  const hotMemory     = (char?.dialogue?.hot_memory ?? []).slice(-10);

  const historyHtml = hotMemory.map(m => {
    const isPlayer = m.role === 'player';
    return `<div class="dlg-msg ${isPlayer ? 'dlg-player' : 'dlg-char'}">
      <span class="dlg-msg-label">${isPlayer ? '👑 Вы' : _escHtml(charName)}</span>
      <span class="dlg-msg-text">${_escHtml(m.text)}</span>
    </div>`;
  }).join('');

  const natArg = nId ? `'${nId}'` : 'null';

  return `
    <div class="dlg-section">
      <div class="dlg-section-header">
        <span class="dlg-section-title">💬 Свободный разговор</span>
        <span class="dlg-patience-bar" title="Терпение — при спаме или бессмыслице падает до 0, персонаж прекратит разговор">
          <span style="font-size:10px;color:#aaa;">Терпение:</span>
          <span class="dlg-patience-track">
            <span class="dlg-patience-fill" style="width:${patience}%;background:${patienceColor}"></span>
          </span>
          <span style="font-size:10px;color:${patienceColor}">${patience}%</span>
        </span>
      </div>
      <div class="dlg-history" id="dlg-history-${charId}">
        ${historyHtml || '<div class="dlg-empty">Начните разговор — напишите что-нибудь ниже.</div>'}
      </div>
      <div class="dlg-input-row">
        <textarea class="dlg-input" id="dlg-input-${charId}"
          placeholder="Говорите с ${_escHtml(charName)}… (союз, подкуп, угроза, просьба — своими словами)"
          rows="2" onkeydown="dlgHandleKey(event,'${charId}',${natArg})"></textarea>
        <button class="dlg-send-btn" onclick="dlgSend('${charId}',${natArg})" title="Отправить (Enter)">➤</button>
      </div>
      <div class="dlg-status" id="dlg-status-${charId}"></div>
    </div>`;
}

// Enter без Shift — отправить; Shift+Enter — перенос строки
function dlgHandleKey(event, charId, nationId) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    dlgSend(charId, nationId);
  }
}

async function dlgSend(charId, nationId) {
  const input  = document.getElementById(`dlg-input-${charId}`);
  const status = document.getElementById(`dlg-status-${charId}`);
  const history = document.getElementById(`dlg-history-${charId}`);
  if (!input || !status) return;

  const text = input.value.trim();
  if (!text) return;

  // Блокируем кнопку на время запроса
  input.disabled = true;
  status.innerHTML = '<span class="dlg-thinking">⏳ Персонаж обдумывает ответ…</span>';

  try {
    const result = await DIALOGUE_ENGINE.processPlayerInput(charId, text, nationId);

    // Добавляем реплики в DOM
    if (history) {
      // Удаляем плейсхолдер если есть
      const empty = history.querySelector('.dlg-empty');
      if (empty) empty.remove();

      const playerDiv = document.createElement('div');
      playerDiv.className = 'dlg-msg dlg-player';
      playerDiv.innerHTML = `<span class="dlg-msg-label">👑 Вы</span><span class="dlg-msg-text">${_escHtml(text)}</span>`;
      history.appendChild(playerDiv);

      const charDiv = document.createElement('div');
      charDiv.className = `dlg-msg dlg-char${result.blocked ? ' dlg-blocked' : ''}`;
      const nation = GAME_STATE.nations[nationId ?? GAME_STATE.player_nation];
      const char   = (nation?.characters ?? []).find(c => c.id === charId);
      charDiv.innerHTML = `<span class="dlg-msg-label">${char?.name ?? '?'}</span><span class="dlg-msg-text">${_escHtml(result.reply ?? result.error ?? '…')}</span>`;
      history.appendChild(charDiv);

      // Скроллим вниз
      history.scrollTop = history.scrollHeight;
    }

    // Статус-строка: эффекты
    const effectLines = (result.effects ?? []).map(e => {
      if (e.type === 'loyalty')    return `${e.delta > 0 ? '📈' : '📉'} Лояльность ${e.delta > 0 ? '+' : ''}${e.delta}`;
      if (e.type === 'bribe_paid') return `💰 Выплачено ${e.amount} золота`;
      if (e.type === 'tyranny')    return `👁 Тирания +${e.delta}`;
      if (e.type === 'insult')     return `😤 Терпение −20`;
      return '';
    }).filter(Boolean);

    const pColor = (result.patience ?? 100) > 60 ? '#4CAF50' : (result.patience ?? 100) > 30 ? '#FF9800' : '#f44336';
    status.innerHTML = effectLines.length
      ? `<span class="dlg-effects">${effectLines.join(' · ')}</span> <span style="color:${pColor}">Терпение: ${result.patience ?? 100}%</span>`
      : `<span style="color:${pColor}">Терпение: ${result.patience ?? 100}%</span>`;

    input.value = '';
  } catch (err) {
    console.error('[dlgSend]', err);
    status.innerHTML = '<span style="color:#f44">Ошибка связи с персонажем.</span>';
  } finally {
    input.disabled = false;
    input.focus();
  }
}

function _escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════════════════════════════
// СИСТЕМА ПРИКАЗОВ И ДЕЛЕГИРОВАНИЯ
// ══════════════════════════════════════════════════════════════════════

function renderOrdersSection(nation) {
  const active    = typeof getActiveOrders       === 'function' ? getActiveOrders()       : [];
  const completed = typeof getRecentCompletedOrders === 'function' ? getRecentCompletedOrders(4) : [];
  const chars     = (nation.characters ?? []).filter(c => c.alive);

  const hasOrders = active.length > 0 || completed.length > 0;

  return `
    <div class="gov-section" id="orders-section">
      <div class="gov-section-title">📋 Приказы и делегирование
        <button class="orders-new-btn" onclick="showIssueOrderPanel()"
                title="Выдать новый приказ">+ Новый приказ</button>
      </div>

      ${chars.length === 0
        ? `<div class="orders-empty">Нет персонажей для исполнения приказов.<br>
           Введите команду «сгенерируй советников» для заполнения двора.</div>`
        : ''
      }

      ${active.length > 0 ? `
        <div class="orders-subsection-title">⚙️ Активные приказы</div>
        ${active.map(o => renderOrderCard(o, nation, true)).join('')}
      ` : (chars.length > 0 ? `<div class="orders-empty">Нет активных приказов.</div>` : '')}

      ${completed.length > 0 ? `
        <div class="orders-subsection-title">📜 Недавно завершённые</div>
        ${completed.map(o => renderOrderCard(o, nation, false)).join('')}
      ` : ''}
    </div>

    <!-- Панель выдачи приказа -->
    <div id="issue-order-panel" style="display:none" class="gov-section">
      ${renderIssueOrderForm(nation)}
    </div>
  `;
}

function renderOrderCard(order, nation, isActive) {
  const progressPct = Math.min(100, order.progress ?? 0);
  const progColor   = progressPct >= 80 ? '#4CAF50' : progressPct >= 50 ? '#FF9800' : '#2196F3';

  const qualLabel = order.result_quality == null ? '' :
    order.result_quality >= 80 ? '🏆' :
    order.result_quality >= 60 ? '✅' :
    order.result_quality >= 40 ? '⚠️' : '❌';

  const statusBadge = order.status === 'failed'    ? '<span class="order-badge fail">Провал</span>'
                    : order.status === 'cancelled' ? '<span class="order-badge cancel">Отменён</span>'
                    : order.status === 'completed' ? `<span class="order-badge done">${qualLabel} ${order.result_quality}/100</span>`
                    : '';

  const oversightLabel = typeof OVERSIGHT_LABELS !== 'undefined'
    ? (OVERSIGHT_LABELS[order.ruler_oversight] ?? order.ruler_oversight)
    : order.ruler_oversight;

  return `
    <div class="order-card ${isActive ? 'active' : 'done'}">
      <div class="order-card-header">
        <span class="order-label">${_escHtml(order.label)}</span>
        ${statusBadge}
        ${isActive ? `<button class="order-cancel-btn" onclick="cancelOrder('${order.id}');renderOrdersPanel();renderGovernmentOverlay()">✕</button>` : ''}
      </div>
      <div class="order-meta">
        👤 <b>${_escHtml(order.assigned_char_name)}</b>
        · 🎯 ${_escHtml(order.target_label)}
        · ${_escHtml(oversightLabel)}
      </div>
      ${isActive ? `
        <div class="order-progress-row">
          <div class="order-progress-bar">
            <div class="order-progress-fill" style="width:${progressPct}%;background:${progColor}"></div>
          </div>
          <span class="order-progress-pct">${progressPct}%</span>
        </div>
        <div class="order-expected">Ожидаемое качество: ${order.expected_quality ?? '?'}/100</div>
      ` : `
        ${order.result_text ? `<div class="order-result">${_escHtml(order.result_text)}</div>` : ''}
      `}
    </div>
  `;
}

function renderIssueOrderForm(nation) {
  const chars = (nation.characters ?? []).filter(c => c.alive);
  const nationId = GAME_STATE.player_nation;

  const orderTypeOpts = typeof ORDER_TYPES !== 'undefined'
    ? Object.entries(ORDER_TYPES).map(([k, v]) =>
        `<option value="${k}">${v.label}</option>`
      ).join('')
    : '';

  const charOpts = chars.length > 0
    ? chars.map(c => {
        const skills = typeof getCharSkills === 'function' ? getCharSkills(c) : {};
        const busy = (GAME_STATE.orders ?? []).some(o => o.status === 'active' && o.assigned_char_id === c.id);
        return `<option value="${c.id}" ${busy ? 'disabled' : ''}>
          ${c.name} (${getRoleLabel(c.role)})${busy ? ' [занят]' : ''}
          — лояльность ${c.traits?.loyalty ?? 50}
        </option>`;
      }).join('')
    : '<option disabled>Нет персонажей</option>';

  const foreignNations = Object.entries(GAME_STATE.nations ?? {})
    .filter(([id]) => id !== nationId)
    .slice(0, 30)
    .map(([id, n]) => `<option value="${id}">${n.name}</option>`)
    .join('');

  const regions = (nation.regions ?? []).slice(0, 20)
    .map(rid => {
      const r = GAME_STATE.regions?.[rid];
      return `<option value="${rid}">${r?.name ?? rid}</option>`;
    }).join('');

  return `
    <div class="gov-section-title">📋 Выдать новый приказ
      <button class="orders-new-btn" onclick="hideIssueOrderPanel()">✕ Закрыть</button>
    </div>

    <div class="order-form">
      <div class="order-form-row">
        <label>Тип приказа</label>
        <select id="order-type-sel" onchange="onOrderTypeChange()">
          ${orderTypeOpts}
        </select>
      </div>

      <div class="order-form-row">
        <label>Исполнитель</label>
        <select id="order-char-sel" onchange="onOrderCharChange()">
          ${charOpts}
        </select>
      </div>

      <div class="order-form-row" id="order-target-row">
        <label>Цель (нация/регион)</label>
        <select id="order-target-sel">
          <option value="">— не указана —</option>
          ${foreignNations}
        </select>
      </div>

      <div class="order-form-row" id="order-army-row" style="display:none">
        <label>Армия</label>
        <select id="order-army-sel">
          <option value="">— выберите армию —</option>
        </select>
      </div>

      <div class="order-form-row">
        <label>Надзор правителя</label>
        <select id="order-oversight-sel">
          <option value="personal">👑 Личный надзор (+качество, но занимает правителя)</option>
          <option value="direct" selected>📋 Прямой контроль (стандарт)</option>
          <option value="distant">📮 Дальнее командование (−28% качества)</option>
        </select>
      </div>

      <div class="order-form-row">
        <label>Примечания</label>
        <input type="text" id="order-notes-inp" placeholder="Доп. инструкции (необязательно)" maxlength="100">
      </div>

      <div class="order-quality-preview" id="order-quality-preview">
        Ожидаемое качество: —
      </div>

      <div class="order-form-row">
        <button class="gov-action-btn primary" onclick="submitIssueOrder()">📋 Выдать приказ</button>
      </div>
    </div>
  `;
}

function showIssueOrderPanel() {
  const panel = document.getElementById('issue-order-panel');
  if (panel) {
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth' });
    onOrderTypeChange();
  }
}

function hideIssueOrderPanel() {
  const panel = document.getElementById('issue-order-panel');
  if (panel) panel.style.display = 'none';
}

function onOrderTypeChange() {
  const type = document.getElementById('order-type-sel')?.value;
  const targetRow = document.getElementById('order-target-row');
  if (!targetRow) return;
  const needsForeignTarget = type === 'diplomatic_mission';
  const needsRegionTarget  = ['govern_region', 'economic_project'].includes(type);
  const isMilitary         = type === 'military_campaign';

  // Строка выбора цели-нации/региона
  const targetSel = document.getElementById('order-target-sel');
  if (targetSel) {
    const nationId = GAME_STATE.player_nation;
    const nation   = GAME_STATE.nations[nationId];
    if (needsForeignTarget || isMilitary) {
      const opts = Object.entries(GAME_STATE.nations ?? {})
        .filter(([id]) => id !== nationId).slice(0, 30)
        .map(([id, n]) => `<option value="${id}">${n.name}</option>`).join('');
      targetSel.innerHTML = `<option value="">— не указана —</option>${opts}`;
      targetRow.style.display = '';
    } else if (needsRegionTarget) {
      const opts = (nation?.regions ?? []).slice(0, 20)
        .map(rid => { const r = GAME_STATE.regions?.[rid]; return `<option value="${rid}">${r?.name ?? rid}</option>`; })
        .join('');
      targetSel.innerHTML = `<option value="">— любой регион —</option>${opts}`;
      targetRow.style.display = '';
    } else {
      targetRow.style.display = 'none';
    }
  }

  // Строка выбора армии (только для военного похода)
  const armyRow = document.getElementById('order-army-row');
  if (armyRow) {
    if (isMilitary) {
      const armies = (GAME_STATE.armies ?? [])
        .filter(a => a.nation === GAME_STATE.player_nation && a.state !== 'disbanded');
      const armySel = document.getElementById('order-army-sel');
      if (armySel) {
        armySel.innerHTML = `<option value="">— выберите армию —</option>` +
          armies.map(a => `<option value="${a.id}">${a.name} (${MAP_REGIONS?.[a.position]?.name ?? a.position})</option>`).join('');
      }
      armyRow.style.display = '';
    } else {
      armyRow.style.display = 'none';
    }
  }

  // Персонаж: для военного похода добавляем правителя
  const charSel = document.getElementById('order-char-sel');
  if (charSel && isMilitary) {
    const rulerName = GAME_STATE.nations[GAME_STATE.player_nation]?.government?.ruler?.name ?? 'Правитель';
    if (!charSel.querySelector('option[value="ruler"]')) {
      charSel.insertAdjacentHTML('afterbegin', `<option value="ruler">👑 ${rulerName} (лично)</option>`);
    }
  } else if (charSel) {
    const rulerOpt = charSel.querySelector('option[value="ruler"]');
    if (rulerOpt) rulerOpt.remove();
  }

  updateOrderQualityPreview();
}

function onOrderCharChange() {
  updateOrderQualityPreview();
}

function updateOrderQualityPreview() {
  const preview = document.getElementById('order-quality-preview');
  if (!preview) return;

  const type     = document.getElementById('order-type-sel')?.value;
  const charId   = document.getElementById('order-char-sel')?.value;
  const oversight = document.getElementById('order-oversight-sel')?.value ?? 'direct';

  if (!type || !charId || typeof calcOrderQuality !== 'function') {
    preview.textContent = 'Ожидаемое качество: —';
    return;
  }

  const nation = GAME_STATE.nations[GAME_STATE.player_nation];

  // Правитель лично
  if (charId === 'ruler') {
    const pp = nation?.government?.ruler?.personal_power ?? 60;
    const q  = Math.min(100, Math.round(pp * 1.05));
    const color = q >= 70 ? '#4CAF50' : q >= 45 ? '#FF9800' : '#f44336';
    preview.innerHTML = `Ожидаемое качество: <b style="color:${color}">${q}/100</b> · 👑 Личное командование · Личная власть: ${pp}`;
    return;
  }

  const char   = (nation?.characters ?? []).find(c => c.id === charId);
  if (!char) { preview.textContent = 'Ожидаемое качество: —'; return; }

  const typeDef   = ORDER_TYPES[type];
  const quality   = calcOrderQuality(char, typeDef?.skill ?? 'admin', oversight, nation);
  const roleMatch = typeof getOrderRoleMatch === 'function' ? getOrderRoleMatch(char, type) : '';
  const skills    = typeof getCharSkills === 'function' ? getCharSkills(char) : {};
  const skillVal  = skills[typeDef?.skill] ?? 50;

  const color = quality >= 70 ? '#4CAF50' : quality >= 45 ? '#FF9800' : '#f44336';
  preview.innerHTML = `
    Ожидаемое качество: <b style="color:${color}">${quality}/100</b>
    · ${roleMatch}
    · Навык «${typeDef?.skill ?? 'admin'}»: ${skillVal}/100
    · Лояльность: ${char.traits?.loyalty ?? 50}/100
  `;
}

function submitIssueOrder() {
  const type      = document.getElementById('order-type-sel')?.value;
  const charId    = document.getElementById('order-char-sel')?.value;
  const targetId  = document.getElementById('order-target-sel')?.value || null;
  const armyId    = document.getElementById('order-army-sel')?.value  || null;
  const oversight = document.getElementById('order-oversight-sel')?.value ?? 'direct';
  const notes     = document.getElementById('order-notes-inp')?.value ?? '';

  if (!type || !charId) {
    alert('Выберите тип приказа и исполнителя.');
    return;
  }
  if (type === 'military_campaign' && !armyId) {
    alert('Выберите армию для военного похода.');
    return;
  }

  const needsRegion = ['govern_region', 'economic_project'].includes(type);
  let targetLabel;
  if (needsRegion && targetId) {
    const r = GAME_STATE.regions?.[targetId] ?? MAP_REGIONS?.[targetId];
    targetLabel = r?.name ?? targetId;
  } else {
    const targetNation = targetId ? GAME_STATE.nations[targetId] : null;
    targetLabel = targetNation?.name ?? targetId ?? '—';
  }

  if (typeof issueOrder !== 'function') {
    alert('Движок приказов не загружен.');
    return;
  }

  const result = issueOrder({ type, target_id: targetId, target_label: targetLabel, assigned_char_id: charId, army_id: armyId, oversight, notes });

  if (result) {
    hideIssueOrderPanel();
    renderGovernmentOverlay();
    renderOrdersPanel();
  }
}

// ══════════════════════════════════════════════════════════════════════
// ПАНЕЛЬ ПРИКАЗОВ НА ГЛАВНОМ ЭКРАНЕ
// ══════════════════════════════════════════════════════════════════════

/**
 * Рендерит список приказов в #orders-main-list на главном экране.
 * Вызывается из renderAll() и при изменении приказов.
 */
function renderOrdersPanel() {
  const listEl = document.getElementById('orders-main-list');
  if (!listEl) return;

  const nation    = GAME_STATE.nations?.[GAME_STATE.player_nation];
  const active    = typeof getActiveOrders          === 'function' ? getActiveOrders()           : [];
  const completed = typeof getRecentCompletedOrders === 'function' ? getRecentCompletedOrders(3) : [];

  let html = '';

  if (active.length === 0 && completed.length === 0) {
    html = `<div class="op-empty">Нет активных приказов. Нажмите «+ Новый приказ».</div>`;
  } else {
    if (active.length > 0) {
      html += `<div class="op-subsection">⚙ Активные</div>`;
      html += active.map(o => _renderMpCard(o, true)).join('');
    }
    if (completed.length > 0) {
      html += `<div class="op-subsection">📜 Завершённые</div>`;
      html += completed.map(o => _renderMpCard(o, false)).join('');
    }
  }

  listEl.innerHTML = html;
}

function _renderMpCard(order, isActive) {
  const pct   = Math.min(100, order.progress ?? 0);
  const color = pct >= 80 ? '#4CAF50' : pct >= 50 ? '#FF9800' : '#2196F3';

  const badgeText = order.status === 'failed'    ? '<span style="color:#f44;font-size:9px">Провал</span>'
                  : order.status === 'cancelled' ? '<span style="color:#aaa;font-size:9px">Отменён</span>'
                  : order.status === 'completed' ? `<span style="color:#4CAF50;font-size:9px">${order.result_quality ?? '?'}/100</span>`
                  : '';

  const oversight = typeof OVERSIGHT_LABELS !== 'undefined'
    ? (OVERSIGHT_LABELS[order.ruler_oversight] ?? order.ruler_oversight)
    : order.ruler_oversight;

  return `
    <div class="op-card ${isActive ? 'active' : 'done'}">
      <div class="op-card-top">
        <span class="op-card-label">${_escHtml(order.label)}</span>
        ${badgeText}
        ${isActive ? `<button class="op-card-cancel"
          onclick="cancelOrder('${order.id}');renderOrdersPanel();renderGovernmentOverlay()" title="Отменить">✕</button>` : ''}
      </div>
      <div class="op-card-meta">👤 ${_escHtml(order.assigned_char_name)} · 🎯 ${_escHtml(order.target_label)} · ${_escHtml(oversight)}</div>
      ${isActive ? `
        <div class="op-card-progress">
          <div class="op-card-bar"><div class="op-card-fill" style="width:${pct}%;background:${color}"></div></div>
          <span class="op-card-pct">${pct}%</span>
        </div>` : (order.result_text ? `<div class="op-card-result">${_escHtml(order.result_text)}</div>` : '')}
    </div>`;
}

/** Показать инлайн-форму нового приказа на главном экране */
function showMpOrderForm() {
  const formEl = document.getElementById('mp-order-form');
  if (!formEl) return;

  const nation   = GAME_STATE.nations?.[GAME_STATE.player_nation];
  const nationId = GAME_STATE.player_nation;
  const chars    = (nation?.characters ?? []).filter(c => c.alive !== false);

  const typeOpts = typeof ORDER_TYPES !== 'undefined'
    ? Object.entries(ORDER_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')
    : '';

  const charOpts = chars.length > 0
    ? chars.map(c => {
        const busy = (GAME_STATE.orders ?? []).some(o => o.status === 'active' && o.assigned_char_id === c.id);
        return `<option value="${c.id}" ${busy ? 'disabled' : ''}>${_escHtml(c.name)} (${getRoleLabel(c.role)})${busy ? ' [занят]' : ''}</option>`;
      }).join('')
    : '<option disabled>Нет персонажей</option>';

  const foreignOpts = Object.entries(GAME_STATE.nations ?? {})
    .filter(([id]) => id !== nationId).slice(0, 30)
    .map(([id, n]) => `<option value="${id}">${_escHtml(n.name)}</option>`).join('');

  formEl.innerHTML = `
    <div class="op-form-hdr">
      📋 Новый приказ
      <button class="op-form-close" onclick="hideMpOrderForm()">✕</button>
    </div>
    <div class="op-form-grid">
      <div class="op-form-field">
        <label>Тип приказа</label>
        <select id="mp-order-type" onchange="onMpTypeChange()">${typeOpts}</select>
      </div>
      <div class="op-form-field">
        <label>Исполнитель</label>
        <select id="mp-order-char" onchange="onMpCharChange()">${charOpts}</select>
      </div>
      <div class="op-form-field" id="mp-target-field">
        <label>Цель</label>
        <select id="mp-order-target"><option value="">— не указана —</option>${foreignOpts}</select>
      </div>
      <div class="op-form-field">
        <label>Надзор</label>
        <select id="mp-order-oversight" onchange="updateMpQuality()">
          <option value="personal">👑 Личный надзор</option>
          <option value="direct" selected>📋 Прямой контроль</option>
          <option value="distant">📮 Дальнее командование</option>
        </select>
      </div>
    </div>
    <div class="op-form-bottom">
      <span class="op-form-quality" id="mp-quality-preview">Ожидаемое качество: —</span>
      <button class="op-form-submit" onclick="submitMpOrder()">📋 Выдать приказ</button>
    </div>`;

  formEl.style.display = 'block';
  onMpTypeChange();
}

function hideMpOrderForm() {
  const formEl = document.getElementById('mp-order-form');
  if (formEl) { formEl.style.display = 'none'; formEl.innerHTML = ''; }
}

function onMpTypeChange() {
  const type      = document.getElementById('mp-order-type')?.value;
  const targetFld = document.getElementById('mp-target-field');
  const targetSel = document.getElementById('mp-order-target');
  if (!targetSel || !targetFld) return;

  const nationId = GAME_STATE.player_nation;
  const nation   = GAME_STATE.nations?.[nationId];

  const isMilitary   = type === 'military_campaign';
  const needsForeign = type === 'diplomatic_mission' || isMilitary;
  const needsRegion  = ['govern_region', 'economic_project'].includes(type);

  if (needsForeign) {
    const opts = Object.entries(GAME_STATE.nations ?? {}).filter(([id]) => id !== nationId).slice(0, 30)
      .map(([id, n]) => `<option value="${id}">${_escHtml(n.name)}</option>`).join('');
    targetSel.innerHTML = `<option value="">— не указана —</option>${opts}`;
    targetFld.style.display = '';
  } else if (needsRegion) {
    const opts = (nation?.regions ?? []).slice(0, 20)
      .map(rid => { const r = GAME_STATE.regions?.[rid] ?? MAP_REGIONS?.[rid]; return `<option value="${rid}">${_escHtml(r?.name ?? rid)}</option>`; }).join('');
    targetSel.innerHTML = `<option value="">— любой регион —</option>${opts}`;
    targetFld.style.display = '';
  } else {
    targetFld.style.display = 'none';
  }

  // Выбор армии для военного похода
  let armyFld = document.getElementById('mp-army-field');
  if (isMilitary) {
    if (!armyFld) {
      armyFld = document.createElement('div');
      armyFld.id = 'mp-army-field';
      armyFld.className = 'op-form-row';
      armyFld.innerHTML = `<label>Армия</label>
        <select id="mp-order-army" class="op-form-sel"></select>`;
      targetFld.insertAdjacentElement('afterend', armyFld);
    }
    const armies = (GAME_STATE.armies ?? [])
      .filter(a => a.nation === nationId && a.state !== 'disbanded');
    document.getElementById('mp-order-army').innerHTML =
      `<option value="">— выберите армию —</option>` +
      armies.map(a => `<option value="${a.id}">${_escHtml(a.name)} (${_escHtml(MAP_REGIONS?.[a.position]?.name ?? a.position)})</option>`).join('');
    armyFld.style.display = '';
  } else if (armyFld) {
    armyFld.style.display = 'none';
  }

  // Добавляем/убираем опцию «Правитель лично» в char select
  const charSel = document.getElementById('mp-order-char');
  if (charSel) {
    const existing = charSel.querySelector('option[value="ruler"]');
    if (isMilitary && !existing) {
      const rulerName = nation?.government?.ruler?.name ?? 'Правитель';
      charSel.insertAdjacentHTML('afterbegin', `<option value="ruler">👑 ${_escHtml(rulerName)} (лично)</option>`);
    } else if (!isMilitary && existing) {
      existing.remove();
    }
  }

  updateMpQuality();
}

function onMpCharChange() { updateMpQuality(); }

function updateMpQuality() {
  const preview   = document.getElementById('mp-quality-preview');
  if (!preview) return;
  const type      = document.getElementById('mp-order-type')?.value;
  const charId    = document.getElementById('mp-order-char')?.value;
  const oversight = document.getElementById('mp-order-oversight')?.value ?? 'direct';
  if (!type || !charId) { preview.textContent = 'Ожидаемое качество: —'; return; }

  const nation  = GAME_STATE.nations?.[GAME_STATE.player_nation];

  // Правитель лично
  if (charId === 'ruler') {
    const pp = nation?.government?.ruler?.personal_power ?? 60;
    const q  = Math.min(100, Math.round(pp * 1.05));
    const color = q >= 70 ? '#4CAF50' : q >= 45 ? '#FF9800' : '#f44336';
    preview.innerHTML = `Ожидаемое качество: <b style="color:${color}">${q}/100</b> (личное командование)`;
    return;
  }

  if (typeof calcOrderQuality !== 'function') { preview.textContent = 'Ожидаемое качество: —'; return; }
  const char    = (nation?.characters ?? []).find(c => c.id === charId);
  if (!char) { preview.textContent = 'Ожидаемое качество: —'; return; }
  const typeDef = ORDER_TYPES?.[type];
  const quality = calcOrderQuality(char, typeDef?.skill ?? 'admin', oversight, nation);
  const color   = quality >= 70 ? '#4CAF50' : quality >= 45 ? '#FF9800' : '#f44336';
  preview.innerHTML = `Ожидаемое качество: <b style="color:${color}">${quality}/100</b>`;
}

function submitMpOrder() {
  const type      = document.getElementById('mp-order-type')?.value;
  const charId    = document.getElementById('mp-order-char')?.value;
  const targetId  = document.getElementById('mp-order-target')?.value || null;
  const armyId    = document.getElementById('mp-order-army')?.value  || null;
  const oversight = document.getElementById('mp-order-oversight')?.value ?? 'direct';

  if (!type || !charId) { alert('Выберите тип приказа и исполнителя.'); return; }
  if (type === 'military_campaign' && !armyId) { alert('Выберите армию для похода.'); return; }
  if (typeof issueOrder !== 'function') { alert('Движок приказов не загружен.'); return; }

  const needsRegionTgt = ['govern_region', 'economic_project'].includes(type);
  let targetLabel;
  if (needsRegionTgt && targetId) {
    const r = GAME_STATE.regions?.[targetId] ?? MAP_REGIONS?.[targetId];
    targetLabel = r?.name ?? targetId;
  } else {
    const targetNation = targetId ? GAME_STATE.nations?.[targetId] : null;
    targetLabel = targetNation?.name ?? targetId ?? '—';
  }

  const result = issueOrder({ type, target_id: targetId, target_label: targetLabel, assigned_char_id: charId, army_id: armyId, oversight });
  if (result) {
    hideMpOrderForm();
    renderOrdersPanel();
    renderGovernmentOverlay();
  }
}
