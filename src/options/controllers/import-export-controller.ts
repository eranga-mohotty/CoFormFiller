/**
 * Configuration Import & Export Controller for Options Dashboard
 * Safely constructs DOM status messages without innerHTML
 */

import { $, showToast } from './common.js';
import { importConfiguration, exportConfiguration } from '../../utils/importer.js';
import type { ImportResult, ImportMode } from '../../types/storage.js';

function handleFileRead(file: File): void {
  const reader = new FileReader();
  reader.onload = (e: ProgressEvent<FileReader>) => {
    const text = typeof e.target?.result === 'string' ? e.target.result : '';
    const textarea = $<HTMLTextAreaElement>('importTextarea');
    if (textarea) textarea.value = text;
    $('importPasswordPrompt')?.classList.add('hidden');
    showToast(`File "${file.name}" loaded.`);
  };
  reader.readAsText(file);
}

function renderImportSuccess(statusBox: HTMLElement, res: ImportResult): void {
  statusBox.className = 'status-box success';
  statusBox.replaceChildren();

  const strong = document.createElement('strong');
  strong.textContent = 'Import Successful!';
  statusBox.append(strong, document.createElement('br'));

  const items = [
    `• Format: ${res.formatDetected || 'Unknown'}`,
    `• Profiles Imported: ${res.profilesImported ?? 0}`,
    `• Active Profile: "${res.activeProfileName || ''}"`,
    `• API Key Detected: ${res.apiKeyDetected ? 'Yes' : 'None'}`
  ];

  items.forEach((txt) => {
    statusBox.append(document.createTextNode(txt), document.createElement('br'));
  });
}

async function processImport(passphrase = '', onImportComplete?: () => Promise<void> | void): Promise<void> {
  const text = $<HTMLTextAreaElement>('importTextarea')?.value.trim();
  if (!text) return alert('Please paste JSON or upload a file first.');

  const checkedRadio = document.querySelector<HTMLInputElement>('input[name="importMode"]:checked');
  const mode = (checkedRadio?.value as ImportMode) || 'replace';
  const statusBox = $('importStatusBox');
  if (!statusBox) return;

  statusBox.className = 'status-box';
  statusBox.textContent = 'Processing configuration...';
  statusBox.classList.remove('hidden');

  try {
    const res = await importConfiguration(text, mode, { passphrase });
    if (res.needsPassword) {
      $('importPasswordPrompt')?.classList.remove('hidden');
      $<HTMLInputElement>('importPassphraseInput')?.focus();
      statusBox.className = 'status-box error';
      statusBox.textContent = res.message || 'Password required.';
      return;
    }

    if (res.success) {
      $('importPasswordPrompt')?.classList.add('hidden');
      renderImportSuccess(statusBox, res);
      showToast('Configuration imported successfully!');
      if (onImportComplete) await onImportComplete();
    } else {
      statusBox.className = 'status-box error';
      statusBox.textContent = 'Import failed: ' + (res.message || 'Unknown error');
    }
  } catch (err: unknown) {
    statusBox.className = 'status-box error';
    statusBox.textContent = 'Import error: ' + (err instanceof Error ? err.message : String(err));
  }
}

async function executeExport(): Promise<void> {
  const includeKey = $<HTMLInputElement>('exportIncludeApiKey')?.checked || false;
  const formatRadio = document.querySelector<HTMLInputElement>('input[name="exportFormatMode"]:checked');
  const isEncrypted = formatRadio?.value === 'encrypted';
  let passphrase = '';

  if (isEncrypted) {
    const customPass = $<HTMLInputElement>('exportCustomPassphrase')?.value.trim();
    passphrase = customPass || prompt('Enter a Master PIN or Password to encrypt this backup:') || '';
    if (!passphrase) return showToast('Export cancelled (password required for encrypted backup).', true);
  }

  try {
    const config = await exportConfiguration({ includeApiKey: includeKey, encrypt: isEncrypted, passphrase });
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${isEncrypted ? 'smartform_encrypted_vault' : 'smartform_ai_backup'}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`Export downloaded (${isEncrypted ? 'Encrypted Vault' : 'Plaintext JSON'})!`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast('Export failed: ' + msg, true);
  }
}

export function initImportExportController(onImportComplete?: () => Promise<void> | void): void {
  document.querySelectorAll<HTMLInputElement>('input[name="exportFormatMode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      $('exportCustomPassphraseGroup')?.classList.toggle('hidden', radio.value !== 'encrypted');
    });
  });

  const dropZone = $('dropZone');
  dropZone?.addEventListener('click', () => $<HTMLInputElement>('fileUploadInput')?.click());
  dropZone?.addEventListener('dragover', (e: DragEvent) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone?.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileRead(file);
  });

  const fileInput = $<HTMLInputElement>('fileUploadInput');
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFileRead(file);
  });

  $('btnExecuteImport')?.addEventListener('click', () => { void processImport('', onImportComplete); });
  $('btnDecryptImport')?.addEventListener('click', () => {
    void processImport($<HTMLInputElement>('importPassphraseInput')?.value || '', onImportComplete);
  });
  $('btnExecuteExport')?.addEventListener('click', () => { void executeExport(); });
}
