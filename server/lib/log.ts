export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const level_order: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export type Logger = {
  readonly error: (message: string, extra?: Record<string, unknown>) => void;
  readonly warn: (message: string, extra?: Record<string, unknown>) => void;
  readonly info: (message: string, extra?: Record<string, unknown>) => void;
  readonly debug: (message: string, extra?: Record<string, unknown>) => void;
  readonly access: (method: string, path: string, status: number, duration_ms: number) => void;
};

export const create_logger = (level: LogLevel = 'info'): Logger => {
  const threshold = level_order[level];
  const emit = (target: LogLevel, message: string, extra?: Record<string, unknown>): void => {
    if (level_order[target] > threshold) {
      return;
    }
    const payload = { level: target, message, ...(extra ?? {}) };
    const stream = target === 'error' || target === 'warn' ? process.stderr : process.stdout;
    stream.write(`${JSON.stringify(payload)}\n`);
  };
  return Object.freeze({
    error: (message, extra) => emit('error', message, extra),
    warn: (message, extra) => emit('warn', message, extra),
    info: (message, extra) => emit('info', message, extra),
    debug: (message, extra) => emit('debug', message, extra),
    access: (method, path, status, duration_ms) =>
      emit('info', 'access', { method, path, status, duration_ms }),
  });
};
