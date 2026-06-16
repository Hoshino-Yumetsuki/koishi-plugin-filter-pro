import type { CompareExpr, RuleExpr } from './types';

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
