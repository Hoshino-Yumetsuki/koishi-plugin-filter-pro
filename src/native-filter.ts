import { evaluateAllRules } from "./evaluator";
import type { FilterFn, RuleItem, RuleState } from "./types";

export function buildVars(session: any, extras: Record<string, unknown> = {}) {
  // 从 session.event.argv 提取斜杠命令名（Discord/Telegram 等平台的 interaction/command）
  // session.content 对斜杠命令为空字符串，但 event.argv.name 包含实际的命令名
  const argv = session.event?.argv;
  const argvCommandName = argv?.name ? String(argv.name) : "";

  return {
    platform: String(session.platform ?? ""),
    selfId: String(session.selfId ?? ""),
    userId: String(session.userId ?? ""),
    channelId: String(session.channelId ?? ""),
    guildId: String(session.guildId ?? ""),
    isDirect: session.isDirect,
    content: String(session.content ?? ""),
    type: String(session.type ?? ""),
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
  // 仅评估 plugin 类型规则（global/command 类型由各自的 hook 处理）
  const pluginRules = state.rules.filter((r) => r.target.type === "plugin");
  const { result, rule } = evaluateAllRules(pluginRules, vars, vars);

  trace?.("native-filter:evaluate", {
    pluginKey,
    ruleId: rule?.id,
    ruleName: rule?.name,
    mode: rule?.mode,
    result
  });

  return result === "allow";
}

export function collectActivePluginKeys(rules: RuleItem[]) {
  const activeKeys = new Set<string>();

  // 收集所有启用的插件规则的插件键
  for (const rule of rules) {
    if (!rule.enabled || rule.target.type !== "plugin" || !rule.target.value) continue;

    if (Array.isArray(rule.target.value)) {
      for (const key of rule.target.value) activeKeys.add(key);
    } else if (typeof rule.target.value === "string") {
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
