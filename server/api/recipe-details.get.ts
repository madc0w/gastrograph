import { ObjectId } from 'mongodb';

type RecipeDoc = {
	_id: ObjectId;
	title?: string;
	link?: string;
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
	link: string;
	ingredients: RecipeIngredientItem[];
	directions: string[];
};

function normalizeText(value: string): string {
	return value.trim();
}

export default defineEventHandler(async (event) => {
	const db = await getMongoDb();
	const recipes = db.collection<RecipeDoc>('Recipes');

	const linkRaw = getQuery(event).link;
	const titleRaw = getQuery(event).title;
	const link = typeof linkRaw === 'string' ? normalizeText(linkRaw) : '';
	const title = typeof titleRaw === 'string' ? normalizeText(titleRaw) : '';

	if (!link && !title) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Missing link or title query parameter',
		});
	}

	const recipe = await recipes.findOne(link ? { link } : { title }, {
		projection: {
			_id: 0,
			title: 1,
			link: 1,
			directions: 1,
			ingredients: 1,
		},
	});

	if (!recipe) {
		throw createError({
			statusCode: 404,
			statusMessage: 'Recipe not found',
		});
	}

	const resolvedTitle = recipe.title?.trim() || title || '(untitled recipe)';
	const resolvedLink = recipe.link?.trim() || link;

	return {
		title: resolvedTitle,
		link: resolvedLink,
		ingredients: (recipe.ingredients ?? [])
			.map((ingredient) => ingredient.ingredient?.trim())
			.filter((ingredient): ingredient is string => Boolean(ingredient))
			.map((ingredient) => ({ ingredient })),
		directions: (recipe.directions ?? [])
			.map((direction) => direction.trim())
			.filter((direction) => Boolean(direction)),
	} satisfies RecipeDetailsResponse;
});
