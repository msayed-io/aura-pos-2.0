/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPrinters: () => ipcRenderer.invoke('printers:get'),
  print: (args) => ipcRenderer.invoke('print:invoice', args),
  savePrinterSettings: (settings) => ipcRenderer.invoke('printer-settings:save', settings),
  loadPrinterSettings: () => ipcRenderer.invoke('printer-settings:load'),
  showNotification: (payload) => ipcRenderer.invoke('notification:show', payload),
  notifyNewOrder: (displayId) => ipcRenderer.invoke('orders:new-notification', displayId),
});
