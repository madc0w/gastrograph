import { ObjectId } from 'mongodb';

type RecipeDoc = {
	_id: ObjectId;
	title?: string;
	directions?: string[];
	ingredients?: Array<{
		ingredient?: string;
		ingedientId?: ObjectId;
		quantity?: string;
	}>;
};

type RecipeIngredientItem = {
	ingredient: string;
};

type RecipeDetailsResponse = {
	title: string;
	ingredients: RecipeIngredientItem[];
	directions: string[];
};

function normalizeText(value: string): string {
	return value.trim();
}

export default defineEventHandler(async (event) => {
	const db = await getMongoDb();
	const recipes = db.collection<RecipeDoc>('Recipes');

	const titleRaw = getQuery(event).title;
	const title = typeof titleRaw === 'string' ? normalizeText(titleRaw) : '';

	if (!title) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Missing title query parameter',
		});
	}

	const recipe = await recipes.findOne(
		{ title },
		{
			projection: {
				_id: 0,
				title: 1,
				directions: 1,
				ingredients: 1,
			},
		},
	);

	if (!recipe) {
		throw createError({
			statusCode: 404,
			statusMessage: 'Recipe not found',
		});
	}

	const resolvedTitle = recipe.title?.trim() || title || '(untitled recipe)';

	return {
		title: resolvedTitle,
		ingredients: (recipe.ingredients ?? [])
			.map((ingredient) => ingredient.ingredient?.trim())
			.filter((ingredient): ingredient is string => Boolean(ingredient))
			.map((ingredient) => ({ ingredient })),
		directions: (recipe.directions ?? [])
			.map((direction) => direction.trim())
			.filter((direction) => Boolean(direction)),
	} satisfies RecipeDetailsResponse;
});
