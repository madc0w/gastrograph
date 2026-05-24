import { ObjectId } from 'mongodb';

type RecipeTitleDoc = {
	title: string;
	ingredients?: Array<{
		ingedientId?: ObjectId;
	}>;
};

type RecipeListItem = {
	title: string;
	containsCurrentIngredient: boolean;
};

export default defineEventHandler(async (event) => {
	const db = await getMongoDb();
	const recipes = db.collection<RecipeTitleDoc>('Recipes');

	const ingredientIdRaw = getQuery(event).ingredientId;
	const ingredientId =
		typeof ingredientIdRaw === 'string' ? ingredientIdRaw.trim() : '';
	const currentIngredientIdRaw = getQuery(event).currentIngredientId;
	const currentIngredientId =
		typeof currentIngredientIdRaw === 'string'
			? currentIngredientIdRaw.trim()
			: '';

	if (!ingredientId) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Missing ingredientId query parameter',
		});
	}

	let objectId: ObjectId;
	try {
		objectId = new ObjectId(ingredientId);
	} catch {
		throw createError({
			statusCode: 400,
			statusMessage: 'Invalid ingredientId',
		});
	}

	let currentObjectId: ObjectId | null = null;
	if (currentIngredientId) {
		try {
			currentObjectId = new ObjectId(currentIngredientId);
		} catch {
			throw createError({
				statusCode: 400,
				statusMessage: 'Invalid currentIngredientId',
			});
		}
	}

	const docs = await recipes
		.find(
			{ 'ingredients.ingedientId': objectId },
			{ projection: { _id: 0, title: 1, ingredients: 1 } },
		)
		.sort({ title: 1 })
		.toArray();

	const titles = docs
		.map((doc): RecipeListItem | null => {
			const title = doc.title?.trim();
			if (!title) {
				return null;
			}

			const containsCurrentIngredient =
				currentObjectId === null ||
				String(currentObjectId) === ingredientId ||
				Boolean(
					doc.ingredients?.some(
						(ingredient) =>
							ingredient.ingedientId &&
							String(ingredient.ingedientId) === String(currentObjectId),
					),
				);

			return {
				title,
				containsCurrentIngredient,
			};
		})
		.filter((item): item is RecipeListItem => Boolean(item))
		.sort((left, right) => {
			if (left.containsCurrentIngredient !== right.containsCurrentIngredient) {
				return left.containsCurrentIngredient ? -1 : 1;
			}

			return left.title.localeCompare(right.title);
		});

	return {
		ingredientId,
		titles,
	};
});
