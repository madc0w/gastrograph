type IngredientResult = {
	name: string;
	type: string;
};

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default defineEventHandler(async (event) => {
	const db = await getMongoDb();
	const ingredients = db.collection('Ingredients');

	const qRaw = getQuery(event).q;
	const q = typeof qRaw === 'string' ? qRaw.trim().toLowerCase() : '';
	const escapedQuery = escapeRegExp(q);
	const limit = 16;

	const filter = q
		? {
				name: {
					$regex: escapedQuery,
					$options: 'i',
				},
			}
		: {};

	const docs = q
		? ((await ingredients
				.aggregate([
					{ $match: filter },
					{
						$addFields: {
							_nameLower: { $toLower: '$name' },
						},
					},
					{
						$addFields: {
							_startsWithQuery: {
								$regexMatch: {
									input: '$_nameLower',
									regex: `^${escapedQuery}`,
								},
							},
							_matchIndex: { $indexOfCP: ['$_nameLower', q] },
						},
					},
					{
						$sort: {
							_startsWithQuery: -1,
							_matchIndex: 1,
							name: 1,
						},
					},
					{ $limit: limit },
					{
						$project: {
							_id: 0,
							name: 1,
							type: 1,
						},
					},
				])
				.toArray()) as IngredientResult[])
		: ((await ingredients
				.find(
					{},
					{
						projection: {
							_id: 0,
							name: 1,
							type: 1,
						},
					},
				)
				.sort({ name: 1 })
				.limit(limit)
				.toArray()) as IngredientResult[]);

	return {
		items: docs,
	};
});
