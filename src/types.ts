export type RuleAction = 'bypass' | 'block';
export type GroupOperator = 'and' | 'or';
export type CompareOperator =
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
export type TargetType = 'global' | 'plugin' | 'command';

export interface RuleTarget {
  type: TargetType;
  value?: string | string[]; // 支持单个或多个插件/指令
}

export interface GroupExpr {
  type: 'group';
  operator: GroupOperator;
  children: RuleExpr[];
}

export interface NotExpr {
  type: 'not';
  child: RuleExpr;
}

export interface CompareExpr {
  type: 'compare';
  field: string;
  operator: CompareOperator;
  value?: unknown;
}

export type RuleExpr = GroupExpr | NotExpr | CompareExpr;

export interface RuleItem {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  action: RuleAction;
  target: RuleTarget;
  condition: RuleExpr;
  response?: string;
}

export interface Config {
  filename?: string;
  debug?: boolean;
}

export interface RuleInput {
  id?: string;
  name?: string;
  enabled?: boolean;
  priority?: number;
  action?: RuleAction;
  target?: RuleTarget;
  condition?: RuleExpr;
  response?: string;
}

export interface RuleState {
  rules: RuleItem[];
}

export type FilterFn = (session: any) => boolean;

export interface PluginTargetOption {
  key: string;
  name: string;
  ident: string;
  label: string;
}

export interface CommandOption {
  name: string;
  label: string;
}
