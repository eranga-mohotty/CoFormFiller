/**
 * Profile Collections Manager: Services Tags, FAQs, and Custom Fields
 * Uses strictly safe DOM construction without innerHTML
 */

export function renderServices(container, services, onUpdate) {
  container.replaceChildren();
  services.forEach((service, index) => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';

    const text = document.createElement('span');
    text.textContent = service;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'tag-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      services.splice(index, 1);
      renderServices(container, services, onUpdate);
      if (onUpdate) onUpdate();
    });

    badge.append(text, removeBtn);
    container.appendChild(badge);
  });
}

function createFaqCard(item, index, faqs, container, onUpdate) {
  const card = document.createElement('div');
  card.className = 'faq-item';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'item-remove-btn';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    faqs.splice(index, 1);
    renderFaqs(container, faqs, onUpdate);
    if (onUpdate) onUpdate();
  });

  const qGroup = document.createElement('div');
  qGroup.className = 'field-group';
  const qLabel = document.createElement('label');
  qLabel.textContent = 'Question';
  const qInput = document.createElement('input');
  qInput.type = 'text';
  qInput.className = 'text-input faq-q-input';
  qInput.value = item.q || '';
  qInput.placeholder = 'e.g. What areas do you service?';
  qInput.addEventListener('input', () => { item.q = qInput.value; if (onUpdate) onUpdate(); });
  qGroup.append(qLabel, qInput);

  const aGroup = document.createElement('div');
  aGroup.className = 'field-group';
  const aLabel = document.createElement('label');
  aLabel.textContent = 'Answer';
  const aInput = document.createElement('textarea');
  aInput.className = 'textarea-input faq-a-input';
  aInput.rows = 2;
  aInput.value = item.a || '';
  aInput.placeholder = 'e.g. We service the greater metropolitan area...';
  aInput.addEventListener('input', () => { item.a = aInput.value; if (onUpdate) onUpdate(); });
  aGroup.append(aLabel, aInput);

  card.append(removeBtn, qGroup, aGroup);
  return card;
}

export function renderFaqs(container, faqs, onUpdate) {
  container.replaceChildren();
  faqs.forEach((item, index) => {
    container.appendChild(createFaqCard(item, index, faqs, container, onUpdate));
  });
}

function createCustomFieldCard(cf, index, customFields, container, onUpdate) {
  const card = document.createElement('div');
  card.className = 'custom-field-item';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'item-remove-btn';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    customFields.splice(index, 1);
    renderCustomFields(container, customFields, onUpdate);
    if (onUpdate) onUpdate();
  });

  const grid = document.createElement('div');
  grid.className = 'grid-2';

  const kGroup = document.createElement('div');
  kGroup.className = 'field-group';
  const kLabel = document.createElement('label');
  kLabel.textContent = 'Attribute / Key Name';
  const kInput = document.createElement('input');
  kInput.type = 'text';
  kInput.className = 'text-input cf-key-input';
  kInput.value = cf.key || '';
  kInput.placeholder = 'e.g. License Number, Established Year';
  kInput.addEventListener('input', () => { cf.key = kInput.value; if (onUpdate) onUpdate(); });
  kGroup.append(kLabel, kInput);

  const vGroup = document.createElement('div');
  vGroup.className = 'field-group';
  const vLabel = document.createElement('label');
  vLabel.textContent = 'Value';
  const vInput = document.createElement('input');
  vInput.type = 'text';
  vInput.className = 'text-input cf-val-input';
  vInput.value = cf.value || '';
  vInput.placeholder = 'e.g. LIC-12345';
  vInput.addEventListener('input', () => { cf.value = vInput.value; if (onUpdate) onUpdate(); });
  vGroup.append(vLabel, vInput);

  grid.append(kGroup, vGroup);
  card.append(removeBtn, grid);
  return card;
}

export function renderCustomFields(container, customFields, onUpdate) {
  container.replaceChildren();
  customFields.forEach((cf, index) => {
    container.appendChild(createCustomFieldCard(cf, index, customFields, container, onUpdate));
  });
}
