const PREFIX = '[batch]';

export function log(message, ...args) {
  console.log(`${PREFIX} ${message}`, ...args);
}

export function warn(message, ...args) {
  console.warn(`${PREFIX} ${message}`, ...args);
}

export function error(message, ...args) {
  console.error(`${PREFIX} ${message}`, ...args);
}
