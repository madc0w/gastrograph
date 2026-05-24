import { ObjectId } from 'mongodb';

type RecipeTitleDoc = {
	title: string;
};

export default defineEventHandler(async (event) => {
	const db = await getMongoDb();
	const recipes = db.collection<RecipeTitleDoc>('Recipes');

	const ingredientIdRaw = getQuery(event).ingredientId;
	const ingredientId =
		typeof ingredientIdRaw === 'string' ? ingredientIdRaw.trim() : '';

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

	const docs = await recipes
		.find(
			{ 'ingredients.ingedientId': objectId },
			{ projection: { _id: 0, title: 1 } },
		)
		.sort({ title: 1 })
		.toArray();

	const titles = docs
		.map((doc) => doc.title?.trim())
		.filter((title): title is string => Boolean(title));

	return {
		ingredientId,
		titles,
	};
});
