import 'dotenv/config';
import { MongoClient } from 'mongodb';

function hasSameIndexKey(indexes, expectedKey) {
	const expectedEntries = Object.entries(expectedKey);
	return indexes.some((index) => {
		const keyEntries = Object.entries(index.key || {});
		if (keyEntries.length !== expectedEntries.length) {
			return false;
		}

		return expectedEntries.every(
			([field, direction], idx) =>
				keyEntries[idx][0] === field && keyEntries[idx][1] === direction,
		);
	});
}

async function main() {
	const uri = process.env.MONGODB_URI;
	const dbName = process.env.MONGODB_DB;

	if (!uri || !dbName) {
		throw new Error('MONGODB_URI and MONGODB_DB must be set.');
	}

	const client = new MongoClient(uri);
	await client.connect();

	try {
		const db = client.db(dbName);
		const ingredients = db.collection('Ingredients');
		const recipes = db.collection('Recipes');
		const desiredIngredientNameKey = { name: 1 };
		const desiredRecipeIngredientKey = { 'ingredients.ingedientId': 1 };

		console.log('Ensuring indexes...');

		const [ingredientIndexes, recipeIndexes] = await Promise.all([
			ingredients.indexes(),
			recipes.indexes(),
		]);

		if (hasSameIndexKey(ingredientIndexes, desiredIngredientNameKey)) {
			console.log(
				'Skipping Ingredients.name index creation: equivalent index already exists.',
			);
		} else {
			await ingredients.createIndex(desiredIngredientNameKey, {
				name: 'ingredients_name_idx',
			});
		}

		if (hasSameIndexKey(recipeIndexes, desiredRecipeIngredientKey)) {
			console.log(
				'Skipping Recipes.ingredients.ingedientId index creation: equivalent index already exists.',
			);
		} else {
			await recipes.createIndex(desiredRecipeIngredientKey, {
				name: 'recipes_ingredient_id_idx',
			});
		}

		console.log('Indexes ready:');
		const [recipeIndexesAfter, ingredientIndexesAfter] = await Promise.all([
			recipes.indexes(),
			ingredients.indexes(),
		]);
		console.log(
			`Recipes: ${recipeIndexesAfter.map((item) => item.name).join(', ')}`,
		);
		console.log(
			`Ingredients: ${ingredientIndexesAfter.map((item) => item.name).join(', ')}`,
		);
	} finally {
		await client.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
