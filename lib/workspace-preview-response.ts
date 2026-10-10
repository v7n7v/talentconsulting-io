import { jobSupplyUnavailableRecovery } from '@/lib/job-discovery-recovery';
import {NextResponse, type NextRequest} from 'next/server';
import {getDemoAgentQueue, getDemoIntelligenceResponse, getDemoJobApplications} from './demo-mode';
import {isIsolatedWorkspacePreview, readWorkspacePreviewScenario} from './workspace-preview';
import { computeApplicationMetrics, normalizeApplicationRecord, applicationWasSubmitted, applicationReachedInterview, applicationReachedOffer } from './application-records';

/** Intercept every API before routing in the isolated preview. No fallthrough. */
export function workspacePreviewResponse(request: NextRequest): NextResponse | null {
  if (!isIsolatedWorkspacePreview()) return null;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(request.nextUrl.hostname)) return new NextResponse('Local preview only', {status:403});
  if (!request.nextUrl.pathname.startsWith('/api/')) return null;
  const path = request.nextUrl.pathname;
  const scenario = readWorkspacePreviewScenario(request.cookies.get('taco-preview-state')?.value);
  const json = (data: unknown, status = 200) => NextResponse.json(data, {status, headers:{'Cache-Control':'no-store','X-Taco-Preview':'fixture'}});
  // Read-only fictional cohorts exercise the same normalizer as real summaries.
  // Mutations and all non-allowlisted APIs still fail closed below.
  if (request.method === 'GET' && (path === '/api/agent/quality' || path === '/api/agent/pulse')) {
    if (scenario === 'partial') return json({error:'Preview: application summaries unavailable'},503);
    const applications = scenario === 'new' ? [] : getDemoJobApplications().map(item => normalizeApplicationRecord(item));
    const metrics = computeApplicationMetrics(applications, getDemoAgentQueue());
    if (path.endsWith('/quality')) return json({...metrics, complete:true, recordLimit:5000});
    const submitted = applications.filter(applicationWasSubmitted);
    return json({pulse:{totalApps:applications.length,appliedApps:submitted.length,thisWeekApps:metrics.weeklyVelocity,
      responded:submitted.filter(item => item.outcome_response && item.outcome_response !== 'ghosted').length,
      interviews:submitted.filter(applicationReachedInterview).length,offers:submitted.filter(applicationReachedOffer).length,
      weeklyRate:null,complete:true,unknownSubmissionDates:metrics.unknownSubmissionDates,
      staleApps:[],followUps:[],upcomingInterviews:applications.filter(item => item.status==='interview_scheduled').map(item => ({company:item.company,role:item.role,date:item.interview_date || null})),moraleHistory:[],
    }});
  }
  if (path === '/api/agent/intelligence') {
    if (scenario === 'partial') return json({error:'Preview: career context unavailable'},503);
    if (scenario === 'new') return json({profile:null,twin:null,recommendations:[],summary:''});
    const data = getDemoIntelligenceResponse();
    if (scenario === 'active') {
      data.twin.memory.activeSearch.queuedApplications = 0;
      data.twin.memory.activeSearch.totalApplications = 0;
      data.twin.memory.activeSearch.staleApplications = 0;
      data.twin.memory.nextBestActions = [];
    }
    return json(data);
  }
  if (path === '/api/jobs/suggestions' && scenario === 'new') return json({success:true,needsSetup:true,jobs:[]});
  if (path === '/api/jobs/search' && scenario === 'partial') return json({success:false,error:'Preview: job sources are temporarily unavailable',recovery:jobSupplyUnavailableRecovery('search'),code:'search_supply_unavailable',retryable:true},503);
  if (path === '/api/jobs/search' || path === '/api/jobs/suggestions') return json({success:true,query:request.nextUrl.searchParams.get('query') || '',location:request.nextUrl.searchParams.get('location') || '',scoreResumeId:null,jobs:getDemoAgentQueue().map(item => ({
    id:item.id,title:item.job_title,company:item.company,location:item.location,salary:item.salary,
    description:item.job_description,skills:['TypeScript','React'],url:item.job_url,postedDate:item.posted_date,
    source:'Fictional preview',sourceMeta:{sourceType:'fixture',sourceName:'Fictional preview',sourceConfidence:'low'},
    recommendationReason:'Illustrative role for reviewing the workspace layout.',
    fitReasons:['TypeScript appears in the example source.'],riskNotes:['Confirm the requirements in the original posting.'],
    preparationEligible:false,outboundLinkVerified:false,nextAction:'Review the example',
  }))});
  if (path === '/api/agent/chat') return json({conversations:[],messages:[]});
  if (path === '/api/vault/list') return json({success:true,items:[],entries:[]});
  if (path === '/api/agent/debriefs') return scenario === 'partial' ? json({error:'Preview: debriefs unavailable'},503) : json({success:true,debriefs:[]});
  if (path === '/api/jobs/subscribe') return json({success:true,subscribed:false,enabled:false});
  if (request.method === 'GET' && path === '/api/jobs/preferences') return json({success:true,isNew:scenario === 'new',preferences:scenario === 'new' ? null : {targetRoles:['Product Engineer'],preferredCities:['Remote'],remotePref:'remote'}});
  if (path === '/api/usage') return json({tier:'studio',usage:{},caps:null});
  if (path === '/api/billing/prices') return json({available:false,prices:[],preview:true});
  return json({success:false,error:'This action is disabled in the isolated local preview. No external service was called.',code:'ISOLATED_PREVIEW',retryable:false},503);
}
