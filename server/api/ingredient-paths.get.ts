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
	recipeTitle: string;
};

type IngredientNeighbor = {
	id: ObjectId;
	name: string;
	recipeTitle: string;
	count: number;
};

type PathState = {
	ingredientIds: ObjectId[];
	ingredientNames: string[];
	recipeChain: string[];
};

function normalizeIngredientName(value: string): string {
	return value
		.replace(/\([^)]*\)/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function parseLimit(input: unknown): number {
	if (typeof input !== 'string') {
		return 8;
	}

	const parsed = Number.parseInt(input, 10);
	if (!Number.isFinite(parsed)) {
		return 8;
	}

	return Math.max(1, Math.min(8, parsed));
}

export default defineEventHandler(async (event) => {
	const db = await getMongoDb();
	const ingredients = db.collection<IngredientDoc>('Ingedients');
	const recipes = db.collection<RecipeDoc>('Recipes');

	const fromRaw = getQuery(event).from;
	const toRaw = getQuery(event).to;
	const fromInput = typeof fromRaw === 'string' ? fromRaw.trim() : '';
	const toInput = typeof toRaw === 'string' ? toRaw.trim() : '';
	const limit = parseLimit(getQuery(event).limit);

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
	const seenRecipeChains = new Set<string>();
	const foundPaths: Array<{
		ingredientChain: string[];
		recipeChain: string[];
		hops: number;
	}> = [];

	while (queue.length > 0 && foundPaths.length < limit) {
		const state = queue.shift();
		if (!state) {
			break;
		}

		const hops = state.recipeChain.length;
		const currentIngredientId =
			state.ingredientIds[state.ingredientIds.length - 1];

		if (String(currentIngredientId) === String(toIngredient._id)) {
			const chainKey = state.recipeChain.join('\u0000');
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
				recipeChain: [...state.recipeChain, neighbor.recipeTitle],
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
});
