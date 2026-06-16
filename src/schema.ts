import { Schema } from 'koishi';

import type { Config as FilterProConfig } from './types';

export const Config: Schema<FilterProConfig> = Schema.object({
  filename: Schema.string()
    .default('rules.json')
    .description('持久化文件名（位于 data/filterpro/ 下）。'),
  debug: Schema.boolean().default(false).description('输出规则匹配调试日志。')
});
