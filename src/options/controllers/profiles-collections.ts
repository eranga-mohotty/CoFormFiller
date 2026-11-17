/**
 * Profile Collections Manager: Services Tags, FAQs, and Custom Fields
 * Uses strictly safe DOM construction without innerHTML
 */

import type { FaqItem, CustomField } from '../../types/domain.js';

function createInputGroup(label: string, input: HTMLElement): HTMLDivElement {
  const group = document.createElement('div');
  group.className = 'field-group';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  group.append(lbl, input);
  return group;
}

export function renderServices(container: HTMLElement, services: string[], onUpdate?: () => void): void {
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

function createFaqCard(
  item: FaqItem,
  index: number,
  faqs: FaqItem[],
  container: HTMLElement,
  onUpdate?: () => void
): HTMLDivElement {
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

  const qInput = document.createElement('input');
  qInput.type = 'text';
  qInput.className = 'text-input faq-q-input';
  qInput.value = item.q || '';
  qInput.placeholder = 'e.g. What areas do you service?';
  qInput.addEventListener('input', () => { item.q = qInput.value; if (onUpdate) onUpdate(); });

  const aInput = document.createElement('textarea');
  aInput.className = 'textarea-input faq-a-input';
  aInput.rows = 2;
  aInput.value = item.a || '';
  aInput.placeholder = 'e.g. We service the greater metropolitan area...';
  aInput.addEventListener('input', () => { item.a = aInput.value; if (onUpdate) onUpdate(); });

  card.append(removeBtn, createInputGroup('Question', qInput), createInputGroup('Answer', aInput));
  return card;
}

export function renderFaqs(container: HTMLElement, faqs: FaqItem[], onUpdate?: () => void): void {
  container.replaceChildren();
  faqs.forEach((item, index) => {
    container.appendChild(createFaqCard(item, index, faqs, container, onUpdate));
  });
}

function createCustomFieldCard(
  cf: CustomField,
  index: number,
  customFields: CustomField[],
  container: HTMLElement,
  onUpdate?: () => void
): HTMLDivElement {
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

  const kInput = document.createElement('input');
  kInput.type = 'text';
  kInput.className = 'text-input cf-key-input';
  kInput.value = cf.key || '';
  kInput.placeholder = 'e.g. License Number, Established Year';
  kInput.addEventListener('input', () => { cf.key = kInput.value; if (onUpdate) onUpdate(); });

  const vInput = document.createElement('input');
  vInput.type = 'text';
  vInput.className = 'text-input cf-val-input';
  vInput.value = cf.value || '';
  vInput.placeholder = 'e.g. LIC-12345';
  vInput.addEventListener('input', () => { cf.value = vInput.value; if (onUpdate) onUpdate(); });

  grid.append(createInputGroup('Attribute / Key Name', kInput), createInputGroup('Value', vInput));
  card.append(removeBtn, grid);
  return card;
}

export function renderCustomFields(container: HTMLElement, customFields: CustomField[], onUpdate?: () => void): void {
  container.replaceChildren();
  customFields.forEach((cf, index) => {
    container.appendChild(createCustomFieldCard(cf, index, customFields, container, onUpdate));
  });
}
