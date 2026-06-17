import { evaluateExpr } from './evaluator';
import { sortRules } from './rule-utils';
import type { FilterFn, RuleItem, RuleState } from './types';

export function buildVars(session: any, extras: Record<string, unknown> = {}) {
  // 从 session.event.argv 提取斜杠命令名（Discord/Telegram 等平台的 interaction/command）
  // session.content 对斜杠命令为空字符串，但 event.argv.name 包含实际的命令名
  const argv = session.event?.argv
  const argvCommandName = argv?.name ? String(argv.name) : ''

  return {
    platform: String(session.platform ?? ''),
    selfId: String(session.selfId ?? ''),
    userId: String(session.userId ?? ''),
    channelId: String(session.channelId ?? ''),
    guildId: String(session.guildId ?? ''),
    isDirect: session.isDirect,
    content: String(session.content ?? ''),
    type: String(session.type ?? ''),
    event: session.event,
    author: session.author,
    quote: session.quote,
    commandName: argvCommandName,
    ...extras // extras.commandName 会覆盖基础提取值（精确优先）
  };
}

export function evaluatePluginRules(
  pluginKey: string,
  state: RuleState,
  session: any,
  trace?: (stage: string, payload: Record<string, unknown>) => void
): boolean {
  const vars = buildVars(session, { pluginKey });
  for (const rule of sortRules(state.rules)) {
    if (!rule.enabled) continue;
    if (rule.target.type !== 'plugin') continue;

    // 检查插件是否匹配（支持数组）
    let pluginMatched = false;
    if (Array.isArray(rule.target.value)) {
      pluginMatched = rule.target.value.includes(pluginKey);
    } else if (typeof rule.target.value === 'string') {
      pluginMatched = rule.target.value.trim() === pluginKey;
    }

    if (!pluginMatched) continue;

    const matched = evaluateExpr(rule.condition, vars);
    trace?.('native-filter:evaluate', {
      pluginKey,
      ruleId: rule.id,
      ruleName: rule.name,
      action: rule.action,
      matched
    });
    if (!matched) continue;
    return rule.action === 'bypass';
  }
  return true;
}

export function collectActivePluginKeys(rules: RuleItem[]) {
  const activeKeys = new Set<string>();

  // 收集所有启用的插件规则的插件键
  for (const rule of rules) {
    if (!rule.enabled || rule.target.type !== 'plugin' || !rule.target.value) continue;

    if (Array.isArray(rule.target.value)) {
      for (const key of rule.target.value) activeKeys.add(key);
    } else if (typeof rule.target.value === 'string') {
      const trimmed = rule.target.value.trim();
      if (trimmed) activeKeys.add(trimmed);
    }
  }

  return activeKeys;
}

export function restoreInjectedFilters(
  originalFilters: Map<any, FilterFn>,
  injectedFilters: Map<any, FilterFn>
) {
  for (const [hostCtx, wrapped] of injectedFilters.entries()) {
    if (hostCtx?.filter !== wrapped) continue;
    const original = originalFilters.get(hostCtx);
    if (original) hostCtx.filter = original;
  }
  injectedFilters.clear();
}
