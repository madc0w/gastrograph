import { MongoClient, ObjectId } from 'mongodb';

const { MONGODB_URI, MONGODB_DB } = process.env;

if (!MONGODB_URI || !MONGODB_DB) {
	throw new Error(
		'Missing required env vars. Expected MONGODB_URI and MONGODB_DB.',
	);
}

type FrequencyRow = {
	_id: ObjectId;
	recipeCount: number;
};

type RecipeIngredient = {
	ingedientId?: ObjectId | string;
	ingredientId?: ObjectId | string;
};

type RecipeDoc = {
	ingredients?: RecipeIngredient[];
};

function formatDurationMs(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}m ${seconds}s`;
}

async function main(): Promise<void> {
	if (!MONGODB_URI) {
		throw new Error('MONGODB_URI is not defined in environment variables.');
	}
	const client = new MongoClient(MONGODB_URI);

	console.log('Connecting to MongoDB...');
	await client.connect();
	console.log('Connected to MongoDB.');
	try {
		console.log(`Using database: ${MONGODB_DB}`);
		const db = client.db(MONGODB_DB);
		const recipes = db.collection('Recipes');
		const ingredients = db.collection('Ingredients');

		console.log('Estimating total recipe count...');
		const estimatedTotalRecipes = await recipes.estimatedDocumentCount();
		console.log(
			`Scanning recipes to compute ingredient frequencies (estimated total: ${estimatedTotalRecipes})...`,
		);

		const scanStartedAt = Date.now();
		let processedRecipes = 0;
		let nextProgressLogAt = 4000;
		let lastProgressLogAt = Date.now();
		let skippedInvalidIngredientIds = 0;

		const frequencyByIngredient = new Map<
			string,
			{ ingredientId: ObjectId; recipeCount: number }
		>();

		const recipeCursor = recipes.find<RecipeDoc>(
			{},
			{
				projection: { ingredients: 1 },
				batchSize: 1000,
			},
		);

		for await (const recipe of recipeCursor) {
			processedRecipes += 1;
			const ingredientsInRecipe = Array.isArray(recipe.ingredients)
				? recipe.ingredients
				: [];
			const seenInThisRecipe = new Set<string>();

			for (const ingredient of ingredientsInRecipe) {
				const rawIngredientFrequencyId =
					ingredient?.ingedientId ?? ingredient?.ingredientId;
				if (!rawIngredientFrequencyId) {
					continue;
				}

				let ingredientFrequencyId: ObjectId;
				if (rawIngredientFrequencyId instanceof ObjectId) {
					ingredientFrequencyId = rawIngredientFrequencyId;
				} else if (
					typeof rawIngredientFrequencyId === 'string' &&
					ObjectId.isValid(rawIngredientFrequencyId)
				) {
					ingredientFrequencyId = new ObjectId(rawIngredientFrequencyId);
				} else {
					skippedInvalidIngredientIds += 1;
					continue;
				}

				const key = ingredientFrequencyId.toHexString();
				if (seenInThisRecipe.has(key)) {
					continue;
				}
				seenInThisRecipe.add(key);

				const existing = frequencyByIngredient.get(key);
				if (existing) {
					existing.recipeCount += 1;
				} else {
					frequencyByIngredient.set(key, {
						ingredientId: ingredientFrequencyId,
						recipeCount: 1,
					});
				}
			}

			const now = Date.now();
			if (
				processedRecipes >= nextProgressLogAt ||
				now - lastProgressLogAt >= 10000
			) {
				const progressDenominator = Math.max(
					estimatedTotalRecipes,
					processedRecipes,
				);
				const percent = (
					(processedRecipes / progressDenominator) *
					100
				).toFixed(1);
				const elapsedMs = now - scanStartedAt;
				const recipesPerSecond =
					elapsedMs > 0 ? processedRecipes / (elapsedMs / 1000) : 0;
				const remainingRecipes = Math.max(
					progressDenominator - processedRecipes,
					0,
				);
				const etaSeconds =
					recipesPerSecond > 0
						? Math.round(remainingRecipes / recipesPerSecond)
						: 0;

				console.log(
					`Scan progress: ${processedRecipes}/${progressDenominator} (${percent}%), unique ingredients: ${frequencyByIngredient.size}, speed: ${recipesPerSecond.toFixed(1)} recipes/s, ETA: ${formatDurationMs(etaSeconds * 1000)}`,
				);

				nextProgressLogAt = processedRecipes + 4000;
				lastProgressLogAt = now;
			}
		}

		const rows: FrequencyRow[] = Array.from(frequencyByIngredient.values()).map(
			(entry) => ({
				_id: entry.ingredientId,
				recipeCount: entry.recipeCount,
			}),
		);

		console.log(
			`Computed ${rows.length} ingredient frequency rows in ${formatDurationMs(Date.now() - scanStartedAt)}.`,
		);
		if (skippedInvalidIngredientIds > 0) {
			console.log(
				`Skipped ${skippedInvalidIngredientIds} ingredient references with non-ObjectId values.`,
			);
		}

		if (rows.length === 0) {
			console.log('No ingredient frequencies found.');
			return;
		}

		console.log(`Computed ${rows.length} ingredient frequency rows.`);
		console.log(`Updating ${rows.length} ingredient documents...`);
		const chunkSize = 1000;
		let processed = 0;
		const writeStartedAt = Date.now();
		for (let i = 0; i < rows.length; i += chunkSize) {
			const chunk = rows.slice(i, i + chunkSize);
			const chunkNumber = Math.floor(i / chunkSize) + 1;
			const totalChunks = Math.ceil(rows.length / chunkSize);
			console.log(
				`Writing chunk ${chunkNumber}/${totalChunks} (${chunk.length} documents)...`,
			);
			await ingredients.bulkWrite(
				chunk.map((row) => ({
					updateOne: {
						filter: { _id: row._id },
						update: {
							$set: {
								recipeCount: row.recipeCount,
							},
						},
					},
				})),
				{ ordered: false },
			);

			processed += chunk.length;
			const percent = ((processed / rows.length) * 100).toFixed(1);
			console.log(
				`Progress: ${processed}/${rows.length} (${percent}%) ingredient documents updated`,
			);
		}
		console.log(
			`Write phase finished in ${formatDurationMs(Date.now() - writeStartedAt)}.`,
		);

		console.log('Done. Cached recipeCount on Ingredients.');
	} finally {
		console.log('Closing MongoDB connection...');
		await client.close();
		console.log('MongoDB connection closed.');
	}
}

void main();
