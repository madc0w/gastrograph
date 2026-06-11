import { ObjectId } from 'mongodb';
import { getMongoDb } from './mongodb';

export type GraphApiNode = {
	id: string;
	label: string;
	type: string;
	isCenter: boolean;
	count: number;
};

export type GraphApiLink = {
	source: string;
	target: string;
	weight: number;
};

export type GraphResponse = {
	center: {
		id: string;
		name: string;
		type: string;
		recipeCount: number;
	};
	nodes: GraphApiNode[];
	links: GraphApiLink[];
};

type IngredientDoc = {
	_id: ObjectId;
	name: string;
	type: string;
};

type PairCountDoc = {
	_id: ObjectId;
	count: number;
};

type RecipeIdDoc = {
	_id: ObjectId;
};

export type GraphProgressStage =
	| 'validating'
	| 'resolving-center'
	| 'counting-links'
	| 'loading-neighbors'
	| 'counting-recipes'
	| 'assembling'
	| 'complete';

export type GraphProgressUpdate = {
	progress: number;
	stage: GraphProgressStage;
	message: string;
};

export function normalizeIngredientName(value: string): string {
	return value
		.replace(/\([^)]*\)/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function emitProgress(
	onProgress: ((update: GraphProgressUpdate) => void) | undefined,
	update: GraphProgressUpdate,
): void {
	onProgress?.(update);
}

function formatEta(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) {
		return 'estimating...';
	}

	const rounded = Math.ceil(seconds);
	const hours = Math.floor(rounded / 3600);
	const minutes = Math.floor((rounded % 3600) / 60);
	const secs = rounded % 60;

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	} else if (minutes > 0) {
		return `${minutes}m ${secs}s`;
	} else {
		return `${secs}s`;
	}
}

async function countCoIngredientsWithProgress(params: {
	recipes: ReturnType<Awaited<ReturnType<typeof getMongoDb>>['collection']>;
	centerId: ObjectId;
	recipeCountForCenter: number;
	onProgress?: (update: GraphProgressUpdate) => void;
}): Promise<PairCountDoc[]> {
	const { recipes, centerId, recipeCountForCenter, onProgress } = params;

	const counts = new Map<string, PairCountDoc>();
	const batchSize = 4000;
	const idsBatch: ObjectId[] = [];
	let processedRecipes = 0;
	const startedAtMs = Date.now();

	const idCursor = recipes.find<RecipeIdDoc>(
		{
			'ingredients.ingedientId': centerId,
		},
		{
			projection: { _id: 1 },
		},
	);
	idCursor.batchSize(batchSize);

	const mergeChunkCounts = async (recipeIds: ObjectId[]): Promise<void> => {
		if (!recipeIds.length) {
			return;
		}

		const chunkCounts = (await recipes
			.aggregate<PairCountDoc>(
				[
					{ $match: { _id: { $in: recipeIds } } },
					{
						$project: {
							ingredientIds: '$ingredients.ingedientId',
						},
					},
					{ $unwind: '$ingredientIds' },
					{ $match: { ingredientIds: { $ne: centerId } } },
					{
						$group: {
							_id: '$ingredientIds',
							count: { $sum: 1 },
						},
					},
				],
				{ allowDiskUse: true },
			)
			.toArray()) as PairCountDoc[];

		for (const item of chunkCounts) {
			const key = String(item._id);
			const existing = counts.get(key);
			if (existing) {
				existing.count += item.count;
			} else {
				counts.set(key, { _id: item._id, count: item.count });
			}
		}

		processedRecipes += recipeIds.length;
		const cappedProcessed = Math.min(processedRecipes, recipeCountForCenter);
		const ratio =
			recipeCountForCenter > 0 ? cappedProcessed / recipeCountForCenter : 1;
		const progress = Math.min(64, 42 + Math.floor(ratio * (64 - 42)));
		const elapsedSeconds = Math.max(1, (Date.now() - startedAtMs) / 1000);
		const rate = cappedProcessed / elapsedSeconds;
		const remaining = Math.max(0, recipeCountForCenter - cappedProcessed);
		const etaSeconds = rate > 0 ? remaining / rate : Number.POSITIVE_INFINITY;

		emitProgress(onProgress, {
			progress,
			stage: 'counting-links',
			message: `Counting co-ingredients ${cappedProcessed.toLocaleString()} / ${recipeCountForCenter.toLocaleString()} recipes, ETA ${formatEta(etaSeconds)}`,
		});
	};

	for await (const recipe of idCursor) {
		idsBatch.push(recipe._id);
		if (idsBatch.length >= batchSize) {
			await mergeChunkCounts(idsBatch.splice(0, idsBatch.length));
		}
	}

	if (idsBatch.length > 0) {
		await mergeChunkCounts(idsBatch.splice(0, idsBatch.length));
	}

	return Array.from(counts.values())
		.sort((a, b) => b.count - a.count)
		.slice(0, 40);
}

export async function buildIngredientGraph(params: {
	ingredientInput: string;
	onProgress?: (update: GraphProgressUpdate) => void;
}): Promise<GraphResponse> {
	const { ingredientInput, onProgress } = params;
	const ingredient = ingredientInput.trim();

	emitProgress(onProgress, {
		progress: 5,
		stage: 'validating',
		message: 'Validating ingredient',
	});

	if (!ingredient) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Missing ingredient query parameter',
		});
	}

	const db = await getMongoDb();
	const ingredients = db.collection<IngredientDoc>('Ingredients');
	const recipes = db.collection('Recipes');

	emitProgress(onProgress, {
		progress: 18,
		stage: 'resolving-center',
		message: 'Finding ingredient',
	});

	const normalized = normalizeIngredientName(ingredient);
	const center = await ingredients.findOne({ name: normalized });

	if (!center) {
		throw createError({
			statusCode: 404,
			statusMessage: `Ingredient not found: ${ingredient}`,
		});
	}

	emitProgress(onProgress, {
		progress: 42,
		stage: 'counting-links',
		message: 'Counting co-ingredients',
	});

	const recipeCountForCenter = await recipes.countDocuments({
		'ingredients.ingedientId': center._id,
	});

	emitProgress(onProgress, {
		progress: 42,
		stage: 'counting-links',
		message: `Counting co-ingredients 0 / ${recipeCountForCenter.toLocaleString()} recipes, ETA estimating...`,
	});

	const coIngredients = await countCoIngredientsWithProgress({
		recipes,
		centerId: center._id,
		recipeCountForCenter,
		onProgress,
	});

	const neighborIds = coIngredients.map((item) => item._id);

	emitProgress(onProgress, {
		progress: 64,
		stage: 'loading-neighbors',
		message: `Loading linked ingredient details (${coIngredients.length.toLocaleString()} links)`,
	});

	const neighborDocs = neighborIds.length
		? ((await ingredients
				.find({ _id: { $in: neighborIds } })
				.project<IngredientDoc>({ name: 1, type: 1 })
				.toArray()) as IngredientDoc[])
		: [];

	const neighborMap = new Map<string, IngredientDoc>();
	for (const doc of neighborDocs) {
		neighborMap.set(String(doc._id), doc);
	}

	emitProgress(onProgress, {
		progress: 82,
		stage: 'counting-recipes',
		message: 'Finalizing recipe count',
	});

	const recipeCount = recipeCountForCenter;

	emitProgress(onProgress, {
		progress: 92,
		stage: 'assembling',
		message: 'Building graph nodes and links',
	});

	const links: GraphApiLink[] = [];
	const nodes: GraphApiNode[] = [
		{
			id: String(center._id),
			label: center.name,
			type: center.type || 'other',
			isCenter: true,
			count: 0,
		},
	];

	for (const pair of coIngredients) {
		const id = String(pair._id);
		const neighbor = neighborMap.get(id);
		if (!neighbor) {
			continue;
		}

		nodes.push({
			id,
			label: neighbor.name,
			type: neighbor.type || 'other',
			isCenter: false,
			count: pair.count,
		});

		links.push({
			source: String(center._id),
			target: id,
			weight: pair.count,
		});
	}

	emitProgress(onProgress, {
		progress: 100,
		stage: 'complete',
		message: 'Graph ready',
	});

	return {
		center: {
			id: String(center._id),
			name: center.name,
			type: center.type || 'other',
			recipeCount,
		},
		nodes,
		links,
	};
}
