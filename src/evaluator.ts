import type { CompareExpr, RuleExpr, RuleItem } from './types';
import { matchTarget, sortRules } from './rule-utils';

function getByPath(source: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  const parts = path.split('.');
  let cursor: unknown = source;
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeScalar(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'object') return value;
  return String(value);
}

// 解析多值：优先处理数组（新格式），兼容逗号分割字符串（旧格式）
function parseMultiValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [value];
  // 兼容旧格式：全角、半角逗号分割
  const parts = value
    .split(/[,，]/)
    .map((v) => v.trim())
    .filter((v) => v);
  return parts.length > 1 ? parts : [value];
}

function evaluateCompare(left: unknown, expr: CompareExpr): boolean {
  if (expr.operator === 'exists') {
    return left !== undefined && left !== null;
  }
  const right = expr.value;
  const leftNorm = normalizeScalar(left);
  const rightNorm = normalizeScalar(right);

  if (expr.operator === 'eq') {
    return leftNorm === rightNorm;
  }
  if (expr.operator === 'ne') {
    return leftNorm !== rightNorm;
  }

  // 以下操作符支持逗号分割的多值右侧
  const rightValues = parseMultiValue(right);

  if (expr.operator === 'in') {
    // 等于右值数组中的任意一个
    return rightValues.some((rv) => leftNorm === normalizeScalar(rv));
  }
  if (expr.operator === 'nin') {
    // 不等于右值数组中的任意一个
    return rightValues.every((rv) => leftNorm !== normalizeScalar(rv));
  }
  if (expr.operator === 'includes') {
    if (typeof leftNorm === 'string') {
      // 包含：左值包含右值数组中的任意一个
      return rightValues.some((rv) => leftNorm.includes(String(normalizeScalar(rv) ?? '')));
    }
    if (Array.isArray(left)) {
      const leftNormArray = left.map((item) => normalizeScalar(item));
      // 数组包含：左数组包含右值数组中的任意一个
      return rightValues.some((rv) => leftNormArray.includes(normalizeScalar(rv)));
    }
    return false;
  }
  if (expr.operator === 'notincludes') {
    if (typeof leftNorm === 'string') {
      // 不包含：左值不包含右值数组中的任意一个
      return rightValues.every((rv) => !leftNorm.includes(String(normalizeScalar(rv) ?? '')));
    }
    if (Array.isArray(left)) {
      const leftNormArray = left.map((item) => normalizeScalar(item));
      // 数组不包含：左数组不包含右值数组中的任意一个
      return rightValues.every((rv) => !leftNormArray.includes(normalizeScalar(rv)));
    }
    return false;
  }
  if (expr.operator === 'regex') {
    if (typeof leftNorm !== 'string') return false;
    try {
      // 正则匹配：使用第一个值作为正则表达式
      return new RegExp(String(normalizeScalar(rightValues[0]) ?? '')).test(leftNorm);
    } catch {
      return false;
    }
  }

  // 数值比较：使用第一个值
  const numRightNorm = normalizeScalar(rightValues[0]);
  const ln = coerceNumber(left);
  const rn = coerceNumber(numRightNorm);
  if (ln === null || rn === null) return false;
  if (expr.operator === 'gt') return ln > rn;
  if (expr.operator === 'gte') return ln >= rn;
  if (expr.operator === 'lt') return ln < rn;
  if (expr.operator === 'lte') return ln <= rn;
  return false;
}

export function evaluateExpr(expr: RuleExpr, vars: Record<string, unknown>): boolean {
  if (expr.type === 'group') {
    if (!expr.children.length) return true;
    if (expr.operator === 'and') return expr.children.every((child) => evaluateExpr(child, vars));
    return expr.children.some((child) => evaluateExpr(child, vars));
  }
  if (expr.type === 'not') {
    return !evaluateExpr(expr.child, vars);
  }
  return evaluateCompare(getByPath(vars, expr.field), expr);
}

export type EvalResult = 'block' | 'allow' | 'pass';

/**
 * 对单条规则进行模式感知评估。返回：
 *   'block'  - 目标应被拦截
 *   'allow'  - 目标应被放行（blacklist 中的 bypass / whitelist 中的匹配项）
 *   'pass'   - 此规则不适用（条件或目标不匹配）
 *
 * 规则语义：
 *   blacklist + block: 匹配的目标被拦截
 *   blacklist + bypass: 匹配的目标被放行（覆盖低优先级规则）
 *   whitelist + block: 仅匹配的目标被放行，不匹配的（但条件匹配）被拦截
 *   whitelist + bypass: 匹配的目标被放行
 */
export function evaluateRule(
  rule: RuleItem,
  vars: Record<string, unknown>,
  targetVars: Record<string, unknown>
): EvalResult {
  if (!rule.enabled) return 'pass';

  const conditionMatched = evaluateExpr(rule.condition, vars);
  if (!conditionMatched) return 'pass'; // 条件不满足 → 规则不适用

  if (rule.mode === 'whitelist') {
    // 白名单模式：条件满足时，匹配目标 → 放行，不匹配目标 → 拦截
    if (matchTarget(rule.target, targetVars)) return 'allow';
    return 'block';
  }

  // 黑名单模式（默认）
  if (!matchTarget(rule.target, targetVars)) return 'pass';
  return rule.action === 'bypass' ? 'allow' : 'block';
}

/**
 * 按优先级评估规则列表，先匹配先赢。
 * 如果没有规则匹配，默认放行。
 * 返回匹配的规则引用，用于获取自定义响应文本。
 */
export function evaluateAllRules(
  rules: RuleItem[],
  vars: Record<string, unknown>,
  targetVars: Record<string, unknown>
): { result: 'block' | 'allow'; rule?: RuleItem } {
  for (const rule of sortRules(rules)) {
    const result = evaluateRule(rule, vars, targetVars);
    if (result !== 'pass') return { result, rule };
  }
  return { result: 'allow' };
}
