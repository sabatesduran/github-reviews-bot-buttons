function getEnabledBots() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('enabledBots', ({ enabledBots }) => {
      if (!enabledBots) {
        const defaults = {};
        BOT_CONFIGS.forEach(bot => { defaults[bot.id] = true; });
        resolve(defaults);
        return;
      }
      resolve(enabledBots);
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

function showButtonState(btn, bot, state, message) {
  btn.classList.remove('success', 'error');
  btn.classList.add(state);
  btn.querySelector('span').textContent = message;
  if (state === 'error') {
    setTimeout(() => resetButtonState(btn, bot), 3000);
  }
}

function resetButtonState(btn, bot) {
  btn.classList.remove('success', 'error');
  btn.querySelector('span').textContent = `${bot.name} Review`;
}

function handleBotClick(btn, bot) {
  const textarea = findTextarea();
  if (!textarea) {
    showButtonState(btn, bot, 'error', 'Textarea not found');
    return;
  }

  const commentBtn = findCommentButton();
  if (!commentBtn) {
    showButtonState(btn, bot, 'error', 'Comment button not found');
    return;
  }

  textarea.focus();
  setTextareaValue(textarea, bot.command);

  setTimeout(() => {
    commentBtn.click();
    showButtonState(btn, bot, 'success', 'Review Requested!');
    btn.disabled = true;
    setTimeout(() => {
      resetButtonState(btn, bot);
      btn.disabled = false;
    }, 3000);
  }, 100);
}

function createButton(bot) {
  const btn = document.createElement('button');
  btn.className = 'grb-review-btn';
  btn.setAttribute('data-bot-id', bot.dataId);
  btn.type = 'button';

  const img = document.createElement('img');
  img.src = chrome.runtime.getURL(bot.icon);
  img.alt = bot.name;

  const text = document.createElement('span');
  text.textContent = `${bot.name} Review`;

  btn.appendChild(img);
  btn.appendChild(text);

  btn.addEventListener('click', () => {
    handleBotClick(btn, bot);
  });

  return btn;
}

async function injectButtons() {
  if (!isPrOpenOrDraft()) return;
  if (!getPrInfo()) return;

  const actionBar = findActionBar();
  if (!actionBar) return;

  const enabledBots = await getEnabledBots();

  // Remove buttons for bots that are now disabled
  document.querySelectorAll('.grb-review-btn').forEach(existingBtn => {
    const botDataId = existingBtn.getAttribute('data-bot-id');
    const botConfig = BOT_CONFIGS.find(b => b.dataId === botDataId);
    if (botConfig && !enabledBots[botConfig.id]) {
      existingBtn.remove();
    }
  });

  // Add buttons for enabled bots (reverse so insertBefore keeps correct order)
  const botsToInject = [...BOT_CONFIGS].reverse();
  for (const bot of botsToInject) {
    if (!enabledBots[bot.id]) continue;
    if (document.querySelector(`[data-bot-id="${bot.dataId}"]`)) continue;

    const btn = createButton(bot);
    actionBar.insertBefore(btn, actionBar.firstChild);
  }
}

// Initial injection
injectButtons();

// Re-inject on GitHub SPA navigation (Turbo)
document.addEventListener('turbo:load', () => {
  setTimeout(injectButtons, 500);
});

// Watch for DOM changes (pjax, dynamic content loading)
const observer = new MutationObserver((mutations) => {
  if (!getPrInfo()) return;

  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      setTimeout(injectButtons, 300);
      return;
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// React to settings changes without page refresh
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabledBots) {
    injectButtons();
  }
});
