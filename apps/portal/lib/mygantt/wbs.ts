import type { Task } from './types';

/** Assign WBS codes from flat list + indent levels. */
export function assignWbs(tasks: Pick<Task, 'level'>[]): string[] {
  const counters: number[] = [];
  return tasks.map((task) => {
    const level = Math.max(0, task.level);
    while (counters.length > level + 1) counters.pop();
    while (counters.length < level + 1) counters.push(0);
    counters[level] += 1;
    for (let i = level + 1; i < counters.length; i++) counters[i] = 0;
    return counters.slice(0, level + 1).join('.');
  });
}

/** Index of last descendant (inclusive). If no children, returns index. */
export function subtreeEnd(tasks: Pick<Task, 'level'>[], index: number): number {
  const level = tasks[index].level;
  let end = index;
  for (let i = index + 1; i < tasks.length; i++) {
    if (tasks[i].level <= level) break;
    end = i;
  }
  return end;
}

export function isParentTask(tasks: Pick<Task, 'level'>[], index: number): boolean {
  return index + 1 < tasks.length && tasks[index + 1].level > tasks[index].level;
}

/** Immediate child indices of task at index */
export function directChildIndices(tasks: Pick<Task, 'level'>[], index: number): number[] {
  const parentLevel = tasks[index].level;
  const children: number[] = [];
  for (let i = index + 1; i < tasks.length; i++) {
    if (tasks[i].level <= parentLevel) break;
    if (tasks[i].level === parentLevel + 1) children.push(i);
  }
  return children;
}
