/**
 * Fill Logs and AI Inspector Controller for Options Dashboard
 * Safely constructs table rows without innerHTML
 */

import { $, showToast } from './common.js';
import { getFillLogs, clearFillLogs } from '../../services/storage.js';
import type { LogEntry } from '../../types/storage.js';

function createInspectButton(log: LogEntry): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'btn secondary-btn btn-inspect';
  btn.style.padding = '4px 10px';
  btn.style.fontSize = '11.5px';
  btn.textContent = 'Inspect';
  btn.addEventListener('click', () => {
    const promptBox = $<HTMLTextAreaElement>('inspectPromptText');
    const respBox = $<HTMLTextAreaElement>('inspectResponseText');
    if (promptBox) promptBox.value = log.lastPrompt || 'None';
    if (respBox) respBox.value = log.lastResponse || 'None';
    const card = $('aiInspectorCard');
    card?.classList.remove('hidden');
    card?.scrollIntoView({ behavior: 'smooth' });
  });
  return btn;
}

function createLogRow(log: LogEntry): HTMLTableRowElement {
  const tr = document.createElement('tr');

  const tdTime = document.createElement('td');
  tdTime.textContent = new Date(log.timestamp).toLocaleTimeString();

  const tdDomain = document.createElement('td');
  const strong = document.createElement('strong');
  strong.textContent = log.domain || 'Local Form';
  tdDomain.appendChild(strong);

  const tdTotal = document.createElement('td');
  const total = (log.tier1Count || 0) + (log.tier2Count || 0);
  tdTotal.textContent = `${total} fields (${log.tier1Count || 0} fast, ${log.tier2Count || 0} AI)`;

  const tdDuration = document.createElement('td');
  tdDuration.textContent = log.durationMs ? `${log.durationMs}ms` : 'Instant';

  const tdAction = document.createElement('td');
  if (log.lastPrompt) {
    tdAction.appendChild(createInspectButton(log));
  } else {
    tdAction.textContent = '—';
  }

  tr.append(tdTime, tdDomain, tdTotal, tdDuration, tdAction);
  return tr;
}

export async function renderLogsTab(): Promise<void> {
  const logs = await getFillLogs();
  if (!logs || logs.length === 0) {
    $('logsEmptyNotice')?.classList.remove('hidden');
    $('logsTableContainer')?.classList.add('hidden');
    $('aiInspectorCard')?.classList.add('hidden');
    return;
  }

  $('logsEmptyNotice')?.classList.add('hidden');
  $('logsTableContainer')?.classList.remove('hidden');
  const tbody = $('logsTableBody');
  if (tbody) {
    tbody.replaceChildren();
    logs.forEach((log) => tbody.appendChild(createLogRow(log)));
  }
}

export function initLogsController(): void {
  $('btnClearLogs')?.addEventListener('click', async () => {
    if (confirm('Clear all fill history?')) {
      await clearFillLogs();
      await renderLogsTab();
      showToast('Logs cleared.');
    }
  });
}
