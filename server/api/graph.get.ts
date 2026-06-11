import { buildIngredientGraph } from '../utils/graph-build';

export default defineEventHandler(async (event) => {
	const ingredientRaw = getQuery(event).ingredient;
	const ingredientInput =
		typeof ingredientRaw === 'string' ? ingredientRaw.trim() : '';

	return buildIngredientGraph({ ingredientInput });
});
