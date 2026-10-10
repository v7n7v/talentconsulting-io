export type InterviewApplicationRecord = {
  id: string;
  company_name?: string;
  job_title?: string;
  job_description?: string;
  resume_version_id?: string;
};

export function requestedInterviewApplicationId(value: string | null) {
  const id = value?.trim() || '';
  return id && id.length <= 200 ? id : null;
}

export function interviewContextFromApplication(application: InterviewApplicationRecord) {
  return {
    applicationId: application.id,
    company: application.company_name || '',
    role: application.job_title || '',
    jobDescription: application.job_description || '',
    resumeVersionId: application.resume_version_id || '',
  };
}
