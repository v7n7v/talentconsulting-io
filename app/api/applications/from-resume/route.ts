import crypto from 'crypto';
import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { normalizeApplicationRecord } from '@/lib/application-records';
const schema = z.object({
  companyName:z.string().trim().min(1).max(160),jobTitle:z.string().trim().max(200).optional(),jobDescription:z.string().max(50000).optional(),
  resumeVersionId:z.string().regex(/^[A-Za-z0-9_-]{1,180}$/),morphedResumeName:z.string().max(240),
  talentDensityScore:z.number().finite().min(0).max(100).optional(),gapAnalysis:z.unknown().optional(),
  applicationLink:z.union([z.literal(''),z.string().url().max(2000).refine(value=>/^https?:\/\//i.test(value))]).optional(),
}).strict();
const clean = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\s+/g,' ');
const locator = (value: unknown) => {try {const url=new URL(String(value));return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/,'')}`;} catch {return '';}};
export async function POST(req:NextRequest) {
  const guard=await guardApiRoute(req,{rateLimit:30,rateLimitWindow:60000});if(guard.error)return guard.error;
  const parsed=schema.safeParse(await req.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Check the company, role, posting link and saved resume.'},{status:400});
  const input=parsed.data;
  if(JSON.stringify(input.gapAnalysis || null).length>100000)return NextResponse.json({error:'Application context is too large.'},{status:400});
  try {
    const db=getAdminDb();const user=db.collection('users').doc(guard.user.uid);const applications=user.collection('applications');
    const identity=crypto.createHash('sha256').update(JSON.stringify([input.resumeVersionId,clean(input.companyName),clean(input.jobTitle),locator(input.applicationLink)])).digest('hex');
    const ref=applications.doc(`resume_${identity}`);
    const data=await db.runTransaction(async transaction=>{
      const [current,source]=await Promise.all([transaction.get(ref),transaction.get(user.collection('resume_versions').doc(input.resumeVersionId))]);
      if(!source.exists)throw new Error('The saved resume is unavailable for this account.');
      if(current.exists)return normalizeApplicationRecord(current.data()!,current.id);
      // Preserve a matching legacy tracker without changing its submission/history.
      const legacy=await transaction.get(applications.where('resume_version_id','==',input.resumeVersionId).limit(501));
      if(legacy.size>500)throw new Error('Open Applications to link this source; its existing history needs a narrower lookup.');
      const matching=legacy.docs.find(item=>{const record=normalizeApplicationRecord(item.data());return clean(record.company_name)===clean(input.companyName)&&clean(record.job_title)===clean(input.jobTitle)&&locator(record.application_link)===locator(input.applicationLink);});
      if(matching)return normalizeApplicationRecord(matching.data(),matching.id);
      const now=new Date().toISOString();
      const record={user_id:guard.user.uid,company_name:input.companyName,companyName:input.companyName,job_title:input.jobTitle || null,jobTitle:input.jobTitle || null,
        job_description:input.jobDescription || null,resume_version_id:input.resumeVersionId,morphed_resume_name:input.morphedResumeName,talent_density_score:input.talentDensityScore ?? null,
        gap_analysis:input.gapAnalysis ?? null,application_link:input.applicationLink || null,status:'not_applied',source:'resume_studio',packet_status:'tracker_draft',created_at:now,createdAt:now,last_updated:now,updatedAt:now,morphed_at:now};
      transaction.set(ref,record);return {id:ref.id,...record};
    });
    return NextResponse.json({success:true,data});
  } catch(error) {return NextResponse.json({error:error instanceof Error?error.message:'Tracker could not be saved. Retry with the same resume.'},{status:503});}
}
