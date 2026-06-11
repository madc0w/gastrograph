import type { GraphProgressStage } from '../../utils/graph-build';
import { buildIngredientGraph } from '../../utils/graph-build';
import {
	completeGraphSearchJob,
	createGraphSearchJob,
	failGraphSearchJob,
	updateGraphSearchJobProgress,
} from '../../utils/graph-search-jobs';

type StartGraphSearchBody = {
	ingredient?: string;
};

export default defineEventHandler(async (event) => {
	const body = (await readBody(event)) as StartGraphSearchBody;
	const ingredientInput =
		typeof body?.ingredient === 'string' ? body.ingredient.trim() : '';

	if (!ingredientInput) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Type an ingredient name first.',
		});
	}

	const job = createGraphSearchJob();

	setTimeout(() => {
		void (async () => {
			let latestProgress = 0;
			let latestStage: GraphProgressStage = 'validating';
			let latestMessage = 'Queued';
			const startedAt = Date.now();
			const heartbeat = setInterval(() => {
				if (latestStage !== 'counting-links') {
					return;
				}

				const elapsedSeconds = Math.max(
					1,
					Math.floor((Date.now() - startedAt) / 1000),
				);

				updateGraphSearchJobProgress(job.id, {
					progress: latestProgress,
					stage: latestStage,
					message: `${latestMessage} (still running, ${elapsedSeconds}s elapsed)`,
				});
			}, 1200);

			try {
				const result = await buildIngredientGraph({
					ingredientInput,
					onProgress: (update) => {
						latestProgress = update.progress;
						latestStage = update.stage;
						latestMessage = update.message;
						updateGraphSearchJobProgress(job.id, update);
					},
				});
				completeGraphSearchJob(job.id, result);
			} catch (error: unknown) {
				failGraphSearchJob(job.id, error);
			} finally {
				clearInterval(heartbeat);
			}
		})();
	}, 0);

	return {
		jobId: job.id,
		status: 'pending' as const,
	};
});
