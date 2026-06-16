import { readFile, writeFile } from 'node:fs/promises';

import { cloneRule, normalizeRule } from './rule-utils';
import type { RuleItem } from './types';

export async function readRules(file: string): Promise<RuleItem[] | null> {
  try {
    const raw = await readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeRule(item));
  } catch {
    return null;
  }
}

export function createPersister(file: string) {
  let queue = Promise.resolve();
  return async (rules: RuleItem[]) => {
    queue = queue
      .catch(() => {})
      .then(async () => {
        await writeFile(file, JSON.stringify(rules.map(cloneRule), null, 2), 'utf8');
      });
    await queue;
  };
}
