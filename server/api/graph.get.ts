import { ObjectId } from 'mongodb';

type IngredientDoc = {
	_id: ObjectId;
	name: string;
	type: string;
};

type GraphNode = {
	id: string;
	label: string;
	type: string;
	isCenter: boolean;
	count: number;
};

type GraphLink = {
	source: string;
	target: string;
	weight: number;
};

type PairCountDoc = {
	_id: ObjectId;
	count: number;
};

function normalizeIngredientName(value: string): string {
	return value
		.replace(/\([^)]*\)/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

export default defineEventHandler(async (event) => {
	const db = await getMongoDb();
	const ingredients = db.collection<IngredientDoc>('Ingedients');
	const recipes = db.collection('Recipes');

	const ingredientRaw = getQuery(event).ingredient;
	const ingredientInput =
		typeof ingredientRaw === 'string' ? ingredientRaw.trim() : '';

	if (!ingredientInput) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Missing ingredient query parameter',
		});
	}

	const normalized = normalizeIngredientName(ingredientInput);

	const center = await ingredients.findOne({ name: normalized });

	if (!center) {
		throw createError({
			statusCode: 404,
			statusMessage: `Ingredient not found: ${ingredientInput}`,
		});
	}

	const coIngredients = (await recipes
		.aggregate<PairCountDoc>([
			{
				$match: {
					'ingredients.ingedientId': center._id,
				},
			},
			{ $unwind: '$ingredients' },
			{
				$match: {
					'ingredients.ingedientId': { $ne: center._id },
				},
			},
			{
				$group: {
					_id: '$ingredients.ingedientId',
					count: { $sum: 1 },
				},
			},
			{ $sort: { count: -1 } },
			{ $limit: 40 },
		])
		.toArray()) as PairCountDoc[];

	const neighborIds = coIngredients.map((item) => item._id);

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

	const links: GraphLink[] = [];
	const nodes: GraphNode[] = [
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

	const recipeCount = await recipes.countDocuments({
		'ingredients.ingedientId': center._id,
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
});
