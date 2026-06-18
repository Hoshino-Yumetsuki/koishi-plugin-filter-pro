import { resolve, join } from 'node:path';
import { mkdir } from 'node:fs/promises';

import type { Context } from 'koishi';

import { evaluateExpr, evaluateAllRules } from './evaluator';
import {
  buildVars,
  collectActivePluginKeys,
  evaluatePluginRules,
  restoreInjectedFilters
} from './native-filter';
import { createPersister, readRules } from './persistence';
import { FilterProProvider } from './provider';
import { cloneRule, matchTarget, normalizeRule, sortRules } from './rule-utils';
import { collectPluginForks, createPluginResolver } from './resolver';
import { createCommandVisibilityManager } from './command-hide';
import type { Config, FilterFn, PluginTargetOption, RuleInput, RuleState } from './types';

export function apply(ctx: Context, config: Config = {}) {
  const baseDir = (ctx as unknown as { baseDir?: string }).baseDir || process.cwd();
  const dataDir = join(baseDir, 'data', 'filterpro');
  const dataFile = join(dataDir, config.filename || 'rules.json');
  const state: RuleState = { rules: [] };
  const persist = createPersister(dataFile);
  const logger = ctx.logger('filter-pro');

  const trace = (stage: string, payload: Record<string, unknown>) => {
    if (!config.debug) return;
    const isJudge = stage.includes(':evaluate') || stage === 'native-filter:evaluate';
    if (isJudge && !payload?.matched) return;
    logger.info('[trace:%s] %s', stage, JSON.stringify(payload));
  };

  const pluginResolver = createPluginResolver(ctx, trace);
  const visibility = createCommandVisibilityManager();
  const originalFilters = new Map<any, FilterFn>();
  const injectedFilters = new Map<any, FilterFn>();

  const initialize = async () => {
    await mkdir(dataDir, { recursive: true });
    const loaded = await readRules(dataFile);
    if (loaded) {
      state.rules = loaded.map(normalizeRule);
      return;
    }
    state.rules = [];
    await persist(state.rules);
  };

  const ready = initialize().catch((error) => {
    ctx.logger('filter-pro').warn('failed to initialize persistent rules: %s', String(error));
    state.rules = [];
  });

  const refreshPluginTargets = async () => {
    await ready;
    pluginResolver.rebuild();
    const commands = (ctx as any)?.$commander?._commandList;
    if (Array.isArray(commands)) {
      trace('resolver:bind-existing:start', {
        commandCount: commands.length
      });
      for (const command of commands) {
        pluginResolver.bindCommand(command);
      }
      trace('resolver:bind-existing:done', {
        commandCount: commands.length
      });
    } else {
      trace('resolver:bind-existing:skip', {
        reason: '$commander not available'
      });
    }
  };

  const applyNativeFilterInjection = async () => {
    await refreshPluginTargets();

    // unwrap previously injected wrappers first
    restoreInjectedFilters(originalFilters, injectedFilters);

    const forks = collectPluginForks(ctx);
    const activeKeys = collectActivePluginKeys(state.rules);

    trace('native-filter:sync:start', {
      activeTargetCount: activeKeys.size,
      discoveredForks: forks.size
    });

    for (const [pluginKey, fork] of forks.entries()) {
      const hostCtx = (fork as any)?.parent;
      if (!hostCtx || typeof hostCtx.filter !== 'function') continue;

      if (!originalFilters.has(hostCtx)) {
        originalFilters.set(hostCtx, hostCtx.filter);
      } else {
        // runtime reload may rewrite base filter; keep latest base
        originalFilters.set(hostCtx, hostCtx.filter);
      }
      const original = originalFilters.get(hostCtx);

      if (!activeKeys.has(pluginKey)) {
        hostCtx.filter = original;
        continue;
      }

      const wrapped: FilterFn = (session: any) => {
        if (!original || !original(session)) return false;
        return evaluatePluginRules(pluginKey, state, session, trace);
      };
      hostCtx.filter = wrapped;
      injectedFilters.set(hostCtx, wrapped);
    }

    trace('native-filter:sync:done', {
      activeTargetCount: activeKeys.size
    });

    // 同步命令 visibility 标记：根据当前规则更新 hidden Computed 和 slash 标志
    const allCommands = (ctx as any)?.$commander?._commandList;
    if (Array.isArray(allCommands)) {
      visibility.apply(allCommands, state);
    }
  };

  void refreshPluginTargets();
  void applyNativeFilterInjection();
  ctx.on('ready', applyNativeFilterInjection);
  ctx.on('internal/fork', applyNativeFilterInjection);
  ctx.on('internal/before-update', applyNativeFilterInjection);
  ctx.on('internal/update', applyNativeFilterInjection);
  ctx.on('internal/runtime', applyNativeFilterInjection);
  ctx.on('dispose', () => {
    restoreInjectedFilters(originalFilters, injectedFilters);
    const allCommands = (ctx as any)?.$commander?._commandList;
    if (Array.isArray(allCommands)) {
      visibility.restore(allCommands);
    }
  });

  // 共享的语言设置逻辑：在 vars 中匹配规则并设置 session.locales
  const applyLocale = (session: any, vars: Record<string, unknown>): boolean => {
    for (const rule of sortRules(state.rules)) {
      if (!rule.enabled || !rule.locale) continue;
      if (!matchTarget(rule.target, vars)) continue;
      const matched = evaluateExpr(rule.condition, vars);
      trace('locale:evaluate', {
        ruleId: rule.id,
        ruleName: rule.name,
        locale: rule.locale,
        matched
      });
      if (!matched) continue;

      // 将用户语言放在最前，filter-pro locale 紧随其后
      // session.locales 在 i18n() 中优先级最高，且 fallback() 会去重
      // 最终优先级：user > filter-pro locale > channel > guild > global
      const userLocales = (session as any).user?.locales || [];
      (session as any).locales = [...userLocales, rule.locale];
      trace('locale:applied', {
        ruleId: rule.id,
        locale: rule.locale,
        resultLocales: (session as any).locales
      });
      return true;
    }
    return false;
  };

  // 语言过滤器：在 attach 阶段注入 locale（消息级触发，对文本消息有效）
  // 注意：此 handler 对 Discord/Telegram 斜杠命令不触发（interaction/command 不走 middleware 管道）
  ctx.on('attach', async (session) => {
    await ready;
    const vars: Record<string, unknown> = buildVars(session);
    applyLocale(session, vars);
  });

  // 交互命令处理器：在 Discord/Telegram 斜杠命令到达 command/execute 之前注入 locale
  // 这是 attach 事件的补充——对 interaction/command 类型的事件，attach 不会触发
  ctx.on('interaction/command', async (session) => {
    await ready;
    const vars: Record<string, unknown> = buildVars(session);
    applyLocale(session, vars);
    trace('interaction:incoming', {
      commandName: vars.commandName,
      platform: vars.platform,
      type: vars.type,
      content: vars.content,
      isDirect: vars.isDirect
    });
  });

  ctx.on('command-added', (command) => {
    pluginResolver.bindCommand(command);
    // 对新命令应用 visibility 标记（hidden Computed + slash 标志）
    // hidden Computed 延迟评估，所以即使 state.rules 尚未加载也可以安全设置
    visibility.apply([command], state);
    trace('command:added', {
      command: String((command as any)?.name ?? '')
    });
  });

  ctx.middleware(async (session, next) => {
    await ready;
    const vars: Record<string, unknown> = buildVars(session);

    trace('message:incoming', {
      platform: vars.platform,
      userId: vars.userId,
      channelId: vars.channelId,
      guildId: vars.guildId,
      isDirect: vars.isDirect,
      content: vars.content,
      ruleCount: state.rules.length
    });

    const { result, rule } = evaluateAllRules(
      state.rules.filter((r) => r.target.type === 'global'),
      vars,
      vars
    );

    if (result === 'allow') {
      trace('message:pass', { reason: 'rule-allowed-or-no-match' });
      return next();
    }

    // Block
    trace('message:action', {
      ruleId: rule?.id,
      action: 'block',
      response: rule?.response || ''
    });

    if (rule?.response) {
      return rule.response;
    }
    return '';
  }, true);

  // 指令级拦截：同时处理 command 和 global 类型规则（覆盖 Discord/Telegram 斜杠命令场景）
  // whitelist 模式需要 pluginKey（从 command 解析插件），传入 targetVars
  ctx.before('command/execute', async (argv) => {
    await ready;
    const plugin = pluginResolver.resolveByCommand(argv.command ?? undefined);
    const commandName = String(argv.command?.name ?? '');
    const vars: Record<string, unknown> = buildVars(argv.session, {
      commandName,
      pluginKey: plugin?.key,
      pluginName: plugin?.name
    });

    const isInteraction = String(vars.type) === 'interaction/command';

    trace('command:incoming', {
      command: vars.commandName,
      pluginKey: vars.pluginKey,
      pluginName: vars.pluginName,
      isDirect: vars.isDirect,
      guildId: vars.guildId,
      content: vars.content,
      type: vars.type,
      isInteraction,
      ruleCount: state.rules.length
    });

    applyLocale(argv.session, vars);

    const { result, rule } = evaluateAllRules(state.rules, vars, vars);

    if (result === 'allow') {
      trace('command:pass', { reason: 'rule-allowed-or-no-match' });
      return;
    }

    trace('command:action', {
      ruleId: rule?.id,
      targetType: rule?.target?.type,
      action: 'block',
      response: rule?.response || ''
    });

    if (rule?.response) {
      await argv.session?.send(rule.response);
    }
    return '';
  });

  ctx.inject(['console'], (ctx) => {
    ctx.console.addEntry({
      dev: resolve(__dirname, '../client/index.ts'),
      prod: resolve(__dirname, '../dist')
    });

    const provider = new FilterProProvider(ctx, state);
    const authority = 3;
    const addListener = (ctx.console.addListener as any).bind(ctx.console);

    const refresh = async () => {
      await persist(state.rules);
      await applyNativeFilterInjection();
      void provider.refresh();
    };

    addListener(
      'filter-pro/list',
      async () => {
        await ready;
        return provider.get();
      },
      { authority }
    );

    addListener(
      'filter-pro/targets',
      async () => {
        await refreshPluginTargets();
        return pluginResolver.list();
      },
      { authority }
    );

    // 获取指令列表
    addListener(
      'filter-pro/commands',
      async () => {
        const commands = (ctx as any)?.$commander?._commandList || [];
        return commands.map((cmd: any) => ({
          name: String(cmd.name ?? ''),
          label: String(cmd.name ?? '')
        }));
      },
      { authority }
    );

    addListener(
      'filter-pro/create',
      async (input: RuleInput) => {
        await ready;
        const rule = normalizeRule(input || {});
        state.rules.push(rule);
        await refresh();
        return cloneRule(rule);
      },
      { authority }
    );

    addListener(
      'filter-pro/update',
      async (input: RuleInput) => {
        await ready;
        if (!input?.id) return null;
        const index = state.rules.findIndex((item) => item.id === input.id);
        if (index < 0) return null;
        const prev = state.rules[index];
        state.rules[index] = normalizeRule({ ...prev, ...input, id: prev.id });
        await refresh();
        return cloneRule(state.rules[index]);
      },
      { authority }
    );

    addListener(
      'filter-pro/delete',
      async (id: string) => {
        await ready;
        const index = state.rules.findIndex((item) => item.id === id);
        if (index < 0) return false;
        state.rules.splice(index, 1);
        await refresh();
        return true;
      },
      { authority }
    );

    addListener(
      'filter-pro/reorder',
      async (ids: string[]) => {
        await ready;
        if (!Array.isArray(ids)) return provider.get();
        const rank = new Map(ids.map((id, index) => [id, index]));
        state.rules.sort((a, b) => {
          const ai = rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER;
          const bi = rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER;
          return (ai as number) - (bi as number);
        });
        for (let i = 0; i < state.rules.length; i++) state.rules[i].priority = i;
        await refresh();
        return provider.get();
      },
      { authority }
    );

    addListener(
      'filter-pro/toggle',
      async (payload: { id: string; enabled: boolean }) => {
        await ready;
        if (!payload?.id) return null;
        const item = state.rules.find((rule) => rule.id === payload.id);
        if (!item) return null;
        item.enabled = !!payload.enabled;
        await refresh();
        return cloneRule(item);
      },
      { authority }
    );
  });
}

export type { PluginTargetOption };
