import { z } from 'zod';
const text = z.string().trim().min(1).max(10000);
export const learningPlanSchema = z.object({
  summary: z.string().max(20000).optional(),
  schedule: z.array(z.object({
    day: z.number().int().positive(), focus: text, timeEstimate: z.string().max(200).optional(),
    tasks: z.array(text).min(1).max(30),
    resources: z.array(z.object({ title: text, type: z.string().max(80).optional(), url: z.string().max(3000).optional().nullable(), searchFor: z.string().max(1000).optional(), description: z.string().max(10000).optional() }).passthrough()).max(30).optional(),
  }).passthrough()).min(1).max(60),
}).passthrough();
function hash(text: string) { let value = 2166136261; for (let i=0;i<text.length;i++) value=Math.imul(value ^ text.charCodeAt(i),16777619); return (value>>>0).toString(36); }
export function versionLearningPlan(raw: unknown, version?: string) {
  const plan = learningPlanSchema.parse(raw);
  const planVersion = version || (typeof plan.planVersion === 'string' ? plan.planVersion : `legacy_${hash(JSON.stringify(plan.schedule))}`);
  return { ...plan, planVersion, schedule: plan.schedule.map((day,index) => ({ ...day, id: `${planVersion}:day:${index}`, taskIds: day.tasks.map((_,taskIndex) => `${planVersion}:task:${index}:${taskIndex}`) })) };
}
export function learningCompletion(plan: ReturnType<typeof versionLearningPlan>, completedIds: unknown) {
  const validIds = new Set(plan.schedule.flatMap(day=>day.taskIds));
  const completed = new Set((Array.isArray(completedIds) ? completedIds : []).filter(id=>typeof id==='string' && validIds.has(id)));
  return { completed_task_ids: [...completed], completed_days: plan.schedule.filter(day=>day.taskIds.every(id=>completed.has(id))).map(day=>day.day) };
}
