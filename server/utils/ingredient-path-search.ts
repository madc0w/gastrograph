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
		ingredientId?: ObjectId;
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
	const maxHops = 6;
	const maxQueue = 6000;
	const maxRuntimeMs = 30000;
	const startedAt = Date.now();

	const directPaths = (await recipes
		.aggregate<DirectPathAgg>([
			{
				$match: {
					ingredients: {
						$all: [
							{
								$elemMatch: {
									$or: [
										{ ingedientId: fromIngredient._id },
										{ ingredientId: fromIngredient._id },
									],
								},
							},
							{
								$elemMatch: {
									$or: [
										{ ingedientId: toIngredient._id },
										{ ingredientId: toIngredient._id },
									],
								},
							},
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
						$or: [
							{ 'ingredients.ingedientId': ingredientId },
							{ 'ingredients.ingredientId': ingredientId },
						],
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
					$addFields: {
						ingredientNeighborId: {
							$ifNull: [
								'$ingredients.ingedientId',
								'$ingredients.ingredientId',
							],
						},
					},
				},
				{
					$match: {
						ingredientNeighborId: {
							$ne: ingredientId,
						},
					},
				},
				{
					$group: {
						_id: '$ingredientNeighborId',
						count: { $sum: 1 },
						recipeTitle: { $min: '$title' },
					},
				},
				{ $sort: { count: -1 } },
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

	const targetNeighbors = await getNeighbors(toIngredient._id);
	const targetNeighborIds = new Set<string>(
		targetNeighbors.map((neighbor) => String(neighbor.id)),
	);
	const targetNeighborById = new Map<string, IngredientNeighbor>(
		targetNeighbors.map((neighbor) => [String(neighbor.id), neighbor]),
	);
	const targetNeighborCountById = new Map<string, number>(
		targetNeighbors.map((neighbor) => [String(neighbor.id), neighbor.count]),
	);

	const fromNeighbors = await getNeighbors(fromIngredient._id);
	const twoHopPaths = fromNeighbors
		.map((neighbor) => {
			const connectorId = String(neighbor.id);
			if (
				connectorId === String(fromIngredient._id) ||
				connectorId === String(toIngredient._id)
			) {
				return null;
			}

			const targetSideNeighbor = targetNeighborById.get(connectorId);
			if (!targetSideNeighbor) {
				return null;
			}

			return {
				path: {
					ingredientChain: [
						fromIngredient.name,
						neighbor.name,
						toIngredient.name,
					],
					recipeChain: [
						{ title: neighbor.recipeTitle },
						{ title: targetSideNeighbor.recipeTitle },
					],
					hops: 2,
				} as IngredientPath,
				score: neighbor.count + targetSideNeighbor.count,
			};
		})
		.filter(
			(
				item,
			): item is {
				path: IngredientPath;
				score: number;
			} => Boolean(item),
		)
		.sort((left, right) => {
			if (left.score !== right.score) {
				return right.score - left.score;
			}
			return left.path.ingredientChain[1].localeCompare(
				right.path.ingredientChain[1],
			);
		})
		.slice(0, limit)
		.map((item) => item.path);

	if (twoHopPaths.length > 0) {
		return {
			from: {
				id: String(fromIngredient._id),
				name: fromIngredient.name,
			},
			to: {
				id: String(toIngredient._id),
				name: toIngredient.name,
			},
			paths: twoHopPaths,
		};
	}

	const prioritizeNeighbors = (
		neighbors: IngredientNeighbor[],
		currentIngredientId: ObjectId,
	): IngredientNeighbor[] => {
		const currentId = String(currentIngredientId);
		const targetId = String(toIngredient._id);

		return [...neighbors].sort((left, right) => {
			const leftId = String(left.id);
			const rightId = String(right.id);

			const leftIsTarget = leftId === targetId;
			const rightIsTarget = rightId === targetId;
			if (leftIsTarget !== rightIsTarget) {
				return leftIsTarget ? -1 : 1;
			}

			const leftBridgesToTarget =
				currentId !== targetId && targetNeighborIds.has(leftId);
			const rightBridgesToTarget =
				currentId !== targetId && targetNeighborIds.has(rightId);
			if (leftBridgesToTarget !== rightBridgesToTarget) {
				return leftBridgesToTarget ? -1 : 1;
			}

			if (leftBridgesToTarget && rightBridgesToTarget) {
				const leftTargetCount = targetNeighborCountById.get(leftId) || 0;
				const rightTargetCount = targetNeighborCountById.get(rightId) || 0;
				if (leftTargetCount !== rightTargetCount) {
					return rightTargetCount - leftTargetCount;
				}
			}

			if (left.count !== right.count) {
				return right.count - left.count;
			}

			return left.name.localeCompare(right.name);
		});
	};

	function getBranchLimit(hops: number): number {
		if (hops <= 0) {
			return 320;
		} else if (hops === 1) {
			return 120;
		} else if (hops === 2) {
			return 60;
		} else if (hops === 3) {
			return 36;
		}
		return 22;
	}

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

		const neighbors = prioritizeNeighbors(
			await getNeighbors(currentIngredientId),
			currentIngredientId,
		);
		const branchLimit = getBranchLimit(hops);
		for (const neighbor of neighbors.slice(0, branchLimit)) {
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
						$or: [
							{ 'ingredients.ingedientId': ingredientId },
							{ 'ingredients.ingredientId': ingredientId },
						],
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
					$addFields: {
						ingredientNeighborId: {
							$ifNull: [
								'$ingredients.ingedientId',
								'$ingredients.ingredientId',
							],
						},
					},
				},
				{
					$match: {
						ingredientNeighborId: {
							$ne: ingredientId,
						},
					},
				},
				{
					$sort: {
						title: 1,
					},
				},
				{
					$group: {
						_id: '$ingredientNeighborId',
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
