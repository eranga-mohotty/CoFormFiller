/**
 * Configuration Import & Export Controller for Options Dashboard
 * Safely constructs DOM status messages without innerHTML
 */

import { $, showToast } from './common.js';
import { importConfiguration, exportConfiguration } from '../../utils/importer.js';

function handleFileRead(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = typeof e.target?.result === 'string' ? e.target.result : '';
    $('importTextarea').value = text;
    $('importPasswordPrompt')?.classList.add('hidden');
    showToast(`File "${file.name}" loaded.`);
  };
  reader.readAsText(file);
}

function renderImportSuccess(statusBox, res) {
  statusBox.className = 'status-box success';
  statusBox.replaceChildren();

  const strong = document.createElement('strong');
  strong.textContent = 'Import Successful!';
  statusBox.append(strong, document.createElement('br'));

  const items = [
    `• Format: ${res.formatDetected}`,
    `• Profiles Imported: ${res.profilesImported}`,
    `• Active Profile: "${res.activeProfileName}"`,
    `• API Key Detected: ${res.apiKeyDetected ? 'Yes' : 'None'}`
  ];

  items.forEach((txt) => {
    statusBox.append(document.createTextNode(txt), document.createElement('br'));
  });
}

async function processImport(passphrase = '', onImportComplete) {
  const text = $('importTextarea')?.value.trim();
  if (!text) return alert('Please paste JSON or upload a file first.');

  const mode = (/** @type {HTMLInputElement | null} */ (document.querySelector('input[name="importMode"]:checked')))?.value || 'replace';
  const statusBox = $('importStatusBox');
  statusBox.className = 'status-box';
  statusBox.textContent = 'Processing configuration...';
  statusBox.classList.remove('hidden');

  try {
    const res = await importConfiguration(text, mode, { passphrase });
    if (res.needsPassword) {
      $('importPasswordPrompt')?.classList.remove('hidden');
      $('importPassphraseInput')?.focus();
      statusBox.className = 'status-box error';
      statusBox.textContent = res.message;
      return;
    }

    if (res.success) {
      $('importPasswordPrompt')?.classList.add('hidden');
      renderImportSuccess(statusBox, res);
      showToast('Configuration imported successfully!');
      if (onImportComplete) await onImportComplete();
    } else {
      statusBox.className = 'status-box error';
      statusBox.textContent = 'Import failed: ' + res.message;
    }
  } catch (err) {
    statusBox.className = 'status-box error';
    statusBox.textContent = 'Import error: ' + err.message;
  }
}

async function executeExport() {
  const includeKey = $('exportIncludeApiKey')?.checked || false;
  const isEncrypted = (/** @type {HTMLInputElement | null} */ (document.querySelector('input[name="exportFormatMode"]:checked')))?.value === 'encrypted';
  let passphrase = '';

  if (isEncrypted) {
    passphrase = $('exportCustomPassphrase')?.value.trim() || prompt('Enter a Master PIN or Password to encrypt this backup:');
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
  } catch (err) {
    showToast('Export failed: ' + err.message, true);
  }
}

export function initImportExportController(onImportComplete) {
  document.querySelectorAll('input[name="exportFormatMode"]').forEach((radioEl) => {
    const radio = /** @type {HTMLInputElement} */ (radioEl);
    radio.addEventListener('change', () => {
      $('exportCustomPassphraseGroup')?.classList.toggle('hidden', radio.value !== 'encrypted');
    });
  });

  const dropZone = $('dropZone');
  dropZone?.addEventListener('click', () => $('fileUploadInput')?.click());
  dropZone?.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer?.files?.[0]) handleFileRead(e.dataTransfer.files[0]);
  });

  $('fileUploadInput')?.addEventListener('change', () => {
    if ($('fileUploadInput').files?.[0]) handleFileRead($('fileUploadInput').files[0]);
  });

  $('btnExecuteImport')?.addEventListener('click', () => processImport('', onImportComplete));
  $('btnDecryptImport')?.addEventListener('click', () => processImport($('importPassphraseInput')?.value || '', onImportComplete));
  $('btnExecuteExport')?.addEventListener('click', executeExport);
}
