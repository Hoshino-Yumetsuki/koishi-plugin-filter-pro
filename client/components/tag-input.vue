<template>
  <div class="tag-input-wrap" :class="{ 'is-focused': focused }" @click="focusInput">
    <span v-for="(tag, idx) in modelValue" :key="idx" class="tag-chip">
      <span class="chip-text">{{ tag }}</span>
      <button class="chip-del" @click.stop="removeTag(idx)" tabindex="-1" title="移除">×</button>
    </span>
    <input
      ref="inputEl"
      class="tag-text-input"
      v-model="inputText"
      :placeholder="modelValue.length === 0 ? (placeholder ?? '') : ''"
      @keydown.enter.prevent="addTag"
      @keydown.backspace="onBackspace"
      @focus="focused = true"
      @blur="onBlur"
    />
    <button
      v-if="modelValue.length > 0"
      class="tag-clear-btn"
      @click.stop="clearAll"
      tabindex="-1"
      title="清空"
    >
      ×
    </button>
  </div>
</template>

<script lang="ts" setup>
import { ref } from "vue";

defineOptions({ name: "TagInput" });

const props = defineProps<{
  modelValue: string[];
  placeholder?: string;
}>();

const emit = defineEmits<(e: "update:modelValue", value: string[]) => void>();

const inputEl = ref<HTMLInputElement | null>(null);
const inputText = ref("");
const focused = ref(false);

function focusInput() {
  inputEl.value?.focus();
}

function addTag() {
  const val = inputText.value.trim();
  if (!val) return;
  if (!props.modelValue.includes(val)) {
    emit("update:modelValue", [...props.modelValue, val]);
  }
  inputText.value = "";
}

function removeTag(idx: number) {
  const next = [...props.modelValue];
  next.splice(idx, 1);
  emit("update:modelValue", next);
}

function clearAll() {
  emit("update:modelValue", []);
  inputText.value = "";
}

function onBackspace() {
  if (inputText.value === "" && props.modelValue.length > 0) {
    removeTag(props.modelValue.length - 1);
  }
}

function onBlur() {
  // 失焦时将未提交的文字自动创建为 tag
  const val = inputText.value.trim();
  if (val && !props.modelValue.includes(val)) {
    emit("update:modelValue", [...props.modelValue, val]);
  }
  inputText.value = "";
  focused.value = false;
}
</script>

<style scoped>
.tag-input-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 160px;
  min-height: 35px;
  box-sizing: border-box;
  padding: 4px 8px;
  background: var(--k-input-bg, transparent);
  border: 1px solid var(--k-card-border, rgba(127, 127, 127, 0.35));
  border-radius: 6px;
  cursor: text;
  transition: border-color 0.15s;
}

.tag-input-wrap.is-focused {
  border-color: var(--k-color-primary, #4f7cff);
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: color-mix(in srgb, var(--k-color-primary, #4f7cff) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--k-color-primary, #4f7cff) 50%, transparent);
  border-radius: 4px;
  padding: 1px 4px 1px 8px;
  font-size: 13px;
  color: var(--k-text-normal, inherit);
  white-space: nowrap;
  line-height: 1.6;
}

.chip-text {
  line-height: 1.4;
}

.chip-del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: none;
  color: var(--k-text-secondary, #888);
  cursor: pointer;
  padding: 0;
  font-size: 15px;
  border-radius: 3px;
  line-height: 1;
  flex-shrink: 0;
}

.chip-del:hover {
  background: color-mix(in srgb, #e74c3c 20%, transparent);
  color: #e74c3c;
}

.tag-text-input {
  flex: 1;
  min-width: 80px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--k-text-normal, inherit);
  font-size: 14px;
  padding: 0;
  height: 22px;
}

.tag-text-input::placeholder {
  color: var(--k-text-secondary, rgba(127, 127, 127, 0.6));
}

.tag-clear-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: none;
  color: var(--k-text-secondary, #888);
  cursor: pointer;
  padding: 0;
  font-size: 16px;
  border-radius: 50%;
  margin-left: 2px;
  flex-shrink: 0;
}

.tag-clear-btn:hover {
  background: color-mix(in srgb, currentColor 15%, transparent);
}
</style>
