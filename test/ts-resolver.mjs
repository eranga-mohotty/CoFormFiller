export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const isTarget = err && typeof err === 'object' && 'code' in err &&
      (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'ERR_UNSUPPORTED_DIR_IMPORT');
    if (!isTarget) throw err;
    const match = specifier.match(/^([^?#]+)([?#].*)?$/);
    const basePath = match ? match[1] : specifier;
    const suffix = match && match[2] ? match[2] : '';

    if (basePath.endsWith('.ts')) throw err;
    if (basePath.endsWith('.js')) {
      return nextResolve(basePath.slice(0, -3) + '.ts' + suffix, context);
    }
    if (
      basePath.startsWith('./') || basePath.startsWith('../') ||
      basePath.startsWith('/') || basePath.startsWith('file://')
    ) {
      const cleanBase = basePath.replace(/\/+$/, '');
      if (err.code === 'ERR_UNSUPPORTED_DIR_IMPORT') {
        if (basePath.endsWith('/')) {
          return nextResolve(cleanBase + '/index.ts' + suffix, context);
        }
        try {
          return await nextResolve(cleanBase + '/index.ts' + suffix, context);
        } catch {
          return nextResolve(cleanBase + '.ts' + suffix, context);
        }
      }
      try {
        return await nextResolve(cleanBase + '.ts' + suffix, context);
      } catch {
        return nextResolve(cleanBase + '/index.ts' + suffix, context);
      }
    }
    throw err;
  }
}
