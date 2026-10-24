'use strict';

function installCloseToTray(window, { isQuitting, onHidden } = {}) {
  if (!window || typeof window.on !== 'function' || typeof isQuitting !== 'function') {
    throw new TypeError('window and isQuitting callback are required');
  }
  const handleClose = event => {
    if (isQuitting()) return;
    event.preventDefault();
    window.hide();
    if (typeof onHidden === 'function') onHidden();
  };
  window.on('close', handleClose);
  return () => window.removeListener('close', handleClose);
}

module.exports = { installCloseToTray };
