/**
 * Background Service Worker for SmartForm AI
 * Coordinates API requests, storage, and runtime messaging.
 */

import {
  MSG,
  handleGetStatus,
  handleLearnField,
  handleSwitchProfile,
  handleTestKey,
  handleRunAiFill,
  handleVaultMessage
} from './message-handlers.js';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('SmartForm AI installed successfully.');
  }
});

async function routeMessage(message, sender) {
  switch (message.type) {
    case MSG.GET_STATUS:
      return handleGetStatus(sender);
    case MSG.LEARN_FIELD:
      return handleLearnField(message);
    case MSG.SWITCH_PROFILE:
      return handleSwitchProfile(message);
    case MSG.TEST_KEY:
      return handleTestKey(message);
    case MSG.RUN_AI_FILL:
      return handleRunAiFill(message);
    case MSG.VAULT_STATUS:
    case MSG.VAULT_UNLOCK:
    case MSG.VAULT_LOCK:
    case MSG.VAULT_SETUP:
    case MSG.VAULT_DISABLE:
    case MSG.VAULT_CHANGE_PASSWORD:
      return handleVaultMessage(message.type, message);
    default:
      return { success: false, error: 'Unknown message type: ' + message.type };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  routeMessage(message, sender)
    .then(sendResponse)
    .catch((err) => {
      console.error('SmartForm AI Service Worker Error:', err);
      sendResponse({ success: false, error: err.message });
    });
  return true;
});
