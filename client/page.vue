<template>
  <k-layout>
    <div class="fp-layout">
      <div class="fp-main">
        <k-card class="panel list">
          <template #header>
            <div class="editor-header">
              <div class="panel-title">规则列表</div>
              <k-button @click="createRule">新建规则</k-button>
            </div>
          </template>

          <div class="rule-list">
            <button
              v-for="rule in sortedRules"
              :key="rule.id"
              class="rule-item"
              :class="{ active: selectedId === rule.id }"
              @click="selectedId = rule.id"
            >
              <div class="top">
                <span class="name">{{ rule.name || '未命名规则' }}</span>
                <span class="badge" :class="rule.action">{{ actionLabel[rule.action] }}</span>
              </div>
              <div class="meta">
                <span>#{{ rule.priority }}</span>
                <span>{{ getTargetDisplay(rule.target) }}</span>
                <span>{{ rule.enabled ? '启用' : '停用' }}</span>
              </div>
            </button>
          </div>
        </k-card>

        <k-card class="panel editor" v-if="currentRule">
          <template #header>
            <div class="editor-header">
              <div class="panel-title">规则编辑</div>
              <div class="actions">
                <k-button @click="currentRule && saveRule(currentRule)" :disabled="!currentRule"
                  >保存</k-button
                >
                <k-button @click="confirmRemove" :disabled="!currentRule">删除</k-button>
                <k-button @click="refresh">刷新</k-button>
              </div>
            </div>
          </template>

          <div class="editor-body">
            <div class="editor-grid">
              <label class="field">
                <span>规则名</span>
                <input class="input" v-model="currentRule.name" placeholder="输入规则名" />
              </label>

              <label class="field">
                <span>目标</span>
                <FpSelect v-model="currentRule.target.type" :options="targetTypeOptions" />
              </label>

              <!-- 插件多选 -->
              <label class="field" v-if="currentRule.target.type === 'plugin'">
                <span>插件实例</span>
                <PluginSelector
                  mode="plugin"
                  :model-value="
                    Array.isArray(currentRule.target.value)
                      ? currentRule.target.value
                      : currentRule.target.value
                        ? [currentRule.target.value]
                        : []
                  "
                  :options="pluginTargets"
                  @update:model-value="currentRule.target.value = $event"
                />
              </label>

              <!-- 指令多选 -->
              <label class="field" v-if="currentRule.target.type === 'command'">
                <span>作用指令</span>
                <PluginSelector
                  mode="command"
                  :model-value="
                    Array.isArray(currentRule.target.value)
                      ? currentRule.target.value
                      : currentRule.target.value
                        ? [currentRule.target.value]
                        : []
                  "
                  :options="
                    commandList.map((c) => ({
                      key: c.name,
                      name: c.name,
                      ident: '',
                      label: c.label
                    }))
                  "
                  @update:model-value="currentRule.target.value = $event"
                />
              </label>

              <label class="field">
                <span>动作</span>
                <FpSelect v-model="currentRule.action" :options="actionOptions" />
              </label>

              <label class="field">
                <span>优先级</span>
                <input
                  class="input"
                  type="number"
                  min="1"
                  step="1"
                  v-model.number="currentRule.priority"
                  @input="validatePriority"
                />
              </label>

              <label class="field switch">
                <span>启用状态</span>
                <div
                  class="toggle-switch"
                  :class="{ active: currentRule.enabled }"
                  @click="onToggle(currentRule)"
                >
                  <div class="toggle-thumb" />
                </div>
              </label>
            </div>

            <div class="expr-wrap">
              <div class="panel-title small">条件表达式</div>
              <ExprEditor v-model="currentRule.condition" />
            </div>

            <div class="footer-actions">
              <k-button @click="move(currentRule.id, -1)">上移</k-button>
              <k-button @click="move(currentRule.id, 1)">下移</k-button>
            </div>
          </div>
        </k-card>
      </div>
    </div>
  </k-layout>

  <!-- 删除确认弹窗 -->
  <teleport to="body">
    <div v-if="showDeleteConfirm" class="confirm-overlay" @click.self="showDeleteConfirm = false">
      <div class="confirm-dialog">
        <div class="confirm-title">删除规则</div>
        <div class="confirm-body">确定要删除这条规则吗？此操作不可撤销。</div>
        <div class="confirm-actions">
          <k-button @click="showDeleteConfirm = false">取消</k-button>
          <button class="confirm-danger-btn" @click="doRemove">确认删除</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { send, message } from '@koishijs/client';
import FpSelect from './components/fp-select.vue';
import ExprEditor from './components/expr-editor.vue';
import PluginSelector from './components/plugin-selector.vue';

const request = send as any;

type RuleAction = 'bypass' | 'block';
type GroupOperator = 'and' | 'or';
type CompareOperator = 'eq' | 'ne' | 'includes' | 'regex' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists';
type TargetType = 'global' | 'plugin' | 'command';

type RuleExpr =
  | { type: 'group'; operator: GroupOperator; children: RuleExpr[] }
  | { type: 'not'; child: RuleExpr }
  | {
      type: 'compare';
      field: string;
      operator: CompareOperator;
      value?: unknown;
    };

interface RuleItem {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  action: RuleAction;
  target: {
    type: TargetType;
    value?: string | string[];
  };
  condition: RuleExpr;
  response?: string;
}

interface PluginTargetOption {
  key: string;
  name: string;
  ident: string;
  label: string;
}

interface CommandOption {
  name: string;
  label: string;
}

const actionLabel: Record<RuleAction, string> = {
  bypass: '放行',
  block: '拦截'
};

const targetTypeOptions = [
  { label: '全局', value: 'global' },
  { label: '插件', value: 'plugin' },
  { label: '指令', value: 'command' }
];

const actionOptions = [
  { label: '放行（bypass）', value: 'bypass' },
  { label: '拦截（block）', value: 'block' }
];

const pluginTargetOptions = computed(() => [
  { label: '请选择插件实例', value: '' },
  ...pluginTargets.value.map((item) => ({ label: item.label, value: item.key }))
]);

const rules = ref<RuleItem[]>([]);
const pluginTargets = ref<PluginTargetOption[]>([]);
const commandList = ref<CommandOption[]>([]);
const selectedId = ref('');
const showDeleteConfirm = ref(false);

const sortedRules = computed(() =>
  [...rules.value].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
);
const currentRule = computed(() => sortedRules.value.find((item) => item.id === selectedId.value));

// 获取目标显示文本
function getTargetDisplay(target: { type: TargetType; value?: string | string[] }): string {
  if (target.type === 'global') return '全局';
  if (target.type === 'plugin') {
    if (Array.isArray(target.value)) {
      return target.value.length > 0 ? `插件 (${target.value.length})` : '未指定插件';
    }
    return target.value || '未指定插件';
  }
  if (target.type === 'command') {
    if (Array.isArray(target.value)) {
      return target.value.length > 0 ? `指令 (${target.value.length})` : '未指定指令';
    }
    return target.value || '未指定指令';
  }
  return '未知';
}

// 监听目标类型变化，清空已选值
watch(
  () => currentRule.value?.target.type,
  (newType, oldType) => {
    if (newType && oldType && newType !== oldType && currentRule.value) {
      currentRule.value.target.value = newType === 'global' ? '' : [];
    }
  }
);

function defaultExpr(): RuleExpr {
  return {
    type: 'group',
    operator: 'and',
    children: [{ type: 'compare', field: 'guildId', operator: 'eq', value: '' }]
  };
}

async function refresh() {
  const [data, targets, commands] = await Promise.all([
    request('filter-pro/list') as Promise<RuleItem[]>,
    request('filter-pro/targets') as Promise<PluginTargetOption[]>,
    request('filter-pro/commands') as Promise<CommandOption[]>
  ]);
  pluginTargets.value = targets;
  commandList.value = commands;
  rules.value = data;
  if (!selectedId.value || !rules.value.some((item) => item.id === selectedId.value)) {
    selectedId.value = sortedRules.value[0]?.id || '';
  }
  message.success('刷新成功');
}

async function createRule() {
  await request('filter-pro/create', {
    name: 'new-rule',
    enabled: true,
    priority: (sortedRules.value.at(-1)?.priority ?? -1) + 1,
    action: 'block',
    target: { type: 'global', value: '' },
    condition: defaultExpr(),
    response: ''
  });
  await refresh();
  selectedId.value = sortedRules.value.at(-1)?.id || selectedId.value;
  message.success('创建成功');
}

function validatePriority(e: Event) {
  const input = e.target as HTMLInputElement;
  const value = Number(input.value);
  if (value < 1 || !Number.isInteger(value)) {
    input.value = String(Math.max(1, Math.floor(Math.abs(value)) || 1));
    if (currentRule.value) {
      currentRule.value.priority = Number(input.value);
    }
  }
}

async function onToggle(rule: RuleItem) {
  rule.enabled = !rule.enabled;
  await request('filter-pro/toggle', { id: rule.id, enabled: rule.enabled });
}

async function saveRule(rule: RuleItem) {
  let target: { type: TargetType; value?: string | string[] };

  if (rule.target.type === 'global') {
    target = { type: 'global', value: '' };
  } else if (rule.target.type === 'plugin') {
    // 插件多选：保存为数组
    target = { type: 'plugin', value: rule.target.value || [] };
  } else {
    // 指令多选：保存为数组
    target = { type: 'command', value: rule.target.value || [] };
  }

  await request('filter-pro/update', {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    priority: rule.priority,
    action: rule.action,
    target,
    condition: rule.condition,
    response: rule.response || ''
  });
  await refresh();
  message.success('保存成功');
}

async function confirmRemove() {
  if (!currentRule.value) return;
  showDeleteConfirm.value = true;
}

async function doRemove() {
  showDeleteConfirm.value = false;
  if (!currentRule.value) return;
  await removeRule(currentRule.value.id);
}

async function removeRule(id: string) {
  await request('filter-pro/delete', id);
  await refresh();
  message.success('删除成功');
}

async function move(id: string, offset: number) {
  const list = sortedRules.value;
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) return;
  const target = index + offset;
  if (target < 0 || target >= list.length) return;
  const reordered = [...list];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  await request(
    'filter-pro/reorder',
    reordered.map((item) => item.id)
  );
  await refresh();
}

void refresh();
</script>

<style scoped>
.fp-layout {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  padding: 12px;
  color: var(--k-text-normal, inherit);
  box-sizing: border-box;
  overflow: hidden;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.actions {
  display: flex;
  gap: 8px;
}

.fp-main {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 12px;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.list,
.editor {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list :deep(.k-card-body),
.editor :deep(.k-card-body) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.panel {
  background: var(--k-card-bg, transparent);
  border: 1px solid var(--k-card-border, rgba(127, 127, 127, 0.35));
  border-radius: 10px;
}

.panel-title {
  font-weight: 600;
}

.panel-title.small {
  margin-bottom: 8px;
}

.rule-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.editor-body {
  display: flex;
  flex-direction: column;
}

.rule-item {
  width: 100%;
  border: 1px solid var(--k-card-border, rgba(127, 127, 127, 0.35));
  background: var(--k-input-bg, transparent);
  color: var(--k-text-normal, inherit);
  border-radius: 8px;
  padding: 8px;
  text-align: left;
  cursor: pointer;
}

.rule-item.active {
  border-color: var(--k-color-primary, #4f7cff);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--k-color-primary, #4f7cff) 20%, transparent);
}

.rule-item .top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rule-item .name {
  font-weight: 600;
}

.rule-item .meta {
  margin-top: 4px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--k-text-secondary, #888);
  font-size: 12px;
}

.badge {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
}

.badge.bypass {
  background: color-mix(in srgb, #1abc9c 20%, transparent);
}

.badge.block {
  background: color-mix(in srgb, #e74c3c 20%, transparent);
}

.editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field.switch {
  justify-content: flex-end;
}

.toggle-switch {
  position: relative;
  width: 44px;
  height: 24px;
  border-radius: 12px;
  background: var(--k-card-border, rgba(127, 127, 127, 0.4));
  cursor: pointer;
  transition: background 0.25s;
  flex-shrink: 0;
}

.toggle-switch.active {
  background: var(--k-color-active, #5865f2);
}

.toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.25s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.toggle-switch.active .toggle-thumb {
  transform: translateX(20px);
}

.input {
  width: 100%;
  min-width: 0;
  height: 35px;
  box-sizing: border-box;
  color: var(--k-text-normal, inherit);
  background: var(--k-input-bg, transparent);
  border: 1px solid var(--k-card-border, rgba(127, 127, 127, 0.35));
  border-radius: 6px;
  padding: 6px 10px;
}

.expr-wrap {
  margin: 8px 0 12px;
}

.footer-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* ── 删除确认框 ── */
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-dialog {
  background: var(--k-card-bg, #1e1e1e);
  border: 1px solid var(--k-card-border, rgba(127, 127, 127, 0.35));
  border-radius: 12px;
  padding: 24px 28px;
  min-width: 320px;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
}

.confirm-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--k-text-normal, inherit);
}

.confirm-body {
  font-size: 14px;
  color: var(--k-text-secondary, #aaa);
  line-height: 1.6;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.confirm-danger-btn {
  height: 35px;
  box-sizing: border-box;
  padding: 0 16px;
  border-radius: 6px;
  border: none;
  background: #e74c3c;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.confirm-danger-btn:hover {
  opacity: 0.85;
}

@media (max-width: 980px) {
  .fp-main {
    grid-template-columns: 1fr;
  }

  .editor-grid {
    grid-template-columns: 1fr;
  }
}
</style>
<style>
.k-button {
  height: 35px !important;
  box-sizing: border-box !important;
}
</style>
