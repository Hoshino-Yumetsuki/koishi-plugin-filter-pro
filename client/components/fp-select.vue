<template>
  <div class="fp-select" ref="root">
    <button
      type="button"
      class="trigger"
      :class="{ disabled }"
      @click="toggle"
      :disabled="disabled"
    >
      <span class="label">{{ currentLabel || placeholder }}</span>
      <span class="arrow">▾</span>
    </button>
  </div>
  <teleport to="body">
    <div
      v-if="open"
      class="menu"
      :style="{
        left: `${menuStyle.left}px`,
        top: `${menuStyle.top}px`,
        width: `${menuStyle.width}px`
      }"
    >
      <button
        v-for="item in options"
        :key="item.value"
        type="button"
        class="item"
        :class="{ active: item.value === modelValue }"
        @click="pick(item.value)"
      >
        {{ item.label }}
      </button>
    </div>
  </teleport>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

interface OptionItem {
  label: string;
  value: string;
}

const props = defineProps<{
  modelValue: string;
  options: OptionItem[];
  placeholder?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<(e: "update:modelValue", value: string) => void>();

const root = ref<HTMLElement | null>(null);
const open = ref(false);
const menuStyle = ref({ left: 0, top: 0, width: 0 });

const currentLabel = computed(
  () => props.options.find((item) => item.value === props.modelValue)?.label || ""
);

function toggle() {
  if (props.disabled) return;
  open.value = !open.value;
  if (open.value) updateMenuPosition();
}

function pick(value: string) {
  emit("update:modelValue", value);
  open.value = false;
}

function onDocClick(event: MouseEvent) {
  const target = event.target as Node | null;
  if (!root.value || !target) return;
  if (!root.value.contains(target)) open.value = false;
}

function updateMenuPosition() {
  if (!root.value) return;
  const rect = root.value.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const menuMaxHeight = 240;
  const gap = 6;
  const belowSpace = viewportHeight - rect.bottom - gap;
  const aboveSpace = rect.top - gap;
  const showAbove = belowSpace < 180 && aboveSpace > belowSpace;
  const height = Math.min(menuMaxHeight, showAbove ? aboveSpace : belowSpace);
  menuStyle.value = {
    left: rect.left,
    width: rect.width,
    top: showAbove ? Math.max(8, rect.top - Math.max(120, height) - gap) : rect.bottom + gap
  };
}

function onWindowChange() {
  if (open.value) updateMenuPosition();
}

watch(open, (value) => {
  if (value) updateMenuPosition();
});

onMounted(() => {
  document.addEventListener("click", onDocClick);
  window.addEventListener("resize", onWindowChange);
  window.addEventListener("scroll", onWindowChange, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocClick);
  window.removeEventListener("resize", onWindowChange);
  window.removeEventListener("scroll", onWindowChange, true);
});
</script>

<style scoped>
.fp-select {
  position: relative;
  min-width: 140px;
}

.trigger {
  width: 100%;
  height: 35px;
  box-sizing: border-box;
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
}

.trigger.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu {
  position: fixed;
  z-index: 9999;
  background: var(--k-card-bg, #1e1e1e);
  border: 1px solid var(--k-card-border, rgba(127, 127, 127, 0.35));
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  max-height: 240px;
  overflow: auto;
}

.item {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--k-text-normal, inherit);
  text-align: left;
  padding: 8px 10px;
  cursor: pointer;
}

.item:hover,
.item.active {
  background: color-mix(in srgb, var(--k-color-primary, #4f7cff) 18%, transparent);
}
</style>
