import { getGraphSearchJob } from '../../utils/graph-search-jobs';

export default defineEventHandler((event) => {
	const jobIdRaw = getQuery(event).jobId;
	const jobId = typeof jobIdRaw === 'string' ? jobIdRaw.trim() : '';

	if (!jobId) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Missing jobId query parameter',
		});
	}

	const job = getGraphSearchJob(jobId);
	if (!job) {
		throw createError({
			statusCode: 404,
			statusMessage: 'Graph search job not found or expired.',
		});
	}

	if (job.status === 'done') {
		return {
			status: 'done' as const,
			progress: 100,
			stage: job.stage,
			message: job.message,
			result: job.result,
		};
	}

	if (job.status === 'error') {
		return {
			status: 'error' as const,
			progress: job.progress,
			stage: job.stage,
			message: job.message,
			error: job.error || 'Graph search failed.',
		};
	}

	return {
		status: 'pending' as const,
		progress: job.progress,
		stage: job.stage,
		message: job.message,
	};
});
