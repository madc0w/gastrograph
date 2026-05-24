import { getPathSearchJob } from '../../utils/path-search-jobs';

export default defineEventHandler((event) => {
	const jobIdRaw = getQuery(event).jobId;
	const jobId = typeof jobIdRaw === 'string' ? jobIdRaw.trim() : '';

	if (!jobId) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Missing jobId query parameter',
		});
	}

	const job = getPathSearchJob(jobId);
	if (!job) {
		throw createError({
			statusCode: 404,
			statusMessage: 'Path search job not found or expired.',
		});
	}

	if (job.status === 'done') {
		return {
			status: 'done' as const,
			result: job.result,
		};
	}

	if (job.status === 'error') {
		return {
			status: 'error' as const,
			error: job.error || 'Path search failed.',
		};
	}

	return {
		status: 'pending' as const,
	};
});
