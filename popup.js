// Bot toggle management — generated from BOT_CONFIGS (bots.js)
const botList = document.getElementById('bot-list');

chrome.storage.sync.get('enabledBots', ({ enabledBots }) => {
  BOT_CONFIGS.forEach(bot => {
    const row = document.createElement('div');
    row.className = 'bot-toggle';

    const img = document.createElement('img');
    img.src = bot.icon;
    img.alt = bot.name;
    img.className = 'bot-icon';

    const name = document.createElement('span');
    name.className = 'bot-name';
    name.textContent = bot.name;

    const label = document.createElement('label');
    label.className = 'switch';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = enabledBots ? (enabledBots[bot.id] !== false) : true;

    const slider = document.createElement('span');
    slider.className = 'slider';

    label.appendChild(checkbox);
    label.appendChild(slider);
    row.appendChild(img);
    row.appendChild(name);
    row.appendChild(label);
    botList.appendChild(row);

    checkbox.addEventListener('change', () => {
      chrome.storage.sync.get('enabledBots', ({ enabledBots }) => {
        const updated = enabledBots || {};
        BOT_CONFIGS.forEach(b => {
          if (updated[b.id] === undefined) updated[b.id] = true;
        });
        updated[bot.id] = checkbox.checked;
        chrome.storage.sync.set({ enabledBots: updated });
      });
    });
  });
});
