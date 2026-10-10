import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { learningPlanSchema, versionLearningPlan, learningCompletion } from '@/lib/learning-plan';
const bodySchema = z.discriminatedUnion('action', [
 z.object({action:z.literal('save'),skill:z.string().trim().min(1).max(200),category:z.enum(['technical','soft','domain']),plan:learningPlanSchema,requestId:z.string().uuid(),applicationId:z.string().regex(/^[\w-]{1,120}$/).nullable().optional()}),
 z.object({action:z.literal('progress'),skill:z.string().trim().min(1).max(200),planVersion:z.string().min(1).max(160),dayId:z.string().max(200).optional(),complete:z.boolean()}),
]);
export async function POST(req: NextRequest) {
 const guard=await guardApiRoute(req,{rateLimit:30,rateLimitWindow:60000});if(guard.error)return guard.error;
 if(guard.user.tier==='free')return NextResponse.json({error:'Saving plans and progress is a Standard feature.'},{status:403});
 const parsed=bodySchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'The learning plan is incomplete. No progress was changed.'},{status:400});
 try {
  const input=parsed.data;const db=getAdminDb();const skillId=input.skill.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  if(!skillId)return NextResponse.json({error:'Invalid skill'},{status:400});
  const user=db.collection('users').doc(guard.user.uid);const ref=user.collection('study_progress').doc(skillId);
  if(input.action==='save' && input.applicationId && !(await user.collection('applications').doc(input.applicationId).get()).exists)return NextResponse.json({error:'Application unavailable'},{status:404});
  const result=await db.runTransaction(async tx=>{
   const snapshot=await tx.get(ref);const existing=snapshot.data()||{};const now=new Date().toISOString();
   if(input.action==='save'){
    const plan=versionLearningPlan(input.plan,input.requestId);
    if(existing.plan_data?.planVersion===plan.planVersion){if(JSON.stringify(existing.plan_data)!==JSON.stringify(plan))throw Error('PLAN_CHANGED');return existing;}
    if(existing.plan_data?.schedule)tx.set(ref.collection('plan_versions').doc(existing.plan_data.planVersion || `legacy_${Date.now()}`),{plan_data:existing.plan_data,completed_task_ids:existing.completed_task_ids||[],completed_days:existing.completed_days||[],archived_at:now});
    const update={user_id:guard.user.uid,skill:input.skill,skill_id:skillId,category:input.category,plan_data:plan,total_days:plan.schedule.length,completed_task_ids:[],completed_days:[],completed_at:null,application_ids:input.applicationId?[input.applicationId]:existing.application_ids||[],started_at:existing.started_at||now,last_activity_at:now};
    tx.set(ref,update,{merge:true});return {...existing,...update};
   }
   if(!snapshot.exists || !existing.plan_data)throw Error('PLAN_MISSING');
   const plan=versionLearningPlan(existing.plan_data);if(plan.planVersion!==input.planVersion)throw Error('PLAN_CHANGED');
   const day=input.dayId?plan.schedule.find(day=>day.id===input.dayId):null;if(input.dayId&&!day)throw Error('PLAN_CHANGED');
   const ids=day?day.taskIds:plan.schedule.flatMap(day=>day.taskIds);const completed=new Set<string>(existing.completed_task_ids||[]);
   ids.forEach(id=>input.complete?completed.add(id):completed.delete(id));const completion=learningCompletion(plan,[...completed]);
   const update={plan_data:plan,...completion,completed_at:completion.completed_days.length===plan.schedule.length?now:null,last_activity_at:now};tx.set(ref,update,{merge:true});return {...existing,...update};
  });
  return NextResponse.json({success:true,progress:result});
 }catch(error){const code=error instanceof Error?error.message:'';return NextResponse.json({error:code==='PLAN_CHANGED'?'This plan changed. Reload it before marking progress.':'The plan could not be saved. Your previous plan and progress are unchanged.'},{status:code==='PLAN_CHANGED'?409:503});}
}
