/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPrinters: () => ipcRenderer.invoke('printers:get'),
  print: (args) => ipcRenderer.invoke('print:invoice', args),
  savePrinterSettings: (settings) => ipcRenderer.invoke('printer-settings:save', settings),
  loadPrinterSettings: () => ipcRenderer.invoke('printer-settings:load'),
  showNotification: (payload) => ipcRenderer.invoke('notification:show', payload),
  notifyNewOrder: (displayId) => ipcRenderer.invoke('orders:new-notification', displayId),
  getWhatsAppStatus: () => ipcRenderer.invoke('whatsapp:status:get'),
  connectWhatsApp: () => ipcRenderer.invoke('whatsapp:connect'),
  pairWhatsApp: (phoneNumber) => ipcRenderer.invoke('whatsapp:pairing', phoneNumber),
  disconnectWhatsApp: () => ipcRenderer.invoke('whatsapp:disconnect'),
  getGeminiKeyStatus: () => ipcRenderer.invoke('gemini-key:status'),
  saveGeminiApiKey: (apiKey) => ipcRenderer.invoke('gemini-key:save', apiKey),
  clearGeminiApiKey: () => ipcRenderer.invoke('gemini-key:clear'),
  testGeminiApiKey: (apiKey) => apiKey === undefined
    ? ipcRenderer.invoke('gemini-key:test')
    : ipcRenderer.invoke('gemini-key:test', apiKey),
  onWhatsAppStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('whatsapp:status', listener);
    return () => ipcRenderer.removeListener('whatsapp:status', listener);
  },
  onWhatsAppQr: (callback) => {
    const listener = (_event, qr) => callback(qr);
    ipcRenderer.on('whatsapp:qr', listener);
    return () => ipcRenderer.removeListener('whatsapp:qr', listener);
  },
  onWhatsAppPairingCode: (callback) => {
    const listener = (_event, code) => callback(code);
    ipcRenderer.on('whatsapp:pairing-code', listener);
    return () => ipcRenderer.removeListener('whatsapp:pairing-code', listener);
  },
});
