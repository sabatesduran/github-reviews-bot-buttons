let menuListenersReady = false;
let injectTimer = null;
let isInjecting = false;
let customBotsCache = [];

const GRB_SELECTOR = '.grb-review-group, .grb-review-btn, .grb-menu-toggle, .grb-review-menu, .grb-review-menu-item';

function svgToDataUri(svg) {
  if (!svg) return '';
  try {
    return 'data:image/svg+xml;base64,' + window.btoa(unescape(encodeURIComponent(svg.trim())));
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
  return BOT_CONFIGS.concat(customBotsCache.map(formatCustomBot));
}

function withDefaultEnabledBots(enabledBots) {
  const merged = enabledBots ? { ...enabledBots } : {};
  allBots().forEach((bot) => {
    if (merged[bot.id] === undefined) merged[bot.id] = true;
  });
  return merged;
}

function resolveDefaultBotId(enabledBots, currentDefaultBotId) {
  const enabledBotConfigs = allBots().filter((bot) => enabledBots[bot.id] !== false);
  if (enabledBotConfigs.length === 0) return null;

  if (
    currentDefaultBotId
    && enabledBotConfigs.some((bot) => bot.id === currentDefaultBotId)
  ) {
    return currentDefaultBotId;
  }

  if (enabledBots.cursor !== false) return 'cursor';

  return enabledBotConfigs[0].id;
}

function getBotSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['enabledBots', 'defaultBotId', 'customBots'], ({ enabledBots, defaultBotId, customBots }) => {
      customBotsCache = Array.isArray(customBots) ? customBots : [];
      const mergedEnabledBots = withDefaultEnabledBots(enabledBots);
      const resolvedDefaultBotId = resolveDefaultBotId(mergedEnabledBots, defaultBotId);
      if (!enabledBots || defaultBotId !== resolvedDefaultBotId) {
        chrome.storage.sync.set({
          enabledBots: mergedEnabledBots,
          defaultBotId: resolvedDefaultBotId,
        });
      }

      resolve({ enabledBots: mergedEnabledBots, defaultBotId: resolvedDefaultBotId });
    });
  });
}

function getPrInfo() {
  const match = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  return match ? { owner: match[1], repo: match[2], number: match[3] } : null;
}

function isPrOpenOrDraft() {
  const closeBtn = document.querySelector('button[name="comment_and_close"]');
  if (closeBtn) return true;

  const closeBtnAlt = document.querySelector('.js-comment-and-button[value="close"]');
  if (closeBtnAlt) return true;

  const forms = document.querySelectorAll('form.js-comment-and-button');
  for (const form of forms) {
    if (form.querySelector('button[value="close"]')) return true;
  }

  return false;
}

function findActionBar() {
  const commentBtn = document.querySelector('.FormControl-select-wrap + .d-flex > .btn-primary, form.js-new-comment-form .flex-items-center .btn-primary');
  if (commentBtn) {
    return commentBtn.closest('.flex-items-center, .d-flex');
  }

  const actionBars = document.querySelectorAll('.flex-items-center');
  for (const bar of actionBars) {
    const hasClose = bar.querySelector('button[name="comment_and_close"], [value="close"]');
    const hasComment = bar.querySelector('.btn-primary');
    if (hasClose && hasComment) return bar;
  }

  const newCommentForm = document.querySelector('.js-new-comment-form');
  if (newCommentForm) {
    const flexBars = newCommentForm.querySelectorAll('.d-flex.flex-items-center, .d-flex.justify-content-end');
    for (const bar of flexBars) {
      if (bar.querySelector('.btn-primary') || bar.querySelector('button[type="submit"]')) {
        return bar;
      }
    }
  }

  return null;
}

function findTextarea() {
  return document.querySelector('.js-new-comment-form textarea#new_comment_field')
    || document.querySelector('.js-new-comment-form textarea[name="comment[body]"]')
    || document.querySelector('textarea#new_comment_field');
}

function findCommentButton() {
  const form = document.querySelector('.js-new-comment-form');
  if (form) {
    const buttons = form.querySelectorAll('button.btn-primary[type="submit"]');
    for (const btn of buttons) {
      if (btn.textContent.trim() === 'Comment') return btn;
    }
    return form.querySelector('button.btn-primary[type="submit"]');
  }
  return null;
}

function setTextareaValue(textarea, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  ).set;
  nativeSetter.call(textarea, value);

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

function setButtonText(btn, label) {
  const textNode = btn.querySelector('span');
  if (textNode) textNode.textContent = label;
}

function showButtonState(btn, state, message) {
  btn.classList.remove('success', 'error');
  btn.classList.add(state);
  setButtonText(btn, message);
}

function resetButtonState(btn, label) {
  btn.classList.remove('success', 'error');
  setButtonText(btn, label);
}

function handleBotClick(btn, bot, idleLabel) {
  const resetLabel = idleLabel || `${bot.name} Review`;
  const textarea = findTextarea();
  if (!textarea) {
    showButtonState(btn, 'error', 'Textarea not found');
    setTimeout(() => resetButtonState(btn, resetLabel), 3000);
    return;
  }

  const commentBtn = findCommentButton();
  if (!commentBtn) {
    showButtonState(btn, 'error', 'Comment button not found');
    setTimeout(() => resetButtonState(btn, resetLabel), 3000);
    return;
  }

  textarea.focus();
  setTextareaValue(textarea, bot.command);

  setTimeout(() => {
    commentBtn.click();
    showButtonState(btn, 'success', 'Review Requested!');
    btn.disabled = true;
    setTimeout(() => {
      resetButtonState(btn, resetLabel);
      btn.disabled = false;
    }, 3000);
  }, 100);
}

function createButton(bot, label) {
  const buttonLabel = label || `${bot.name} Review`;
  const btn = document.createElement('button');
  btn.className = 'grb-review-btn';
  btn.setAttribute('data-bot-id', bot.dataId);
  btn.type = 'button';

  const img = document.createElement('img');
  img.src = bot.icon.startsWith('data:') ? bot.icon : chrome.runtime.getURL(bot.icon);
  img.alt = bot.name;
  if (bot.id === 'copilot') img.classList.add('grb-icon-copilot');
  if (bot.id === 'coderabbit') img.classList.add('grb-icon-coderabbit');

  const text = document.createElement('span');
  text.textContent = buttonLabel;

  btn.appendChild(img);
  btn.appendChild(text);

  btn.addEventListener('click', () => {
    handleBotClick(btn, bot, buttonLabel);
  });

  return btn;
}

function closeAllMenus() {
  document.querySelectorAll('.grb-review-menu.open').forEach((menu) => {
    menu.classList.remove('open');
  });
}

function ensureMenuListeners() {
  if (menuListenersReady) return;
  menuListenersReady = true;

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.grb-review-group')) closeAllMenus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAllMenus();
  });
}

function createSplitControl(defaultBot, enabledBotConfigs) {
  ensureMenuListeners();

  const mainLabel = `${defaultBot.name} Review`;
  const group = document.createElement('div');
  group.className = 'grb-review-group';
  group.setAttribute('data-default-bot-id', defaultBot.id);
  group.setAttribute('data-enabled-bot-ids', enabledBotConfigs.map((bot) => bot.id).join(','));

  const mainButton = createButton(defaultBot, mainLabel);
  mainButton.classList.add('grb-main-btn');

  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.className = 'grb-menu-toggle';
  toggleButton.setAttribute('aria-label', 'Choose review bot');
  toggleButton.innerHTML = '<svg aria-hidden="true" focusable="false" class="octicon octicon-triangle-down" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" display="inline-block" overflow="visible" style="vertical-align: text-bottom;"><path d="m4.427 7.427 3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z"></path></svg>';

  const menu = document.createElement('div');
  menu.className = 'grb-review-menu';

  enabledBotConfigs
    .filter((bot) => bot.id !== defaultBot.id)
    .forEach((bot) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'grb-review-menu-item';

      const img = document.createElement('img');
      img.src = bot.icon.startsWith('data:') ? bot.icon : chrome.runtime.getURL(bot.icon);
      img.alt = bot.name;
      if (bot.id === 'copilot') img.classList.add('grb-icon-copilot');
      if (bot.id === 'coderabbit') img.classList.add('grb-icon-coderabbit');

      const text = document.createElement('span');
      text.textContent = `${bot.name} Review`;

      item.appendChild(img);
      item.appendChild(text);

      item.addEventListener('click', () => {
        closeAllMenus();
        handleBotClick(mainButton, bot, mainLabel);
      });

      menu.appendChild(item);
    });

  toggleButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const shouldOpen = !menu.classList.contains('open');
    closeAllMenus();
    if (shouldOpen) menu.classList.add('open');
  });

  group.appendChild(mainButton);
  group.appendChild(toggleButton);
  group.appendChild(menu);

  return group;
}

function clearInjectedControls() {
  document.querySelectorAll('.grb-review-btn, .grb-review-group').forEach((node) => {
    node.remove();
  });
}

function clearInjectedControlsInActionBar(actionBar) {
  if (!actionBar) return;
  actionBar.querySelectorAll('.grb-review-btn, .grb-review-group').forEach((node) => {
    node.remove();
  });
}

function isExtensionMutationNode(node) {
  if (!(node instanceof Element)) return false;
  if (node.matches(GRB_SELECTOR)) return true;
  if (node.closest('.grb-review-group')) return true;
  return !!node.querySelector(GRB_SELECTOR);
}

function shouldReactToMutation(mutation) {
  if (mutation.addedNodes.length === 0) return false;

  for (const node of mutation.addedNodes) {
    if (!isExtensionMutationNode(node)) return true;
  }

  return false;
}

function scheduleInject(delay = 120) {
  if (injectTimer) clearTimeout(injectTimer);
  injectTimer = setTimeout(() => {
    injectTimer = null;
    injectButtons();
  }, delay);
}

async function injectButtons() {
  if (isInjecting) return;
  isInjecting = true;

  try {
  if (!getPrInfo() || !isPrOpenOrDraft()) {
    clearInjectedControls();
    return;
  }

  const actionBar = findActionBar();
  if (!actionBar) return;

  const { enabledBots, defaultBotId } = await getBotSettings();
  const enabledBotConfigs = allBots().filter((bot) => enabledBots[bot.id] !== false);
  clearInjectedControlsInActionBar(actionBar);
  if (enabledBotConfigs.length === 0) return;

  if (enabledBotConfigs.length === 1) {
    const singleButton = createButton(enabledBotConfigs[0]);
    actionBar.insertBefore(singleButton, actionBar.firstChild);
    return;
  }

  const defaultBot = enabledBotConfigs.find((bot) => bot.id === defaultBotId) || enabledBotConfigs[0];
  const splitControl = createSplitControl(defaultBot, enabledBotConfigs);
  actionBar.insertBefore(splitControl, actionBar.firstChild);
  } finally {
    isInjecting = false;
  }
}

injectButtons();

document.addEventListener('turbo:load', () => {
  scheduleInject(500);
});

const observer = new MutationObserver((mutations) => {
  if (!getPrInfo()) return;

  for (const mutation of mutations) {
    if (shouldReactToMutation(mutation)) {
      scheduleInject(250);
      return;
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.enabledBots || changes.defaultBotId || changes.customBots) {
    scheduleInject(0);
  }
});
