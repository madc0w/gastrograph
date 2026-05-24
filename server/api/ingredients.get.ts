type IngredientResult = {
	name: string;
	type: string;
};

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default defineEventHandler(async (event) => {
	const db = await getMongoDb();
	const ingredients = db.collection('Ingedients');

	const qRaw = getQuery(event).q;
	const q = typeof qRaw === 'string' ? qRaw.trim().toLowerCase() : '';
	const limit = 16;

	const filter = q
		? {
				name: {
					$regex: `^${escapeRegExp(q)}`,
					$options: 'i',
				},
			}
		: {};

	const docs = (await ingredients
		.find(filter, {
			projection: {
				_id: 0,
				name: 1,
				type: 1,
			},
		})
		.sort({ name: 1 })
		.limit(limit)
		.toArray()) as IngredientResult[];

	return {
		items: docs,
	};
});
