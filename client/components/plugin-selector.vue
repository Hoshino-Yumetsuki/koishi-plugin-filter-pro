<template>
  <div class="plugin-selector">
    <!-- 触发按钮 -->
    <button type="button" class="trigger-btn" @click="showDialog = true">
      <span class="label">{{ displayText }}</span>
      <span class="arrow">▾</span>
    </button>

    <!-- 多选对话框 -->
    <teleport to="body">
      <div v-if="showDialog" class="dialog-overlay" @click="showDialog = false">
        <div class="dialog-content" @click.stop>
          <div class="dialog-header">
            <h3>{{ dialogTitle }}</h3>
            <button class="close-btn" @click="showDialog = false">✕</button>
          </div>

          <div class="dialog-body">
            <!-- 搜索和全选 -->
            <div class="toolbar">
              <label class="checkbox-item select-all">
                <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" />
                <span>全选</span>
              </label>
              <input v-model="searchText" class="search-input" :placeholder="searchPlaceholder" />
            </div>

            <!-- 插件/指令列表 -->
            <div class="plugin-list">
              <label v-for="plugin in filteredPlugins" :key="plugin.key" class="checkbox-item">
                <input
                  type="checkbox"
                  :value="plugin.key"
                  :checked="localSelected.includes(plugin.key)"
                  @change="togglePlugin(plugin.key)"
                />
                <span>{{ plugin.label }}</span>
              </label>
              <div v-if="filteredPlugins.length === 0" class="empty-state">
                {{ emptyText }}
              </div>
            </div>
          </div>

          <div class="dialog-footer">
            <button class="btn btn-cancel" @click="cancel">取消</button>
            <button class="btn btn-confirm" @click="confirm">确定</button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

interface PluginOption {
  key: string;
  name: string;
  ident: string;
  label: string;
}

const props = defineProps<{
  modelValue: string[];
  options: PluginOption[];
  mode?: 'plugin' | 'command'; // 区分插件或指令模式
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const showDialog = ref(false);
const searchText = ref('');
const localSelected = ref<string[]>([...props.modelValue]);

// 是否为指令模式
const isCommandMode = computed(() => props.mode === 'command');

// 对话框标题
const dialogTitle = computed(() => (isCommandMode.value ? '选择指令' : '选择插件实例'));

// 搜索框占位符
const searchPlaceholder = computed(() => (isCommandMode.value ? '搜索指令...' : '搜索插件...'));

// 空状态文本
const emptyText = computed(() =>
  isCommandMode.value ? '没有找到匹配的指令' : '没有找到匹配的插件'
);

// 显示文本
const displayText = computed(() => {
  const itemType = isCommandMode.value ? '指令' : '插件';
  const selectPrompt = isCommandMode.value ? '请选择指令' : '请选择插件实例';

  if (localSelected.value.length === 0) return selectPrompt;
  if (localSelected.value.length === 1) {
    const plugin = props.options.find((p) => p.key === localSelected.value[0]);
    return plugin?.label || `已选择 1 个${itemType}`;
  }
  return `已选择 ${localSelected.value.length} 个${itemType}`;
});

// 过滤后的插件列表
const filteredPlugins = computed(() => {
  if (!searchText.value) return props.options;
  const search = searchText.value.toLowerCase();
  return props.options.filter((p) => p.label.toLowerCase().includes(search));
});

// 是否全选
const isAllSelected = computed(() => {
  return (
    filteredPlugins.value.length > 0 &&
    filteredPlugins.value.every((p) => localSelected.value.includes(p.key))
  );
});

// 切换单个插件
function togglePlugin(key: string) {
  const index = localSelected.value.indexOf(key);
  if (index > -1) {
    localSelected.value.splice(index, 1);
  } else {
    localSelected.value.push(key);
  }
}

// 切换全选
function toggleSelectAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  if (checked) {
    // 全选当前过滤的插件
    for (const plugin of filteredPlugins.value) {
      if (!localSelected.value.includes(plugin.key)) {
        localSelected.value.push(plugin.key);
      }
    }
  } else {
    // 取消选择当前过滤的插件
    localSelected.value = localSelected.value.filter(
      (key) => !filteredPlugins.value.some((p) => p.key === key)
    );
  }
}

// 确定
function confirm() {
  emit('update:modelValue', [...localSelected.value]);
  showDialog.value = false;
}

// 取消
function cancel() {
  localSelected.value = [...props.modelValue];
  showDialog.value = false;
}

// 监听外部变化
watch(
  () => props.modelValue,
  (val) => {
    localSelected.value = [...val];
  }
);

// 打开对话框时重置搜索
watch(showDialog, (val) => {
  if (val) {
    searchText.value = '';
  }
});
</script>

<style scoped>
.plugin-selector {
  position: relative;
  min-width: 140px;
}

.trigger-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--k-text-normal, inherit);
  background: var(--k-input-bg, transparent);
  border: 1px solid var(--k-card-border, rgba(127, 127, 127, 0.35));
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.trigger-btn:hover {
  border-color: var(--k-color-primary, #4f7cff);
}

.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  text-align: left;
}

.arrow {
  flex-shrink: 0;
}

/* 对话框 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.dialog-content {
  background: var(--k-card-bg, #1e1e1e);
  border: 1px solid var(--k-card-border, rgba(127, 127, 127, 0.35));
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--k-card-border, rgba(127, 127, 127, 0.2));
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--k-text-normal, inherit);
}

.close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--k-text-secondary, #888);
  cursor: pointer;
  font-size: 18px;
  transition:
    color 0.15s,
    background 0.15s;
}

.close-btn:hover {
  color: var(--k-text-normal, inherit);
  background: color-mix(in srgb, var(--k-card-border, #888) 20%, transparent);
}

.dialog-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.select-all {
  flex-shrink: 0;
  font-weight: 600;
}

.search-input {
  flex: 1;
  min-width: 0;
  color: var(--k-text-normal, inherit);
  background: var(--k-input-bg, transparent);
  border: 1px solid var(--k-card-border, rgba(127, 127, 127, 0.35));
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 14px;
}

.plugin-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}

.checkbox-item:hover {
  background: color-mix(in srgb, var(--k-card-border, #888) 15%, transparent);
}

.checkbox-item input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  flex-shrink: 0;
}

.checkbox-item span {
  color: var(--k-text-normal, inherit);
  font-size: 14px;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--k-text-secondary, #888);
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--k-card-border, rgba(127, 127, 127, 0.2));
}

.btn {
  padding: 6px 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  transition: opacity 0.15s;
}

.btn:hover {
  opacity: 0.85;
}

.btn-cancel {
  background: transparent;
  color: var(--k-text-normal, inherit);
  border: 1px solid var(--k-card-border, rgba(127, 127, 127, 0.35));
}

.btn-confirm {
  background: var(--k-color-primary, #4f7cff);
  color: #fff;
}
</style>
