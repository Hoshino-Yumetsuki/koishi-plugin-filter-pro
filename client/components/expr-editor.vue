<template>
  <div class="cf-editor">
    <!-- 条件行 -->
    <div class="rows-section">
      <template v-for="(row, i) in rows" :key="row.id">
        <!-- 连接符（第一行之后显示） -->
        <div v-if="i > 0" class="connector-sep" :class="'conn-' + row.connector">
          <!-- AND：细线 + 按钮 + 细线 -->
          <div v-if="row.connector === 'and'" class="conn-and-wrap">
            <div class="conn-vline"></div>
            <k-button :title="'点击切换为或（OR）'" @click="toggleConnector(i)">且（AND）</k-button>
            <div class="conn-vline"></div>
          </div>
          <!-- OR：仅按钮 -->
          <k-button v-else :title="'点击切换为且（AND）'" @click="toggleConnector(i)"
            >或（OR）</k-button
          >
        </div>

        <!-- 条件行 -->
        <div class="cf-row">
          <FpSelect
            :model-value="row.field"
            :options="fieldSelectOptions"
            class="sel-field"
            @update:model-value="
              (v: string) => {
                const wasBool = row.field === 'isDirect';
                row.field = v;
                if (v === 'isDirect') {
                  row.value = false;
                  row.valueText = 'false';
                  if (!['eq', 'ne', 'exists'].includes(row.operator)) row.operator = 'eq';
                } else if (wasBool) {
                  row.value = isArrayOperator(row.operator) ? [] : '';
                  row.valueText = '';
                }
                emitChange();
              }
            "
          />
          <input
            v-if="row.field === '__custom__'"
            class="input custom-input"
            v-model="row.customField"
            @input="emitChange"
            placeholder="字段路径，如 author.name"
          />
          <FpSelect
            :model-value="row.operator"
            :options="row.field === 'isDirect' ? boolOperatorOptions : operatorOptions"
            class="sel-op"
            @update:model-value="
              (v: string) => {
                const wasArray = isArrayOperator(row.operator);
                const willBeArray = isArrayOperator(v);
                row.operator = v;
                if (willBeArray && !wasArray) {
                  row.value = [];
                  row.valueText = '';
                } else if (!willBeArray && wasArray) {
                  row.value = '';
                  row.valueText = '';
                }
                emitChange();
              }
            "
          />
          <!-- isDirect：开关 -->
          <label v-if="row.field === 'isDirect' && row.operator !== 'exists'" class="bool-toggle">
            <input
              type="checkbox"
              :checked="row.value === true"
              @change="
                (e) => {
                  row.value = (e.target as HTMLInputElement).checked;
                  row.valueText = String(row.value);
                  emitChange();
                }
              "
            />
            <span class="bool-label">{{ row.value === true ? '是（true）' : '否（false）' }}</span>
          </label>
          <!-- 数组操作符：Tag 输入 -->
          <TagInput
            v-else-if="
              row.field !== 'isDirect' && row.operator !== 'exists' && isArrayOperator(row.operator)
            "
            :model-value="Array.isArray(row.value) ? (row.value as string[]) : []"
            :placeholder="getValuePlaceholder(row.operator)"
            @update:model-value="
              (v: string[]) => {
                row.value = v;
                emitChange();
              }
            "
          />
          <!-- 普通文本输入 -->
          <input
            v-else-if="row.field !== 'isDirect' && row.operator !== 'exists'"
            class="input val-input"
            v-model="row.valueText"
            @input="
              () => {
                row.value = parseValue(row.valueText);
                emitChange();
              }
            "
            :placeholder="getValuePlaceholder(row.operator)"
          />
          <div class="row-btns">
            <k-button @click="insertRowAfter(i, 'and')">且（AND）</k-button>
            <k-button v-if="i === rows.length - 1" @click="insertRowAfter(i, 'or')"
              >或（OR）</k-button
            >
          </div>
          <button
            class="del-btn"
            :disabled="rows.length <= 1"
            @click="removeRow(i)"
            title="删除此条件"
          >
            ✕
          </button>
        </div>
      </template>
    </div>

    <!-- 添加条件（仅空状态） -->
    <div v-if="rows.length === 0" class="add-section">
      <k-button @click="addRow(null)">+ 添加条件</k-button>
    </div>

    <!-- 表达式预览 -->
    <div class="preview-section">
      <div class="preview-title">表达式预览</div>
      <code class="preview-code">{{ previewText || '（空）' }}</code>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import FpSelect from './fp-select.vue';
import TagInput from './tag-input.vue';

defineOptions({ name: 'ExprEditor' });

type GroupOperator = 'and' | 'or';
type CompareOperator =
  | 'eq'
  | 'ne'
  | 'in'
  | 'nin'
  | 'includes'
  | 'notincludes'
  | 'regex'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'exists';

type RuleExpr =
  | { type: 'group'; operator: GroupOperator; children: RuleExpr[] }
  | { type: 'not'; child: RuleExpr }
  | {
      type: 'compare';
      field: string;
      operator: CompareOperator;
      value?: unknown;
    };

interface FlatRow {
  id: string;
  field: string;
  customField: string;
  operator: string;
  valueText: string;
  value: unknown;
  connector: 'and' | 'or' | null; // null = 第一行
}

let _idCtr = 0;
const newId = () => String(++_idCtr);

const fieldOptions = [
  { value: 'guildId', label: '群组 ID（guildId）' },
  { value: 'channelId', label: '频道 ID（channelId）' },
  { value: 'userId', label: '用户 ID（userId）' },
  { value: 'platform', label: '平台（platform）' },
  { value: 'content', label: '消息内容（content）' },
  { value: 'isDirect', label: '私聊（isDirect）' },
  { value: 'type', label: '消息类型（type）' }
];

const fieldSelectOptions = [...fieldOptions, { value: '__custom__', label: '自定义字段...' }];

const operatorOptions = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'in', label: '等于以下各项' },
  { value: 'nin', label: '不等于以下各项' },
  { value: 'includes', label: '包含以下各项' },
  { value: 'notincludes', label: '不包含以下各项' },
  { value: 'regex', label: '正则匹配' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'exists', label: '存在' }
];

const boolOperatorOptions = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'exists', label: '存在' }
];

const opSymbols: Record<string, string> = {
  eq: 'eq',
  ne: 'ne',
  in: 'in',
  nin: 'nin',
  includes: 'contains',
  notincludes: 'not-contains',
  regex: 'matches',
  gt: 'gt',
  gte: 'gte',
  lt: 'lt',
  lte: 'lte',
  exists: 'exists'
};

const props = defineProps<{ modelValue: RuleExpr }>();
const emit = defineEmits<(e: 'update:modelValue', value: RuleExpr) => void>();

const rows = ref<FlatRow[]>(toFlat(props.modelValue));

// 用于避免 watch 和 emit 互相触发死循环
let lastEmittedJson = JSON.stringify(props.modelValue);

watch(
  () => props.modelValue,
  (val) => {
    const j = JSON.stringify(val);
    if (j === lastEmittedJson) return;
    lastEmittedJson = j;
    rows.value = toFlat(val);
  },
  { deep: true }
);

// ── 转换：RuleExpr → FlatRow[] ─────────────────────────────────────────────

function makeDefaultRow(connector: 'and' | 'or' | null, field = 'guildId'): FlatRow {
  const isBool = field === 'isDirect';
  return {
    id: newId(),
    field,
    customField: '',
    operator: 'eq',
    valueText: isBool ? 'false' : '',
    value: isBool ? false : '',
    connector
  };
}

function rowFromCompare(
  c: { field: string; operator: string; value?: unknown },
  connector: 'and' | 'or' | null
): FlatRow {
  const known = fieldOptions.some((f) => f.value === c.field);
  const field = known ? c.field : '__custom__';
  const isArr = isArrayOperator(c.operator);
  // isDirect 默认为 false（boolean），数组操作符默认 []，其他默认空字符串
  const defaultVal = field === 'isDirect' ? false : isArr ? [] : '';
  let rawVal: unknown = c.value ?? defaultVal;
  // 数组操作符：兼容旧格式（逗号分隔字符串）
  if (isArr) {
    if (typeof rawVal === 'string') {
      rawVal = rawVal
        ? rawVal
            .split(/[,，]/)
            .map((v) => v.trim())
            .filter(Boolean)
        : [];
    } else if (!Array.isArray(rawVal)) {
      rawVal = [];
    }
  }
  return {
    id: newId(),
    field,
    customField: known ? '' : c.field,
    operator: c.operator,
    valueText: Array.isArray(rawVal)
      ? ''
      : rawVal === undefined || rawVal === null
        ? ''
        : String(rawVal),
    value: rawVal,
    connector
  };
}

function toFlat(expr: RuleExpr): FlatRow[] {
  if (!expr) return [makeDefaultRow(null)];

  if (expr.type === 'compare') {
    return [rowFromCompare(expr, null)];
  }

  if (expr.type === 'group') {
    // 全部子节点都是 compare：直接扁平化
    if (expr.children.every((c) => c.type === 'compare')) {
      return expr.children.map((c, i) => rowFromCompare(c as any, i === 0 ? null : expr.operator));
    }

    // OR(AND(...), AND(...), ...)：混合连接符
    if (expr.operator === 'or') {
      const result: FlatRow[] = [];
      let first = true;
      for (const child of expr.children) {
        if (child.type === 'compare') {
          result.push(rowFromCompare(child, first ? null : 'or'));
          first = false;
        } else if (child.type === 'group' && child.operator === 'and') {
          child.children.forEach((c, ci) => {
            if (c.type === 'compare') {
              result.push(rowFromCompare(c as any, first ? null : ci === 0 ? 'or' : 'and'));
              first = false;
            }
          });
        }
      }
      if (result.length > 0) return result;
    }
  }

  return [makeDefaultRow(null)];
}

// ── 转换：FlatRow[] → RuleExpr ─────────────────────────────────────────────

function rowToCompare(row: FlatRow): RuleExpr {
  const field =
    row.field === '__custom__' ? (row.customField || '').trim() || 'guildId' : row.field;
  return {
    type: 'compare',
    field,
    operator: row.operator as CompareOperator,
    value: row.operator === 'exists' ? undefined : row.value
  };
}

function fromFlat(flatRows: FlatRow[]): RuleExpr {
  if (flatRows.length === 0)
    return { type: 'compare', field: 'guildId', operator: 'eq', value: '' };
  if (flatRows.length === 1) return rowToCompare(flatRows[0]);

  // 按 OR 分割成 AND 组
  const orGroups: FlatRow[][] = [];
  let cur: FlatRow[] = [flatRows[0]];
  for (let i = 1; i < flatRows.length; i++) {
    if (flatRows[i].connector === 'or') {
      orGroups.push(cur);
      cur = [flatRows[i]];
    } else cur.push(flatRows[i]);
  }
  orGroups.push(cur);

  const groupExprs: RuleExpr[] = orGroups.map((grp) => {
    if (grp.length === 1) return rowToCompare(grp[0]);
    return { type: 'group', operator: 'and', children: grp.map(rowToCompare) };
  });

  if (groupExprs.length === 1) return groupExprs[0];
  return { type: 'group', operator: 'or', children: groupExprs };
}

// ── 表达式预览 ──────────────────────────────────────────────────────────────

function buildPreview(expr: RuleExpr): string {
  if (expr.type === 'compare') {
    const sym = opSymbols[expr.operator] || expr.operator;
    let val: string;
    if (expr.value === undefined) {
      val = '';
    } else if (Array.isArray(expr.value)) {
      val = `{${(expr.value as string[]).map((v) => JSON.stringify(v)).join(' ')}}`;
    } else {
      val = JSON.stringify(expr.value);
    }
    return `(${expr.field} ${sym} ${val})`;
  }
  if (expr.type === 'group') {
    const sep = expr.operator === 'and' ? ' AND ' : ' OR ';
    return expr.children.map(buildPreview).join(sep);
  }
  if (expr.type === 'not') return `NOT (${buildPreview(expr.child)})`;
  return '';
}

const previewText = computed(() => buildPreview(fromFlat(rows.value)));

// ── 操作 ───────────────────────────────────────────────────────────────────

function emitChange() {
  const expr = fromFlat(rows.value);
  lastEmittedJson = JSON.stringify(expr);
  emit('update:modelValue', expr);
}

function addRow(connector: 'and' | 'or' | null) {
  rows.value.push(makeDefaultRow(connector ?? 'and'));
  emitChange();
}

function insertRowAfter(i: number, connector: 'and' | 'or') {
  rows.value.splice(i + 1, 0, makeDefaultRow(connector));
  emitChange();
}

function removeRow(i: number) {
  if (rows.value.length <= 1) return;
  rows.value.splice(i, 1);
  if (i === 0) rows.value[0].connector = null;
  emitChange();
}

function toggleConnector(i: number) {
  if (i <= 0) return;
  rows.value[i].connector = rows.value[i].connector === 'or' ? 'and' : 'or';
  emitChange();
}

function parseValue(text: string): unknown {
  const t = text.trim();
  if (!t) return '';
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  const n = Number(t);
  if (Number.isFinite(n) && Number.isSafeInteger(n)) return n;
  return text;
}

// 获取输入框占位符提示
function isArrayOperator(op: string): boolean {
  return ['in', 'nin', 'includes', 'notincludes'].includes(op);
}

function getValuePlaceholder(operator: string): string {
  if (isArrayOperator(operator)) {
    return '输入后按 Enter 添加';
  }
  return '比较值';
}
</script>

<style scoped>
.cf-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── 连接符 ── */
.connector-sep {
  display: flex;
  align-items: center;
}

/* OR：按钮 + 上下内廝 */
.connector-sep.conn-or {
  padding: 16px 0;
}

/* AND：无额外内廝，由线提供等高间距 */
.connector-sep.conn-and {
  padding: 0;
}

/* AND 内部：线 + 按钮 + 线，列居中 */
.conn-and-wrap {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
}

/* 上下细线，高度与 OR 内廝相同，颜色和边框一致 */
.conn-vline {
  width: 1px;
  height: 12px;
  background: var(--k-card-border, rgba(127, 127, 127, 0.35));
}

/* ── 条件行 ── */
.cf-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sel-field {
  min-width: 168px;
}

.sel-op {
  min-width: 110px;
}

.val-input,
.custom-input {
  flex: 1;
  min-width: 120px;
  height: 35px;
  box-sizing: border-box;
  color: var(--k-text-normal, inherit);
  background: var(--k-input-bg, transparent);
  border: 1px solid var(--k-card-border, rgba(127, 127, 127, 0.35));
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 14px;
}

/* ── 布尔开关 ── */
.bool-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  flex: 1;
  min-width: 120px;
}

.bool-toggle input[type='checkbox'] {
  appearance: none;
  -webkit-appearance: none;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: var(--k-card-border, rgba(127, 127, 127, 0.4));
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}

.bool-toggle input[type='checkbox']::after {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  top: 3px;
  left: 3px;
  transition: left 0.2s;
}

.bool-toggle input[type='checkbox']:checked {
  background: var(--k-color-primary, #4f7cff);
}

.bool-toggle input[type='checkbox']:checked::after {
  left: 19px;
}

.bool-label {
  font-size: 13px;
  color: var(--k-text-normal, inherit);
  user-select: none;
}

/* ── 行内操作按钮（And / Or） ── */
.row-btns {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  margin-left: auto;
}

.del-btn {
  flex-shrink: 0;
  width: 35px;
  height: 35px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--k-text-secondary, #888);
  cursor: pointer;
  font-size: 14px;
  transition:
    color 0.15s,
    background 0.15s;
}

.del-btn:hover {
  color: #e74c3c;
  background: color-mix(in srgb, #e74c3c 15%, transparent);
}

.del-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

/* ── 添加按钮 ── */
.add-section {
  display: flex;
  gap: 8px;
}

/* ── 表达式预览 ── */
.preview-section {
  border-top: 1px solid var(--k-card-border, rgba(127, 127, 127, 0.2));
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--k-text-secondary, #888);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.preview-code {
  display: block;
  font-family: 'Consolas', 'Monaco', 'Fira Code', monospace;
  font-size: 13px;
  background: color-mix(in srgb, #000 35%, transparent);
  padding: 10px 14px;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--k-text-normal, inherit);
  line-height: 1.6;
}
</style>
