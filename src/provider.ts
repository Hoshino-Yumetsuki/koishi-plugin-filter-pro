import { DataService } from '@koishijs/plugin-console';
import type { Context } from 'koishi';

import { cloneRule, sortRules } from './rule-utils';
import type { RuleItem, RuleState } from './types';

export class FilterProProvider extends DataService<RuleItem[]> {
  constructor(
    ctx: Context,
    private state: RuleState
  ) {
    super(ctx, 'filter-pro');
  }

  async get() {
    return sortRules(this.state.rules).map(cloneRule);
  }
}
