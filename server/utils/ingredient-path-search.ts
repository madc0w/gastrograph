import { ObjectId } from 'mongodb';

type IngredientDoc = {
	_id: ObjectId;
	name: string;
	type?: string;
};

type RecipeDoc = {
	_id: ObjectId;
	title?: string;
	ingredients?: Array<{
		ingedientId?: ObjectId;
	}>;
};

type NeighborAgg = {
	_id: ObjectId;
	count: number;
	recipeTitle?: string;
};

type LegacyNeighborAgg = {
	_id: ObjectId;
	count: number;
	recipe: {
		title?: string;
	};
};

type IngredientNeighbor = {
	id: ObjectId;
	name: string;
	recipeTitle: string;
	count: number;
};

type PathRecipeStep = {
	title: string;
};

type PathState = {
	ingredientIds: ObjectId[];
	ingredientNames: string[];
	recipeChain: PathRecipeStep[];
};

type DirectPathAgg = {
	title?: string;
};

export type IngredientPath = {
	ingredientChain: string[];
	recipeChain: PathRecipeStep[];
	hops: number;
};

export type IngredientPathResponse = {
	from: {
		id: string;
		name: string;
	};
	to: {
		id: string;
		name: string;
	};
	paths: IngredientPath[];
};

export function normalizeIngredientName(value: string): string {
	return value
		.replace(/\([^)]*\)/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

export function parsePathLimit(input: unknown): number {
	if (typeof input !== 'string') {
		return 8;
	}

	const parsed = Number.parseInt(input, 10);
	if (!Number.isFinite(parsed)) {
		return 8;
	}

	return Math.max(1, Math.min(8, parsed));
}

export async function findIngredientPaths(input: {
	fromInput: string;
	toInput: string;
	limit: number;
}): Promise<IngredientPathResponse> {
	const db = await getMongoDb();
	const ingredients = db.collection<IngredientDoc>('Ingredients');
	const recipes = db.collection<RecipeDoc>('Recipes');

	const fromInput = input.fromInput.trim();
	const toInput = input.toInput.trim();
	const limit = Math.max(1, Math.min(8, input.limit));

	if (!fromInput || !toInput) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Missing from or to ingredient query parameter',
		});
	}

	const fromNormalized = normalizeIngredientName(fromInput);
	const toNormalized = normalizeIngredientName(toInput);

	const [fromIngredient, toIngredient] = await Promise.all([
		ingredients.findOne({ name: fromNormalized }),
		ingredients.findOne({ name: toNormalized }),
	]);

	if (!fromIngredient) {
		throw createError({
			statusCode: 404,
			statusMessage: `Ingredient not found: ${fromInput}`,
		});
	}

	if (!toIngredient) {
		throw createError({
			statusCode: 404,
			statusMessage: `Ingredient not found: ${toInput}`,
		});
	}

	if (String(fromIngredient._id) === String(toIngredient._id)) {
		return {
			from: {
				id: String(fromIngredient._id),
				name: fromIngredient.name,
			},
			to: {
				id: String(toIngredient._id),
				name: toIngredient.name,
			},
			paths: [],
		};
	}

	const neighborCache = new Map<string, IngredientNeighbor[]>();
	const maxHops = 5;
	const maxBranch = 12;
	const maxQueue = 2500;
	const maxRuntimeMs = 5000;
	const startedAt = Date.now();

	const directPaths = (await recipes
		.aggregate<DirectPathAgg>([
			{
				$match: {
					ingredients: {
						$all: [
							{ $elemMatch: { ingedientId: fromIngredient._id } },
							{ $elemMatch: { ingedientId: toIngredient._id } },
						],
					},
				},
			},
			{ $project: { _id: 0, title: 1 } },
			{ $sort: { title: 1 } },
			{ $limit: limit },
		])
		.toArray()) as DirectPathAgg[];

	if (directPaths.length > 0) {
		return {
			from: {
				id: String(fromIngredient._id),
				name: fromIngredient.name,
			},
			to: {
				id: String(toIngredient._id),
				name: toIngredient.name,
			},
			paths: directPaths.map((recipe) => ({
				ingredientChain: [fromIngredient.name, toIngredient.name],
				recipeChain: [
					{
						title: recipe.title?.trim() || '(untitled recipe)',
					},
				],
				hops: 1,
			})),
		};
	}

	const getNeighbors = async (
		ingredientId: ObjectId,
	): Promise<IngredientNeighbor[]> => {
		const idKey = String(ingredientId);
		const cached = neighborCache.get(idKey);
		if (cached) {
			return cached;
		}

		const pairs = (await recipes
			.aggregate<NeighborAgg>([
				{
					$match: {
						'ingredients.ingedientId': ingredientId,
					},
				},
				{
					$project: {
						title: 1,
						ingredients: 1,
					},
				},
				{ $unwind: '$ingredients' },
				{
					$match: {
						'ingredients.ingedientId': { $ne: ingredientId },
					},
				},
				{
					$group: {
						_id: '$ingredients.ingedientId',
						count: { $sum: 1 },
						recipeTitle: { $min: '$title' },
					},
				},
				{ $sort: { count: -1 } },
				{ $limit: 200 },
			])
			.toArray()) as NeighborAgg[];

		const neighborIds = pairs.map((pair) => pair._id);
		const neighborDocs = neighborIds.length
			? await ingredients
					.find({ _id: { $in: neighborIds } }, { projection: { name: 1 } })
					.toArray()
			: [];

		const neighborNameById = new Map<string, string>();
		for (const doc of neighborDocs) {
			neighborNameById.set(String(doc._id), doc.name);
		}

		const neighbors = pairs
			.map((pair): IngredientNeighbor | null => {
				const name = neighborNameById.get(String(pair._id));
				if (!name) {
					return null;
				}

				return {
					id: pair._id,
					name,
					recipeTitle: pair.recipeTitle?.trim() || '(untitled recipe)',
					count: pair.count,
				};
			})
			.filter((neighbor): neighbor is IngredientNeighbor => Boolean(neighbor))
			.sort((left, right) => {
				if (left.count !== right.count) {
					return right.count - left.count;
				}
				return left.name.localeCompare(right.name);
			});

		neighborCache.set(idKey, neighbors);
		return neighbors;
	};

	const queue: PathState[] = [
		{
			ingredientIds: [fromIngredient._id],
			ingredientNames: [fromIngredient.name],
			recipeChain: [],
		},
	];
	let queueIndex = 0;
	const queuedAtDepth = new Set<string>([`${String(fromIngredient._id)}|0`]);
	const seenRecipeChains = new Set<string>();
	const foundPaths: IngredientPath[] = [];

	while (queueIndex < queue.length && foundPaths.length < limit) {
		if (Date.now() - startedAt > maxRuntimeMs) {
			break;
		}

		const state = queue[queueIndex];
		queueIndex += 1;

		const hops = state.recipeChain.length;
		const currentIngredientId =
			state.ingredientIds[state.ingredientIds.length - 1];

		if (String(currentIngredientId) === String(toIngredient._id)) {
			const chainKey = state.recipeChain
				.map((step) => step.title)
				.join('\u0000');
			if (!seenRecipeChains.has(chainKey)) {
				seenRecipeChains.add(chainKey);
				foundPaths.push({
					ingredientChain: state.ingredientNames,
					recipeChain: state.recipeChain,
					hops,
				});
			}
			continue;
		}

		if (hops >= maxHops || queue.length - queueIndex > maxQueue) {
			continue;
		}

		const neighbors = await getNeighbors(currentIngredientId);
		for (const neighbor of neighbors.slice(0, maxBranch)) {
			const neighborIdString = String(neighbor.id);
			const alreadyVisited = state.ingredientIds.some(
				(id) => String(id) === neighborIdString,
			);
			if (alreadyVisited) {
				continue;
			}

			const nextHops = hops + 1;
			const depthKey = `${neighborIdString}|${nextHops}`;
			if (queuedAtDepth.has(depthKey)) {
				continue;
			}
			queuedAtDepth.add(depthKey);

			queue.push({
				ingredientIds: [...state.ingredientIds, neighbor.id],
				ingredientNames: [...state.ingredientNames, neighbor.name],
				recipeChain: [
					...state.recipeChain,
					{
						title: neighbor.recipeTitle,
					},
				],
			});
		}
	}

	return {
		from: {
			id: String(fromIngredient._id),
			name: fromIngredient.name,
		},
		to: {
			id: String(toIngredient._id),
			name: toIngredient.name,
		},
		paths: foundPaths,
	};
}

export async function findIngredientPathsLegacy(input: {
	fromInput: string;
	toInput: string;
	limit: number;
}): Promise<IngredientPathResponse> {
	const db = await getMongoDb();
	const ingredients = db.collection<IngredientDoc>('Ingredients');
	const recipes = db.collection<RecipeDoc>('Recipes');

	const fromInput = input.fromInput.trim();
	const toInput = input.toInput.trim();
	const limit = Math.max(1, Math.min(8, input.limit));

	if (!fromInput || !toInput) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Missing from or to ingredient query parameter',
		});
	}

	const fromNormalized = normalizeIngredientName(fromInput);
	const toNormalized = normalizeIngredientName(toInput);

	const [fromIngredient, toIngredient] = await Promise.all([
		ingredients.findOne({ name: fromNormalized }),
		ingredients.findOne({ name: toNormalized }),
	]);

	if (!fromIngredient) {
		throw createError({
			statusCode: 404,
			statusMessage: `Ingredient not found: ${fromInput}`,
		});
	}

	if (!toIngredient) {
		throw createError({
			statusCode: 404,
			statusMessage: `Ingredient not found: ${toInput}`,
		});
	}

	if (String(fromIngredient._id) === String(toIngredient._id)) {
		return {
			from: {
				id: String(fromIngredient._id),
				name: fromIngredient.name,
			},
			to: {
				id: String(toIngredient._id),
				name: toIngredient.name,
			},
			paths: [],
		};
	}

	const neighborCache = new Map<string, IngredientNeighbor[]>();
	const maxHops = 6;
	const maxBranch = 24;
	const maxQueue = 12000;

	const getNeighbors = async (
		ingredientId: ObjectId,
	): Promise<IngredientNeighbor[]> => {
		const idKey = String(ingredientId);
		const cached = neighborCache.get(idKey);
		if (cached) {
			return cached;
		}

		const pairs = (await recipes
			.aggregate<LegacyNeighborAgg>([
				{
					$match: {
						'ingredients.ingedientId': ingredientId,
					},
				},
				{
					$project: {
						title: 1,
						ingredients: 1,
					},
				},
				{ $unwind: '$ingredients' },
				{
					$match: {
						'ingredients.ingedientId': { $ne: ingredientId },
					},
				},
				{
					$sort: {
						title: 1,
					},
				},
				{
					$group: {
						_id: '$ingredients.ingedientId',
						count: { $sum: 1 },
						recipe: {
							$first: {
								title: '$title',
							},
						},
					},
				},
				{ $sort: { count: -1 } },
				{ $limit: 200 },
			])
			.toArray()) as LegacyNeighborAgg[];

		const neighborIds = pairs.map((pair) => pair._id);
		const neighborDocs = neighborIds.length
			? await ingredients
					.find({ _id: { $in: neighborIds } }, { projection: { name: 1 } })
					.toArray()
			: [];

		const neighborNameById = new Map<string, string>();
		for (const doc of neighborDocs) {
			neighborNameById.set(String(doc._id), doc.name);
		}

		const neighbors = pairs
			.map((pair): IngredientNeighbor | null => {
				const name = neighborNameById.get(String(pair._id));
				if (!name) {
					return null;
				}

				return {
					id: pair._id,
					name,
					recipeTitle: pair.recipe.title?.trim() || '(untitled recipe)',
					count: pair.count,
				};
			})
			.filter((neighbor): neighbor is IngredientNeighbor => Boolean(neighbor))
			.sort((left, right) => {
				if (left.count !== right.count) {
					return right.count - left.count;
				}
				return left.name.localeCompare(right.name);
			});

		neighborCache.set(idKey, neighbors);
		return neighbors;
	};

	const queue: PathState[] = [
		{
			ingredientIds: [fromIngredient._id],
			ingredientNames: [fromIngredient.name],
			recipeChain: [],
		},
	];
	const seenRecipeChains = new Set<string>();
	const foundPaths: IngredientPath[] = [];

	while (queue.length > 0 && foundPaths.length < limit) {
		const state = queue.shift();
		if (!state) {
			break;
		}

		const hops = state.recipeChain.length;
		const currentIngredientId =
			state.ingredientIds[state.ingredientIds.length - 1];

		if (String(currentIngredientId) === String(toIngredient._id)) {
			const chainKey = state.recipeChain
				.map((step) => step.title)
				.join('\u0000');
			if (!seenRecipeChains.has(chainKey)) {
				seenRecipeChains.add(chainKey);
				foundPaths.push({
					ingredientChain: state.ingredientNames,
					recipeChain: state.recipeChain,
					hops,
				});
			}
			continue;
		}

		if (hops >= maxHops || queue.length > maxQueue) {
			continue;
		}

		const neighbors = await getNeighbors(currentIngredientId);
		for (const neighbor of neighbors.slice(0, maxBranch)) {
			const neighborIdString = String(neighbor.id);
			const alreadyVisited = state.ingredientIds.some(
				(id) => String(id) === neighborIdString,
			);
			if (alreadyVisited) {
				continue;
			}

			queue.push({
				ingredientIds: [...state.ingredientIds, neighbor.id],
				ingredientNames: [...state.ingredientNames, neighbor.name],
				recipeChain: [
					...state.recipeChain,
					{
						title: neighbor.recipeTitle,
					},
				],
			});
		}
	}

	return {
		from: {
			id: String(fromIngredient._id),
			name: fromIngredient.name,
		},
		to: {
			id: String(toIngredient._id),
			name: toIngredient.name,
		},
		paths: foundPaths,
	};
}
