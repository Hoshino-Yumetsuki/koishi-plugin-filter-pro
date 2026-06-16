import { Random } from 'koishi';

import type {
  CompareOperator,
  GroupOperator,
  RuleExpr,
  RuleInput,
  RuleItem,
  RuleTarget
} from './types';

export function defaultExpr(): RuleExpr {
  return {
    type: 'group',
    operator: 'and',
    children: [{ type: 'compare', field: 'guildId', operator: 'eq', value: '' }]
  };
}

export function cloneRule(rule: RuleItem): RuleItem {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    priority: rule.priority,
    action: rule.action,
    target: { ...rule.target },
    condition: cloneExpr(rule.condition),
    response: rule.response
  };
}

export function cloneExpr(expr: RuleExpr): RuleExpr {
  if (expr.type === 'group') {
    return {
      type: 'group',
      operator: expr.operator,
      children: expr.children.map(cloneExpr)
    };
  }
  if (expr.type === 'not') {
    return { type: 'not', child: cloneExpr(expr.child) };
  }
  return {
    type: 'compare',
    field: expr.field,
    operator: expr.operator,
    value: expr.value
  };
}

export function sortRules(rules: RuleItem[]) {
  return [...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

export function normalizeExpr(input: unknown): RuleExpr {
  if (!input || typeof input !== 'object') return defaultExpr();
  const data = input as Record<string, unknown>;
  if (data.type === 'group') {
    const operator: GroupOperator = data.operator === 'or' ? 'or' : 'and';
    const children = Array.isArray(data.children) ? data.children.map(normalizeExpr) : [];
    return { type: 'group', operator, children };
  }
  if (data.type === 'not') {
    return { type: 'not', child: normalizeExpr(data.child) };
  }
  const allowed: CompareOperator[] = [
    'eq',
    'ne',
    'in',
    'nin',
    'includes',
    'notincludes',
    'regex',
    'gt',
    'gte',
    'lt',
    'lte',
    'exists'
  ];
  const operator = allowed.includes(data.operator as CompareOperator)
    ? (data.operator as CompareOperator)
    : 'eq';
  return {
    type: 'compare',
    field: typeof data.field === 'string' ? data.field : 'content',
    operator,
    value: data.value
  };
}

export function normalizeRule(input: RuleInput): RuleItem {
  const rawTarget = input.target || { type: 'global' as const };
  let normalizedValue: string | string[] | undefined;

  // 处理不同目标类型的值
  if (rawTarget.type === 'global') {
    normalizedValue = '';
  } else if (rawTarget.type === 'plugin' || rawTarget.type === 'command') {
    // 支持数组或单个字符串
    if (Array.isArray(rawTarget.value)) {
      normalizedValue = rawTarget.value
        .filter((v) => typeof v === 'string' && v.trim())
        .map((v) => v.trim());
    } else if (typeof rawTarget.value === 'string') {
      normalizedValue = rawTarget.value.trim() ? [rawTarget.value.trim()] : [];
    } else {
      normalizedValue = [];
    }
  }

  const target: RuleTarget = {
    type:
      rawTarget.type === 'command' ? 'command' : rawTarget.type === 'plugin' ? 'plugin' : 'global',
    value: normalizedValue
  };

  return {
    id: input.id || Random.id(8),
    name: input.name || 'new-rule',
    enabled: input.enabled ?? true,
    priority: input.priority ?? 0,
    action: input.action || 'block',
    target,
    condition: normalizeExpr(input.condition),
    response: input.response ?? ''
  };
}

export function matchTarget(target: RuleTarget, vars: Record<string, unknown>): boolean {
  if (!target || target.type === 'global') return true;

  // 插件目标匹配
  if (target.type === 'plugin') {
    const pluginKey = typeof vars.pluginKey === 'string' ? vars.pluginKey : '';
    if (!pluginKey) return false;

    if (Array.isArray(target.value)) {
      return target.value.length > 0 && target.value.includes(pluginKey);
    }
    const value = typeof target.value === 'string' ? target.value.trim() : '';
    return value && pluginKey === value;
  }

  // 指令目标匹配
  if (target.type === 'command') {
    const commandName = typeof vars.commandName === 'string' ? vars.commandName : '';
    if (!commandName) return false;

    if (Array.isArray(target.value)) {
      return target.value.length > 0 && target.value.includes(commandName);
    }
    const value = typeof target.value === 'string' ? target.value.trim() : '';
    return value && commandName === value;
  }

  return false;
}
