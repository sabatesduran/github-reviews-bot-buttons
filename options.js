const botList = document.getElementById('bot-list');
const defaultBotSelect = document.getElementById('default-bot-select');
const customBotList = document.getElementById('custom-bot-list');
const cbName = document.getElementById('cb-name');
const cbCommand = document.getElementById('cb-command');
const cbIconGallery = document.getElementById('cb-icon-gallery');
const cbIconSvg = document.getElementById('cb-icon-svg');
const cbMsg = document.getElementById('cb-msg');
const cbSubmit = document.getElementById('cb-submit');
const cbCancel = document.getElementById('cb-cancel');

let enabledBotsState = {};
let defaultBotIdState = null;
let customBotsState = [];
let editingId = null;
let selectedPresetSvg = null;

function svgToDataUri(svg) {
  if (!svg) return '';
  try {
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg.trim())));
  } catch (e) {
    return '';
  }
}

function formatCustomBot(cb) {
  return {
    id: cb.id,
    name: cb.name,
    command: cb.command,
    icon: cb.icon && cb.icon.startsWith('data:') ? cb.icon : svgToDataUri(cb.iconSvg || cb.icon || ''),
    dataId: cb.dataId || `grb-btn-${cb.id}`,
  };
}

function allBots() {
  return BOT_CONFIGS.concat(customBotsState.map(formatCustomBot));
}

function slugify(name) {
  return (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'bot');
}

function withDefaults(enabledBots) {
  const merged = enabledBots ? { ...enabledBots } : {};
  allBots().forEach((bot) => {
    if (merged[bot.id] === undefined) merged[bot.id] = true;
  });
  return merged;
}

function getEnabledBotConfigs() {
  return allBots().filter((bot) => enabledBotsState[bot.id] !== false);
}

function resolveDefaultBotId(currentDefaultBotId) {
  const enabledBotConfigs = getEnabledBotConfigs();
  if (enabledBotConfigs.length === 0) return null;

  if (currentDefaultBotId && enabledBotConfigs.some((bot) => bot.id === currentDefaultBotId)) {
    return currentDefaultBotId;
  }
  if (enabledBotsState.cursor !== false) return 'cursor';
  return enabledBotConfigs[0].id;
}

function saveSettings() {
  chrome.storage.sync.set({
    enabledBots: enabledBotsState,
    defaultBotId: defaultBotIdState,
    customBots: customBotsState,
  });
}

function renderDefaultBotSelect() {
  const enabledBotConfigs = getEnabledBotConfigs();

  defaultBotSelect.innerHTML = '';

  if (enabledBotConfigs.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No bots enabled';
    defaultBotSelect.appendChild(option);
    defaultBotSelect.disabled = true;
    return;
  }

  defaultBotSelect.disabled = false;

  enabledBotConfigs.forEach((bot) => {
    const option = document.createElement('option');
    option.value = bot.id;
    option.textContent = bot.name;
    defaultBotSelect.appendChild(option);
  });

  defaultBotSelect.value = defaultBotIdState;
}

function makeIconImg(src, name) {
  const img = document.createElement('img');
  img.src = src;
  img.alt = name;
  img.className = 'bot-icon';
  if (src.endsWith('copilot-icon.png')) img.classList.add('bot-icon-copilot');
  return img;
}

function renderBotToggles() {
  botList.innerHTML = '';
  BOT_CONFIGS.forEach((bot) => {
    const row = document.createElement('div');
    row.className = 'bot-toggle';

    const img = makeIconImg(bot.icon, bot.name);

    const name = document.createElement('span');
    name.className = 'bot-name';
    name.textContent = bot.name;

    const cmd = document.createElement('span');
    cmd.className = 'bot-cmd';
    cmd.textContent = bot.command;

    const label = document.createElement('label');
    label.className = 'switch';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = enabledBotsState[bot.id] !== false;

    const slider = document.createElement('span');
    slider.className = 'slider';

    checkbox.addEventListener('change', () => {
      enabledBotsState[bot.id] = checkbox.checked;
      defaultBotIdState = resolveDefaultBotId(defaultBotIdState);
      renderDefaultBotSelect();
      saveSettings();
    });

    label.appendChild(checkbox);
    label.appendChild(slider);
    row.appendChild(img);
    row.appendChild(name);
    row.appendChild(cmd);
    row.appendChild(label);
    botList.appendChild(row);
  });
}

function renderCustomBots() {
  customBotList.innerHTML = '';

  if (customBotsState.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'No custom bots yet. Add one below.';
    customBotList.appendChild(empty);
    return;
  }

  customBotsState.forEach((cb) => {
    const row = document.createElement('div');
    row.className = 'custom-bot-row';

    const formatted = formatCustomBot(cb);
    const img = makeIconImg(formatted.icon, cb.name);

    const name = document.createElement('span');
    name.className = 'bot-name';
    name.textContent = cb.name;

    const cmd = document.createElement('span');
    cmd.className = 'bot-cmd';
    cmd.textContent = cb.command;

    const label = document.createElement('label');
    label.className = 'switch';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = enabledBotsState[cb.id] !== false;

    const slider = document.createElement('span');
    slider.className = 'slider';

    checkbox.addEventListener('change', () => {
      enabledBotsState[cb.id] = checkbox.checked;
      defaultBotIdState = resolveDefaultBotId(defaultBotIdState);
      renderDefaultBotSelect();
      saveSettings();
    });

    label.appendChild(checkbox);
    label.appendChild(slider);

    const actions = document.createElement('div');
    actions.className = 'custom-bot-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'icon-btn';
    editBtn.title = 'Edit';
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', () => startEdit(cb.id));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'icon-btn';
    delBtn.title = 'Delete';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', () => deleteCustomBot(cb.id));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    row.appendChild(img);
    row.appendChild(name);
    row.appendChild(cmd);
    row.appendChild(label);
    row.appendChild(actions);
    customBotList.appendChild(row);
  });
}

function renderIconGallery() {
  cbIconGallery.innerHTML = '';
  PRESET_ICONS.forEach((preset) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = preset.name;

    const img = document.createElement('img');
    img.src = svgToDataUri(preset.svg);
    img.alt = preset.name;
    btn.appendChild(img);

    if (selectedPresetSvg === preset.svg) btn.classList.add('selected');

    btn.addEventListener('click', () => {
      selectedPresetSvg = preset.svg;
      cbIconSvg.value = '';
      renderIconGallery();
    });

    cbIconGallery.appendChild(btn);
  });
}

cbIconSvg.addEventListener('input', () => {
  if (cbIconSvg.value.trim()) {
    selectedPresetSvg = null;
    renderIconGallery();
  }
});

function currentIconSvg() {
  const pasted = cbIconSvg.value.trim();
  if (pasted) return pasted;
  return selectedPresetSvg || '';
}

function isValidSvg(str) {
  return /<svg[\s>]/i.test(str) && /<\/svg>/i.test(str);
}

function resetForm() {
  editingId = null;
  cbName.value = '';
  cbCommand.value = '';
  cbIconSvg.value = '';
  selectedPresetSvg = null;
  cbMsg.textContent = '';
  cbSubmit.textContent = 'Add';
  cbCancel.style.display = 'none';
  renderIconGallery();
}

function startEdit(id) {
  const cb = customBotsState.find((b) => b.id === id);
  if (!cb) return;
  editingId = id;
  cbName.value = cb.name;
  cbCommand.value = cb.command;
  cbIconSvg.value = cb.iconSvg || '';
  selectedPresetSvg = null;
  cbMsg.textContent = '';
  cbSubmit.textContent = 'Update';
  cbCancel.style.display = '';
  renderIconGallery();
  cbName.focus();
}

function deleteCustomBot(id) {
  customBotsState = customBotsState.filter((b) => b.id !== id);
  delete enabledBotsState[id];
  if (defaultBotIdState === id) defaultBotIdState = resolveDefaultBotId(null);
  if (editingId === id) resetForm();
  renderCustomBots();
  renderDefaultBotSelect();
  saveSettings();
}

cbSubmit.addEventListener('click', () => {
  const name = cbName.value.trim();
  const command = cbCommand.value.trim();
  const iconSvg = currentIconSvg();

  if (!name) { cbMsg.textContent = 'Name is required'; return; }
  if (!command) { cbMsg.textContent = 'Comment text is required'; return; }
  if (!iconSvg || !isValidSvg(iconSvg)) {
    cbMsg.textContent = 'Pick a preset icon or paste valid SVG';
    return;
  }

  if (editingId) {
    const cb = customBotsState.find((b) => b.id === editingId);
    if (cb) {
      cb.name = name;
      cb.command = command;
      cb.iconSvg = iconSvg;
    }
  } else {
    const id = `custom-${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
    customBotsState.push({
      id,
      name,
      command,
      iconSvg,
    });
    enabledBotsState[id] = true;
  }

  defaultBotIdState = resolveDefaultBotId(defaultBotIdState);
  renderCustomBots();
  renderDefaultBotSelect();
  saveSettings();
  resetForm();
});

cbCancel.addEventListener('click', resetForm);

defaultBotSelect.addEventListener('change', () => {
  const nextDefault = defaultBotSelect.value || null;
  defaultBotIdState = resolveDefaultBotId(nextDefault);
  renderDefaultBotSelect();
  saveSettings();
});

chrome.storage.sync.get(['enabledBots', 'defaultBotId', 'customBots'], ({ enabledBots, defaultBotId, customBots }) => {
  customBotsState = Array.isArray(customBots) ? customBots : [];
  enabledBotsState = withDefaults(enabledBots);
  defaultBotIdState = resolveDefaultBotId(defaultBotId);

  renderBotToggles();
  renderCustomBots();
  renderDefaultBotSelect();
  renderIconGallery();
  saveSettings();
});