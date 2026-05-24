import {
	findIngredientPaths,
	parsePathLimit,
} from '../../utils/ingredient-path-search';
import {
	completePathSearchJob,
	createPathSearchJob,
	failPathSearchJob,
} from '../../utils/path-search-jobs';

type StartPathSearchBody = {
	from?: string;
	to?: string;
	limit?: string | number;
};

export default defineEventHandler(async (event) => {
	const body = (await readBody(event)) as StartPathSearchBody;
	const fromInput = typeof body?.from === 'string' ? body.from.trim() : '';
	const toInput = typeof body?.to === 'string' ? body.to.trim() : '';
	const limitRaw =
		typeof body?.limit === 'number' || typeof body?.limit === 'string'
			? String(body.limit)
			: undefined;
	const limit = parsePathLimit(limitRaw);

	if (!fromInput || !toInput) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Select both ingredients first.',
		});
	}

	const job = createPathSearchJob();

	setTimeout(() => {
		void (async () => {
			try {
				const result = await findIngredientPaths({
					fromInput,
					toInput,
					limit,
				});
				completePathSearchJob(job.id, result);
			} catch (error: unknown) {
				failPathSearchJob(job.id, error);
			}
		})();
	}, 0);

	return {
		jobId: job.id,
		status: 'pending' as const,
	};
});
