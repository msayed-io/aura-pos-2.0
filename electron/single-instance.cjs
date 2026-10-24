'use strict';

function acquireSingleInstance(app, onSecondInstance) {
  if (!app || typeof app.requestSingleInstanceLock !== 'function' || typeof onSecondInstance !== 'function') {
    throw new TypeError('app and onSecondInstance callback are required');
  }
  const acquired = app.requestSingleInstanceLock();
  if (acquired) app.on('second-instance', onSecondInstance);
  return acquired;
}

module.exports = { acquireSingleInstance };
