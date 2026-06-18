import type { Context } from 'koishi';

import type { PluginTargetOption } from './types';

const kRecord = Symbol.for('koishi.loader.record');

export function collectPluginTargets(ctx: Context): PluginTargetOption[] {
  const result: PluginTargetOption[] = [];
  const dedup = new Set<string>();
  const visited = new Set<any>();

  const walk = (cursor: any) => {
    const record: Record<string, any> | undefined = cursor?.scope?.[kRecord];
    if (!record || visited.has(record)) return;
    visited.add(record);

    for (const [fullKey, fork] of Object.entries(record)) {
      const key = String(fullKey).replace(/^~/, '');
      const [name, ident = ''] = key.split(':', 2);
      // 检查插件是否声明了 filter = false
      const plugin = (fork as any)?.runtime?.plugin;
      if (plugin?.filter === false) continue;
      if (name && name !== 'group' && !dedup.has(key)) {
        dedup.add(key);
        result.push({
          key,
          name,
          ident,
          label: ident ? `${name}:${ident}` : name
        });
      }
      walk((fork as any)?.ctx);
    }
  };

  walk(ctx.root);
  return result.sort((a, b) => a.key.localeCompare(b.key));
}

export function collectPluginForks(ctx: Context): Map<string, any> {
  const result = new Map<string, any>();
  const visited = new Set<any>();

  const walk = (cursor: any) => {
    const record: Record<string, any> | undefined = cursor?.scope?.[kRecord];
    if (!record || visited.has(record)) return;
    visited.add(record);

    for (const [fullKey, fork] of Object.entries(record)) {
      const key = String(fullKey).replace(/^~/, '');
      result.set(key, fork);
      walk((fork as any)?.ctx);
    }
  };

  walk(ctx.root);
  return result;
}

export function createPluginResolver(
  ctx: Context,
  trace?: (stage: string, payload: Record<string, unknown>) => void
) {
  let targets: PluginTargetOption[] = [];
  const byScope = new Map<any, PluginTargetOption>();
  const byKey = new Map<string, PluginTargetOption>();
  const byCommand = new WeakMap<any, PluginTargetOption>();

  const resolveByScope = (scope: any): PluginTargetOption | undefined => {
    if (!scope) return;
    const direct = byScope.get(scope);
    if (direct) return direct;

    // 遍历 scope 父链：子上下文的 scope 可能与 fork.ctx.scope 不同
    let cursor = scope?.parent;
    while (cursor) {
      const found = byScope.get(cursor);
      if (found) return found;
      cursor = cursor.parent;
    }

    const loader = (ctx as any).loader;
    if (loader?.paths) {
      const paths = loader.paths(scope) as string[];
      for (const rawKey of paths || []) {
        const key = String(rawKey).replace(/^~/, '');
        const found = byKey.get(key);
        if (found) return found;
      }
    }
  };

  const rebuild = () => {
    targets = collectPluginTargets(ctx);
    byScope.clear();
    byKey.clear();
    for (const item of targets) {
      byKey.set(item.key, item);
    }
    trace?.('resolver:rebuild:start', {
      targetCount: targets.length,
      sample: targets.slice(0, 10).map((item) => item.key)
    });

    const visited = new Set<any>();
    const walk = (cursor: any) => {
      const record: Record<string, any> | undefined = cursor?.scope?.[kRecord];
      if (!record || visited.has(record)) return;
      visited.add(record);
      for (const [fullKey, fork] of Object.entries(record)) {
        const key = String(fullKey).replace(/^~/, '');
        const target = byKey.get(key);
        if (target && (fork as any)?.ctx?.scope) {
          byScope.set((fork as any).ctx.scope, target);
        }
        walk((fork as any)?.ctx);
      }
    };
    walk(ctx.root);
    trace?.('resolver:rebuild:done', {
      targetCount: targets.length,
      scopeBindings: byScope.size
    });
  };

  const resolveByCommand = (command: any): PluginTargetOption | undefined => {
    const commandName = String(command?.name ?? '');
    const cached = byCommand.get(command);
    if (cached) {
      trace?.('resolver:resolve:cache-hit', {
        command: commandName,
        pluginKey: cached.key
      });
      return cached;
    }
    const resolved = resolveByScope(command?.caller?.scope);
    if (resolved) {
      byCommand.set(command, resolved);
      trace?.('resolver:resolve:resolved', {
        command: commandName,
        pluginKey: resolved.key,
        pluginName: resolved.name
      });
      return resolved;
    }

    // 回溯父命令链：子命令可能注册在不同的上下文中
    let parent = command?.parent;
    while (parent) {
      const parentResolved = resolveByScope(parent?.caller?.scope);
      if (parentResolved) {
        byCommand.set(command, parentResolved);
        trace?.('resolver:resolve:parent', {
          command: commandName,
          parentCommand: String(parent?.name ?? ''),
          pluginKey: parentResolved.key
        });
        return parentResolved;
      }
      parent = parent.parent;
    }

    trace?.('resolver:resolve:miss', {
      command: commandName
    });
    return resolved;
  };

  const bindCommand = (command: any) => {
    const resolved = resolveByScope(command?.caller?.scope);
    if (resolved) {
      byCommand.set(command, resolved);
      trace?.('resolver:bind:ok', {
        command: String(command?.name ?? ''),
        pluginKey: resolved.key,
        pluginName: resolved.name
      });
    } else {
      trace?.('resolver:bind:miss', {
        command: String(command?.name ?? '')
      });
    }
  };

  return {
    rebuild,
    list: () => targets,
    resolveByCommand,
    bindCommand
  };
}
