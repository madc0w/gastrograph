import {
	findIngredientPaths,
	findIngredientPathsLegacy,
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
	mode?: 'fast' | 'legacy';
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
	const mode = body?.mode === 'legacy' ? 'legacy' : 'fast';

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
				const queryFn =
					mode === 'legacy' ? findIngredientPathsLegacy : findIngredientPaths;
				const result = await queryFn({
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
