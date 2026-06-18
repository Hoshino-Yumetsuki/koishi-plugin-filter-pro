import type { Awaitable } from 'koishi';

import { Config as ConfigSchema } from './schema';
import type { FilterProProvider } from './provider';
import type { Config as FilterProConfig } from './types';

export const name = 'filter-pro';
export const reusable = true;
export const filter = false;

export { apply } from './apply';

export interface Config extends FilterProConfig {}
export const Config = ConfigSchema;

export type {
  RuleAction,
  RuleMode,
  GroupOperator,
  CompareOperator,
  TargetType,
  RuleTarget,
  GroupExpr,
  NotExpr,
  CompareExpr,
  RuleExpr,
  RuleItem
} from './types';

declare module '@koishijs/plugin-console' {
  namespace Console {
    interface Services {
      'filter-pro': FilterProProvider;
    }

    interface Events {
      'filter-pro/list': () => Awaitable<import('./types').RuleItem[]>;
      'filter-pro/targets': () => Awaitable<import('./types').PluginTargetOption[]>;
      'filter-pro/commands': () => Awaitable<import('./types').CommandOption[]>;
      'filter-pro/create': (
        input: import('./types').RuleInput
      ) => Awaitable<import('./types').RuleItem>;
      'filter-pro/update': (
        input: import('./types').RuleInput
      ) => Awaitable<import('./types').RuleItem | null>;
      'filter-pro/delete': (id: string) => Awaitable<boolean>;
      'filter-pro/reorder': (ids: string[]) => Awaitable<import('./types').RuleItem[]>;
      'filter-pro/toggle': (payload: {
        id: string;
        enabled: boolean;
      }) => Awaitable<import('./types').RuleItem | null>;
    }
  }
}
