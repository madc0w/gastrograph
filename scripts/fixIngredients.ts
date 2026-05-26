import { Collection, MongoClient, ObjectId } from 'mongodb';

type IngredientDoc = {
	_id?: ObjectId;
	name: string;
	type: string;
	creationDate?: Date;
};

type IngredientRef = {
	ingredient: string;
	ingedientId: ObjectId;
	quantity: string;
};

type RecipeDoc = {
	title: string;
	ingredients: IngredientRef[];
	creationDate?: Date;
};

type ContainsReplaceRule = {
	needle: string;
	replacement: string;
	reason: string;
};

type ExactDeleteRule = {
	name: string;
	reason: string;
};

type Stats = {
	rulesEvaluated: number;
	replaceRulesWithMatches: number;
	deleteRulesWithMatches: number;
	sourceIngredientsMatched: number;
	replacementIngredientsCreated: number;
	recipeRefsRewired: number;
	recipeRefsRemoved: number;
	ingredientDocsDeleted: number;
};

const { MONGODB_URI, MONGODB_DB } = process.env;

if (!MONGODB_URI || !MONGODB_DB) {
	throw new Error(
		'Missing required env vars. Expected MONGODB_URI and MONGODB_DB.',
	);
}

const exactDeleteRules: ExactDeleteRule[] = [
	{ name: 'all-purpose seasoning', reason: 'non-specific token' },
	{ name: 'batter', reason: 'preparation state, not stable ingredient entity' },
	{ name: 'cracker barrel', reason: 'brand token, not ingredient name' },
	{ name: 'dough', reason: 'preparation state, not stable ingredient entity' },
	{ name: 'fry', reason: 'action token' },
	{ name: 'herb', reason: 'too generic' },
	{ name: 'herb blend', reason: 'too generic' },
	{ name: 'herb mix', reason: 'too generic' },
	{ name: 'herbs', reason: 'too generic' },
	{ name: 'instant chocolate', reason: 'ambiguous token' },
	{ name: 'instant chicken', reason: 'ambiguous token' },
	{ name: 'mixed herbs', reason: 'too generic' },
	{ name: 'new', reason: 'noise token' },
	{ name: 'nestle', reason: 'brand token' },
	{ name: 'paraffin wax', reason: 'non-food ingredient record' },
	{ name: 'sauce', reason: 'too generic' },
	{ name: 'soup', reason: 'too generic' },
	{ name: 'spaghetti dinner', reason: 'dish, not ingredient' },
];

const containsReplaceRules: ContainsReplaceRule[] = [
	{
		needle: 'bread crumbs',
		replacement: 'breadcrumbs',
		reason: 'canonicalize variant',
	},
	{
		needle: 'bread-crumbs',
		replacement: 'breadcrumbs',
		reason: 'canonicalize variant',
	},
	{
		needle: 'dry breadcrumbs',
		replacement: 'breadcrumbs',
		reason: 'remove preparation descriptor',
	},
	{
		needle: 'jalapeno',
		replacement: 'jalapeño',
		reason: 'spelling normalization',
	},
	{
		needle: 'andouille',
		replacement: 'andouille sausage',
		reason: 'canonical meat form',
	},
	{ needle: 'bay', replacement: 'bay leaf', reason: 'canonical herb form' },
	{ needle: 'beef tips', replacement: 'beef tip', reason: 'depluralize' },
	{
		needle: 'breast',
		replacement: 'chicken breast',
		reason: 'disambiguate generic cut',
	},
	{
		needle: 'chicken mushroom',
		replacement: 'chicken mushroom soup',
		reason: 'canonical soup name',
	},
	{
		needle: 'chicken gumbo',
		replacement: 'chicken gumbo soup',
		reason: 'canonical soup name',
	},
	{
		needle: 'chocolate chips',
		replacement: 'chocolate chip',
		reason: 'depluralize',
	},
	{
		needle: 'chocolate fudge topping',
		replacement: 'chocolate fudge frosting',
		reason: 'canonical product form',
	},
	{
		needle: 'consomme',
		replacement: 'consommé',
		reason: 'accent normalization',
	},
	{
		needle: 'cooking sherry',
		replacement: 'sherry',
		reason: 'canonicalize ingredient',
	},
	{
		needle: 'coriander',
		replacement: 'coriander seed',
		reason: 'disambiguate spice form',
	},
	{
		needle: 'cornflake',
		replacement: 'cornflakes',
		reason: 'canonical cereal name',
	},
	{
		needle: 'crabmeat',
		replacement: 'crab meat',
		reason: 'spacing normalization',
	},
	{ needle: 'cracklings', replacement: 'crackling', reason: 'depluralize' },
	{ needle: 'cranberries', replacement: 'cranberry', reason: 'depluralize' },
	{
		needle: 'cranberry bean',
		replacement: 'cranberry',
		reason: 'canonicalize variant',
	},
	{
		needle: 'cranberry orange relish',
		replacement: 'cranberry-orange relish',
		reason: 'hyphenated canonical form',
	},
	{
		needle: 'cream cheese filling',
		replacement: 'cream cheese',
		reason: 'remove preparation descriptor',
	},
	{
		needle: 'cream of mushroom',
		replacement: 'cream of mushroom soup',
		reason: 'canonical soup form',
	},
	{ needle: 'creme', replacement: 'cream', reason: 'spelling normalization' },
	{
		needle: 'crescent rolls',
		replacement: 'crescent roll',
		reason: 'depluralize',
	},
	{
		needle: 'crisco oil',
		replacement: 'crisco',
		reason: 'canonical brand ingredient',
	},
	{
		needle: 'crisp rice cereal',
		replacement: 'crispy rice cereal',
		reason: 'canonical product name',
	},
	{ needle: 'croutons', replacement: 'crouton', reason: 'depluralize' },
	{ needle: 'deer meat', replacement: 'deer', reason: 'canonical meat name' },
	{
		needle: 'egg nog',
		replacement: 'eggnog',
		reason: 'spelling normalization',
	},
	{
		needle: 'fusilli',
		replacement: 'fusilli pasta',
		reason: 'canonical pasta name',
	},
	{
		needle: 'frying chicken',
		replacement: 'chicken',
		reason: 'remove preparation descriptor',
	},
	{
		needle: 'frozen vegetable mix',
		replacement: 'frozen vegetables',
		reason: 'canonical frozen produce form',
	},
	{
		needle: 'glutamate',
		replacement: 'monosodium glutamate',
		reason: 'expand chemical name',
	},
	{ needle: 'green peas', replacement: 'green pea', reason: 'depluralize' },
	{ needle: 'chile', replacement: 'chili', reason: 'spelling normalization' },
	{
		needle: 'grenadine',
		replacement: 'grenadine syrup',
		reason: 'canonical syrup form',
	},
	{
		needle: 'ground cayenne pepper',
		replacement: 'cayenne',
		reason: 'canonical spice name',
	},
	{
		needle: 'ground cayenne',
		replacement: 'cayenne',
		reason: 'canonical spice name',
	},
	{
		needle: 'hash brown potatoes',
		replacement: 'hash browns',
		reason: 'canonical dish ingredient form',
	},
	{
		needle: 'hash brown potato',
		replacement: 'hash browns',
		reason: 'canonical dish ingredient form',
	},
	{
		needle: 'hash brown',
		replacement: 'hash browns',
		reason: 'canonical dish ingredient form',
	},
	{
		needle: 'heath bar chips',
		replacement: 'heath bar',
		reason: 'canonical candy name',
	},
	{
		needle: 'heath bits',
		replacement: 'heath bar',
		reason: 'canonical candy name',
	},
	{
		needle: 'heath candy bar',
		replacement: 'heath bar',
		reason: 'canonical candy name',
	},
	{
		needle: 'honeydew',
		replacement: 'honeydew melon',
		reason: 'expand fruit name',
	},
	{
		needle: 'imitation crabmeat',
		replacement: 'imitation crab',
		reason: 'spacing normalization',
	},
	{
		needle: 'irish whiskey',
		replacement: 'whiskey',
		reason: 'canonical spirit name',
	},
	{
		needle: 'light red kidney bean',
		replacement: 'kidney bean',
		reason: 'canonicalize bean variety',
	},
	{ needle: 'lentils', replacement: 'lentil', reason: 'depluralize' },
	{ needle: 'meatballs', replacement: 'meatball', reason: 'depluralize' },
	{
		needle: "miniature reese's",
		replacement: "mini reese's",
		reason: 'canonical candy descriptor',
	},
	{
		needle: 'miniature marshmallows',
		replacement: 'mini marshmallows',
		reason: 'canonical descriptor',
	},
	{
		needle: 'minced onion',
		replacement: 'onion',
		reason: 'remove cut descriptor',
	},
	{
		needle: 'monterey jack',
		replacement: 'monterey jack cheese',
		reason: 'expand cheese name',
	},
	{
		needle: 'mozzarella',
		replacement: 'mozzarella cheese',
		reason: 'expand cheese name',
	},
	{
		needle: 'muenster',
		replacement: 'muenster cheese',
		reason: 'expand cheese name',
	},
	{ needle: 'navy beans', replacement: 'navy bean', reason: 'depluralize' },
	{ needle: 'oat', replacement: 'oats', reason: 'canonical grain form' },
	{ needle: 'olives', replacement: 'olive', reason: 'depluralize' },
	{
		needle: 'orange flavored drink',
		replacement: 'orange drink',
		reason: 'canonical beverage form',
	},
	{
		needle: 'oreo',
		replacement: 'oreo cookie',
		reason: 'canonical cookie form',
	},
	{
		needle: 'parmesan',
		replacement: 'parmesan cheese',
		reason: 'expand cheese name',
	},
	{ needle: 'potato chips', replacement: 'potato chip', reason: 'depluralize' },
	{ needle: 'pretzels', replacement: 'pretzel', reason: 'depluralize' },
	{
		needle: 'process cheese',
		replacement: 'processed cheese',
		reason: 'spelling normalization',
	},
	{
		needle: 'provolone',
		replacement: 'provolone cheese',
		reason: 'expand cheese name',
	},
	{
		needle: 'pumpkin pie filling',
		replacement: 'pumpkin filling',
		reason: 'canonical filling name',
	},
	{
		needle: 'ramen noodle',
		replacement: 'ramen noodles',
		reason: 'canonical noodle form',
	},
	{
		needle: 'ramen',
		replacement: 'ramen noodles',
		reason: 'canonical noodle form',
	},
	{
		needle: 'ranch-style salad dressing',
		replacement: 'ranch dressing',
		reason: 'canonical dressing name',
	},
	{
		needle: 'ranch',
		replacement: 'ranch dressing',
		reason: 'canonical dressing name',
	},
	{ needle: 'raspberries', replacement: 'raspberry', reason: 'depluralize' },
	{
		needle: 'red hot cinnamon',
		replacement: 'red hot candy',
		reason: 'canonical candy name',
	},
	{
		needle: 'red hot',
		replacement: 'red hot candy',
		reason: 'canonical candy name',
	},
	{
		needle: 'red karo',
		replacement: 'red karo syrup',
		reason: 'canonical syrup form',
	},
	{
		needle: 'rice chex',
		replacement: 'rice chex cereal',
		reason: 'canonical cereal form',
	},
	{
		needle: 'ro-tel',
		replacement: 'ro-tel chili',
		reason: 'canonical canned ingredient form',
	},
	{
		needle: 'ricotta',
		replacement: 'ricotta cheese',
		reason: 'expand cheese name',
	},
	{
		needle: 'romano',
		replacement: 'romano cheese',
		reason: 'expand cheese name',
	},
	{
		needle: 'rye whiskey',
		replacement: 'whiskey',
		reason: 'canonical spirit name',
	},
	{
		needle: 'salt and pepper',
		replacement: 'salt',
		reason: 'split surrogate target (salt)',
	},
	{
		needle: 'salt and pepper',
		replacement: 'pepper',
		reason: 'split surrogate target (pepper)',
	},
	{
		needle: 'saltine',
		replacement: 'saltine cracker',
		reason: 'expand cracker name',
	},
	{
		needle: 'sausage meat',
		replacement: 'sausage',
		reason: 'remove descriptor',
	},
	{
		needle: 'semi-sweet chocolate morsels',
		replacement: 'chocolate chips',
		reason: 'canonical chip form',
	},
	{
		needle: 'semi-sweet chocolate pieces',
		replacement: 'chocolate chips',
		reason: 'canonical chip form',
	},
	{
		needle: 'semi-sweet chocolate chips',
		replacement: 'chocolate chips',
		reason: 'canonical chip form',
	},
	{
		needle: 'semisweet chocolate chips',
		replacement: 'chocolate chips',
		reason: 'canonical chip form',
	},
	{
		needle: 'sharp cheddar',
		replacement: 'sharp cheddar cheese',
		reason: 'expand cheese name',
	},
	{
		needle: 'sherry cooking wine',
		replacement: 'sherry',
		reason: 'canonical wine ingredient',
	},
	{
		needle: 'sherry wine',
		replacement: 'sherry',
		reason: 'canonical wine ingredient',
	},
	{
		needle: 'snickers',
		replacement: 'snickers bar',
		reason: 'expand candy name',
	},
	{ needle: 'snow peas', replacement: 'snow pea', reason: 'depluralize' },
	{
		needle: 'soda crackers',
		replacement: 'soda cracker',
		reason: 'depluralize',
	},
	{ needle: 'strawberries', replacement: 'strawberry', reason: 'depluralize' },
	{
		needle: 'tabasco',
		replacement: 'tabasco sauce',
		reason: 'expand condiment name',
	},
	{
		needle: 'tomato pate',
		replacement: 'tomato paste',
		reason: 'spelling normalization',
	},
	{
		needle: 'tomato ketchup',
		replacement: 'ketchup',
		reason: 'canonical condiment name',
	},
	{
		needle: 'catsup',
		replacement: 'ketchup',
		reason: 'spelling normalization',
	},
	{
		needle: 'tuna steak',
		replacement: 'tuna',
		reason: 'remove cut descriptor',
	},
	{
		needle: 'velveeta',
		replacement: 'velveeta cheese',
		reason: 'expand cheese name',
	},
	{
		needle: 'wing',
		replacement: 'chicken wing',
		reason: 'disambiguate generic cut',
	},
	{
		needle: 'worcestershire',
		replacement: 'worcestershire sauce',
		reason: 'expand condiment name',
	},
	{
		needle: 'yellow lima beans',
		replacement: 'yellow lima bean',
		reason: 'depluralize',
	},
];

function escRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getOrCreateIngredient(
	ingredientsCollection: Collection<IngredientDoc>,
	name: string,
	stats: Stats,
): Promise<ObjectId> {
	const canonical = name.trim().toLowerCase();
	const existing = (await ingredientsCollection.findOne({
		name: canonical,
	})) as IngredientDoc | null;
	if (existing?._id) {
		return existing._id;
	}

	const insert = await ingredientsCollection.insertOne({
		name: canonical,
		type: 'other',
		creationDate: new Date(),
	});
	console.log(
		`Created Ingredient: ${canonical} (other) [${insert.insertedId.toHexString()}]`,
	);
	stats.replacementIngredientsCreated += 1;
	return insert.insertedId;
}

async function countRecipeRefs(
	recipesCollection: Collection<RecipeDoc>,
	ingredientId: ObjectId,
): Promise<number> {
	const rows = (await recipesCollection
		.find(
			{ 'ingredients.ingedientId': ingredientId },
			{ projection: { ingredients: 1 } },
		)
		.toArray()) as Array<{ ingredients?: IngredientRef[] }>;

	let refs = 0;
	for (const row of rows) {
		for (const item of row.ingredients ?? []) {
			if (item.ingedientId?.equals(ingredientId)) {
				refs += 1;
			}
		}
	}
	return refs;
}

async function rewireIngredientRefs(
	recipesCollection: Collection<RecipeDoc>,
	fromId: ObjectId,
	toId: ObjectId,
): Promise<void> {
	await recipesCollection.updateMany(
		{ 'ingredients.ingedientId': fromId },
		{
			$set: {
				'ingredients.$[elem].ingedientId': toId,
			},
		},
		{
			arrayFilters: [{ 'elem.ingedientId': fromId }],
		},
	);
}

async function removeIngredientRefs(
	recipesCollection: Collection<RecipeDoc>,
	fromId: ObjectId,
): Promise<void> {
	await recipesCollection.updateMany(
		{ 'ingredients.ingedientId': fromId },
		{ $pull: { ingredients: { ingedientId: fromId } } },
	);
}

async function applyExactDeleteRule(
	rule: ExactDeleteRule,
	ingredientsCollection: Collection<IngredientDoc>,
	recipesCollection: Collection<RecipeDoc>,
	stats: Stats,
): Promise<void> {
	const name = rule.name.trim().toLowerCase();
	const matches = (await ingredientsCollection
		.find({ name })
		.toArray()) as IngredientDoc[];
	if (matches.length === 0) {
		return;
	}

	stats.deleteRulesWithMatches += 1;

	for (const doc of matches) {
		if (!doc._id) {
			continue;
		}

		stats.sourceIngredientsMatched += 1;
		const refs = await countRecipeRefs(recipesCollection, doc._id);
		if (refs > 0) {
			await removeIngredientRefs(recipesCollection, doc._id);
			stats.recipeRefsRemoved += refs;
		}

		const deleted = await ingredientsCollection.deleteOne({ _id: doc._id });
		if (deleted.deletedCount > 0) {
			stats.ingredientDocsDeleted += deleted.deletedCount;
		}
	}

	console.log(
		`DELETE exact "${name}" (${rule.reason}) | ingredient docs: ${matches.length}`,
	);
}

async function applyContainsReplaceRule(
	rule: ContainsReplaceRule,
	ingredientsCollection: Collection<IngredientDoc>,
	recipesCollection: Collection<RecipeDoc>,
	stats: Stats,
): Promise<void> {
	const needle = rule.needle.trim().toLowerCase();
	const replacement = rule.replacement.trim().toLowerCase();

	const regex = new RegExp(escRegex(needle), 'i');
	const matches = (await ingredientsCollection
		.find({ name: { $regex: regex } })
		.toArray()) as IngredientDoc[];
	if (matches.length === 0) {
		return;
	}

	stats.replaceRulesWithMatches += 1;
	const toId = await getOrCreateIngredient(
		ingredientsCollection,
		replacement,
		stats,
	);

	let changedDocs = 0;
	let rewiredRefs = 0;

	for (const doc of matches) {
		if (!doc._id) {
			continue;
		}
		if (doc._id.equals(toId)) {
			continue;
		}

		stats.sourceIngredientsMatched += 1;
		const refs = await countRecipeRefs(recipesCollection, doc._id);
		if (refs > 0) {
			await rewireIngredientRefs(recipesCollection, doc._id, toId);
			rewiredRefs += refs;
		}

		const deleted = await ingredientsCollection.deleteOne({ _id: doc._id });
		if (deleted.deletedCount > 0) {
			changedDocs += deleted.deletedCount;
		}
	}

	stats.recipeRefsRewired += rewiredRefs;
	stats.ingredientDocsDeleted += changedDocs;

	if (changedDocs > 0 || rewiredRefs > 0) {
		console.log(
			`REPLACE contains "${needle}" -> "${replacement}" (${rule.reason}) | ingredient docs: ${changedDocs}, refs rewired: ${rewiredRefs}`,
		);
	}
}

async function fixIngredients(): Promise<void> {
	if (!MONGODB_URI) {
		throw new Error('MONGODB_URI is not defined');
	}
	const client = new MongoClient(MONGODB_URI);
	await client.connect();

	const stats: Stats = {
		rulesEvaluated: exactDeleteRules.length + containsReplaceRules.length,
		replaceRulesWithMatches: 0,
		deleteRulesWithMatches: 0,
		sourceIngredientsMatched: 0,
		replacementIngredientsCreated: 0,
		recipeRefsRewired: 0,
		recipeRefsRemoved: 0,
		ingredientDocsDeleted: 0,
	};

	try {
		const db = client.db(MONGODB_DB);
		const ingredientsCollection = db.collection<IngredientDoc>('Ingredients');
		const recipesCollection = db.collection<RecipeDoc>('Recipes');

		for (const rule of exactDeleteRules) {
			await applyExactDeleteRule(
				rule,
				ingredientsCollection,
				recipesCollection,
				stats,
			);
		}

		for (const rule of containsReplaceRules) {
			await applyContainsReplaceRule(
				rule,
				ingredientsCollection,
				recipesCollection,
				stats,
			);
		}

		console.log('Fix complete.');
		console.log('Summary:');
		console.log(`Rules evaluated: ${stats.rulesEvaluated}`);
		console.log(`Replace rules with matches: ${stats.replaceRulesWithMatches}`);
		console.log(`Delete rules with matches: ${stats.deleteRulesWithMatches}`);
		console.log(
			`Source ingredient docs matched: ${stats.sourceIngredientsMatched}`,
		);
		console.log(
			`Replacement ingredient docs created: ${stats.replacementIngredientsCreated}`,
		);
		console.log(`Recipe refs rewired: ${stats.recipeRefsRewired}`);
		console.log(`Recipe refs removed: ${stats.recipeRefsRemoved}`);
		console.log(`Ingredient docs deleted: ${stats.ingredientDocsDeleted}`);
	} finally {
		await client.close();
	}
}

fixIngredients().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Fix failed: ${message}`);
	process.exitCode = 1;
});
