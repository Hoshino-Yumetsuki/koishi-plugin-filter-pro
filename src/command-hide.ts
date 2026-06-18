import { buildVars } from './native-filter';
import { evaluateAllRules } from './evaluator';
import { sortRules } from './rule-utils';
import type { RuleState } from './types';

/**
 * 创建一个 Computed\<boolean\> 用于 command.config.hidden，
 * 在 help 渲染时动态评估 filter-pro 规则。
 *
 * 使用统一的 evaluateAllRules，遵循"先匹配先赢"的优先级语义。
 * 仅评估 command 类型的规则（plugin 规则由 command.match() 处理）。
 */
function createHiddenComputed(
  commandName: string,
  state: RuleState
): (session: any) => boolean {
  return (session: any) => {
    const vars = buildVars(session, { commandName });
    const cmdRules = state.rules.filter(r => r.target.type === 'command');
    const { result } = evaluateAllRules(cmdRules, vars, vars);
    return result === 'block';
  };
}

/**
 * 检查命令是否应从原生平台注册中排除（斜杠命令）。
 *
 * 平台注册是全局的启动时操作，不评估条件（无会话上下文）。
 * 仅按目标名称匹配，遵循"先匹配先赢"的优先级语义。
 *
 * 白名单模式：whitelist + block = 仅匹配目标可见，不匹配 → 隐藏。
 * bypass 规则（无会话条件时）可以覆盖 platform 隐藏。
 *
 * 注意：修改 slash 仅在下次 bot 重启时生效。
 */
function shouldHideFromPlatform(commandName: string, state: RuleState): boolean {
  for (const rule of sortRules(state.rules)) {
    if (!rule.enabled) continue;
    if (rule.target.type !== 'command') continue;

    const targetMatches = Array.isArray(rule.target.value)
      ? rule.target.value.includes(commandName)
      : typeof rule.target.value === 'string'
        ? rule.target.value.trim() === commandName
        : false;

    if (rule.mode === 'whitelist') {
      if (rule.action === 'bypass') {
        if (targetMatches) return false;
        continue;
      }
      if (!targetMatches) return true;
      return false;
    }

    // 黑名单模式
    if (!targetMatches) continue;
    return rule.action === 'block';
  }
  return false;
}

/**
 * 创建一个命令 visibility 管理器。
 * 每个 apply() 调用创建独立的实例，避免模块级状态在热重载时泄漏。
 */
export function createCommandVisibilityManager() {
  const modifiedCommands = new WeakSet<any>();

  /**
   * 根据当前 filter-pro 规则，对所有命令应用 visibility 标记（hidden、slash）。
   * 首次调用时保存原始 hidden 和 slash 值，以便在规则移除时可以恢复。
   */
  function apply(commands: any[], state: RuleState): void {
    for (const command of commands) {
      const name = String(command?.name ?? '').trim();
      if (!name) continue;

      // 保存原始值（仅在首次时）
      if (!modifiedCommands.has(command)) {
        (command as any).__filter_pro_saved_slash = command.config.slash;
        (command as any).__filter_pro_saved_hidden = command.config.hidden;
        modifiedCommands.add(command);
      }

      // 设置 hidden Computed
      command.config.hidden = createHiddenComputed(name, state);

      // 设置 slash 标志
      if (shouldHideFromPlatform(name, state)) {
        command.config.slash = false;
      } else {
        // 如果规则不再拦截，恢复原始 slash 值
        const saved = (command as any).__filter_pro_saved_slash;
        if (saved !== undefined) {
          command.config.slash = saved;
        }
      }
    }
  }

  /**
   * 将所有已修改命令的 hidden 和 slash 恢复到原始状态。
   * 在插件 dispose 时调用。
   */
  function restore(commands: any[]): void {
    for (const command of commands) {
      const savedSlash = (command as any).__filter_pro_saved_slash;
      const savedHidden = (command as any).__filter_pro_saved_hidden;

      if (savedHidden !== undefined) {
        command.config.hidden = savedHidden;
      }
      if (savedSlash !== undefined) {
        command.config.slash = savedSlash;
      }

      // 清理自定义属性
      delete (command as any).__filter_pro_saved_slash;
      delete (command as any).__filter_pro_saved_hidden;
    }
  }

  return { apply, restore };
}
