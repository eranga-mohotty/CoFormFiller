/**
 * Smart Learning Mode Card UI
 * Safely constructs DOM nodes without innerHTML
 */

let learnPromptEl = null;

function getOrCreateLearnPrompt() {
  if (!learnPromptEl) {
    learnPromptEl = document.createElement('div');
    learnPromptEl.id = 'smartform-learn-prompt';
    document.body.appendChild(learnPromptEl);
  }
  return learnPromptEl;
}

function hideLearnPrompt() {
  if (learnPromptEl) {
    learnPromptEl.className = '';
    const lp = /** @type {any} */ (learnPromptEl);
    if (lp._autoDismissTimer) clearTimeout(lp._autoDismissTimer);
  }
}

function buildHeader(profileName, onDismiss) {
  const header = document.createElement('div');
  header.className = 'smartform-learn-header';

  const title = document.createElement('span');
  title.className = 'smartform-learn-title';
  title.textContent = `💡 Save to ${profileName}?`;
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'smartform-learn-close';
  closeBtn.title = 'Dismiss';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    hideLearnPrompt();
    if (onDismiss) onDismiss();
  });
  header.appendChild(closeBtn);
  return header;
}

function buildContent(key, value) {
  const content = document.createElement('div');
  content.className = 'smartform-learn-content';

  const keySpan = document.createElement('span');
  keySpan.className = 'smartform-learn-key';
  keySpan.textContent = String(key || 'Field');
  content.appendChild(keySpan);

  const sep = document.createTextNode(': ');
  content.appendChild(sep);

  const valSpan = document.createElement('span');
  valSpan.className = 'smartform-learn-val';
  valSpan.textContent = String(value || '');
  content.appendChild(valSpan);

  return content;
}

function buildActions(onSave, onDismiss) {
  const actions = document.createElement('div');
  actions.className = 'smartform-learn-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'smartform-learn-save-btn';
  saveBtn.textContent = 'Save to Profile';
  saveBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    hideLearnPrompt();
    if (onSave) await onSave();
  });
  actions.appendChild(saveBtn);

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'smartform-learn-dismiss-btn';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.addEventListener('click', (e) => {
    e.preventDefault();
    hideLearnPrompt();
    if (onDismiss) onDismiss();
  });
  actions.appendChild(dismissBtn);

  return actions;
}

export function showLearnPrompt(key, value, profileName, onSave, onDismiss) {
  const prompt = getOrCreateLearnPrompt();
  const lp = /** @type {any} */ (prompt);
  if (lp._autoDismissTimer) clearTimeout(lp._autoDismissTimer);

  prompt.replaceChildren(
    buildHeader(profileName || 'Active Profile', onDismiss),
    buildContent(key, value),
    buildActions(onSave, onDismiss)
  );

  prompt.className = 'show';
  lp._autoDismissTimer = setTimeout(() => {
    hideLearnPrompt();
  }, 20000);
}
