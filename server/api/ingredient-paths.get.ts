import {
	findIngredientPaths,
	parsePathLimit,
} from '../utils/ingredient-path-search';

export default defineEventHandler(async (event) => {
	const fromRaw = getQuery(event).from;
	const toRaw = getQuery(event).to;
	const fromInput = typeof fromRaw === 'string' ? fromRaw.trim() : '';
	const toInput = typeof toRaw === 'string' ? toRaw.trim() : '';
	const limit = parsePathLimit(getQuery(event).limit);

	return findIngredientPaths({
		fromInput,
		toInput,
		limit,
	});
});
