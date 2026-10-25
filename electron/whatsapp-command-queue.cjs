'use strict';

function createSerialCommandQueue(run) {
  if (typeof run !== 'function') throw new TypeError('A command handler is required');
  let tail = Promise.resolve();
  return command => {
    const operation = tail.then(() => run(command));
    tail = operation.catch(() => undefined);
    return operation;
  };
}

module.exports = { createSerialCommandQueue };
