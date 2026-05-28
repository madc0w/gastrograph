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

type SplitReplaceRule = {
	needle: string;
	replacements: string[];
	reason: string;
};

type ExactDeleteRule = {
	name: string;
	reason: string;
};

type Stats = {
	rulesEvaluated: number;
	replaceRulesWithMatches: number;
	splitRulesWithMatches: number;
	deleteRulesWithMatches: number;
	sourceIngredientsMatched: number;
	replacementIngredientsCreated: number;
	recipeRefsRewired: number;
	recipeRefsAdded: number;
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
	{ name: 'au jus', reason: 'requested removal' },
	{ name: 'batter', reason: 'preparation state, not stable ingredient entity' },
	{ name: 'bitter', reason: 'requested removal' },
	{ name: 'canadian sharp', reason: 'requested removal' },
	{ name: 'chicken-style', reason: 'requested removal' },
	{ name: 'cracker barrel', reason: 'brand token, not ingredient name' },
	{ name: 'dough', reason: 'preparation state, not stable ingredient entity' },
	{ name: 'flavoring sauce', reason: 'requested removal' },
	{ name: 'fryer', reason: 'requested removal' },
	{ name: 'fry', reason: 'action token' },
	{ name: 'grands homestyle', reason: 'requested removal' },
	{ name: 'ground', reason: 'requested removal' },
	{ name: 'herb', reason: 'too generic' },
	{ name: 'herb blend', reason: 'too generic' },
	{ name: 'herb mix', reason: 'too generic' },
	{ name: 'herbs', reason: 'too generic' },
	{ name: 'instant chocolate', reason: 'ambiguous token' },
	{ name: 'instant chicken', reason: 'ambiguous token' },
	{ name: 'mixed herbs', reason: 'too generic' },
	{ name: 'morsels', reason: 'requested removal' },
	{ name: 'new', reason: 'noise token' },
	{ name: 'nestle', reason: 'brand token' },
	{ name: 'paraffin wax', reason: 'non-food ingredient record' },
	{ name: 'powdered nestle', reason: 'requested removal' },
	{ name: 'puff', reason: 'requested removal' },
	{ name: 'red spanish', reason: 'requested removal' },
	{ name: 'sauce', reason: 'too generic' },
	{ name: 'splash', reason: 'requested removal' },
	{ name: 'spice mix', reason: 'requested removal' },
	{ name: 'soup', reason: 'too generic' },
	{ name: 'spaghetti dinner', reason: 'dish, not ingredient' },
	{ name: 'white morsels', reason: 'requested removal' },
	{ name: 'yellow', reason: 'requested removal' },
];

const splitReplaceRules: SplitReplaceRule[] = [
	{
		needle: 'apple pear',
		replacements: ['apple', 'pear'],
		reason: 'requested split mapping',
	},
	{
		needle: 'avocado chicken',
		replacements: ['avocado', 'chicken'],
		reason: 'requested split mapping',
	},
	{
		needle: 'garlic potato',
		replacements: ['garlic', 'potato'],
		reason: 'requested split mapping',
	},
	{
		needle: 'garlic shrimp',
		replacements: ['garlic', 'shrimp'],
		reason: 'requested split mapping',
	},
	{
		needle: 'lemon blueberry',
		replacements: ['lemon', 'blueberry'],
		reason: 'requested split mapping',
	},
	{
		needle: 'sugar cinnamon',
		replacements: ['sugar', 'cinnamon'],
		reason: 'requested split mapping',
	},
	{
		needle: 'sugar butter',
		replacements: ['sugar', 'butter'],
		reason: 'requested split mapping',
	},
	{
		needle: 'strawberry banana',
		replacements: ['strawberry', 'banana'],
		reason: 'requested split mapping',
	},
	{
		needle: 'tarragon basil',
		replacements: ['tarragon', 'basil'],
		reason: 'requested split mapping',
	},
];

const containsReplaceRules: ContainsReplaceRule[] = [
	{ needle: '7-up', replacement: '7-up soda', reason: 'requested mapping' },
	{
		needle: 'alaskan king crab',
		replacement: 'king crab',
		reason: 'requested mapping',
	},
	{
		needle: 'almond flavor',
		replacement: 'almond extract',
		reason: 'requested mapping',
	},
	{
		needle: 'almond flavoring',
		replacement: 'almond extract',
		reason: 'requested mapping',
	},
	{
		needle: 'alioli',
		replacement: 'aioli',
		reason: 'requested mapping',
	},
	{
		needle: 'all-bran',
		replacement: 'all-bran cereal',
		reason: 'requested mapping',
	},
	{
		needle: 'all-purpose flour',
		replacement: 'flour',
		reason: 'requested mapping',
	},
	{
		needle: 'all-purpose biscuit mix',
		replacement: 'biscuit mix',
		reason: 'requested mapping',
	},
	{
		needle: 'amaretto liqueur',
		replacement: 'amaretto',
		reason: 'requested mapping',
	},
	{
		needle: 'anisette liqueur',
		replacement: 'anisette',
		reason: 'requested mapping',
	},
	{
		needle: 'arborio',
		replacement: 'arborio rice',
		reason: 'requested mapping',
	},
	{
		needle: 'assorted fresh fruit',
		replacement: 'fruit',
		reason: 'requested mapping',
	},
	{
		needle: 'balsamic',
		replacement: 'balsamic vinegar',
		reason: 'requested mapping',
	},
	{
		needle: 'baking molasses',
		replacement: 'molasses',
		reason: 'requested mapping',
	},
	{ needle: 'beans', replacement: 'bean', reason: 'requested mapping' },
	{
		needle: 'beef broth cube',
		replacement: 'beef bouillon',
		reason: 'requested mapping',
	},
	{
		needle: 'beef bouillon cube',
		replacement: 'beef bouillon',
		reason: 'requested mapping',
	},
	{
		needle: 'beef bouillon cubes',
		replacement: 'beef bouillon',
		reason: 'requested mapping',
	},
	{
		needle: 'beef stew seasoning mix',
		replacement: 'beef stew mix',
		reason: 'requested mapping',
	},
	{ needle: 'biscuits', replacement: 'biscuit', reason: 'requested mapping' },
	{
		needle: 'black-eyed peas',
		replacement: 'black-eyed pea',
		reason: 'requested mapping',
	},
	{ needle: 'brie', replacement: 'brie cheese', reason: 'requested mapping' },
	{
		needle: 'brussels sprouts',
		replacement: 'brussels sprout',
		reason: 'requested mapping',
	},
	{
		needle: 'burgundy wine',
		replacement: 'burgundy',
		reason: 'requested mapping',
	},
	{
		needle: 'butterscotch morsels',
		replacement: 'butterscotch chips',
		reason: 'requested mapping',
	},
	{
		needle: 'butterscotch bits',
		replacement: 'butterscotch chips',
		reason: 'requested mapping',
	},
	{
		needle: 'cajun seasoning salt',
		replacement: 'cajun seasoning',
		reason: 'requested mapping',
	},
	{ needle: 'cake flour', replacement: 'flour', reason: 'requested mapping' },
	{ needle: 'cake yeast', replacement: 'yeast', reason: 'requested mapping' },
	{ needle: 'capers', replacement: 'caper', reason: 'requested mapping' },
	{
		needle: 'caramel candy',
		replacement: 'caramel',
		reason: 'requested mapping',
	},
	{
		needle: 'caramel topping',
		replacement: 'caramel icing',
		reason: 'requested mapping',
	},
	{
		needle: 'caraway',
		replacement: 'caraway seed',
		reason: 'requested mapping',
	},
	{ needle: 'cashews', replacement: 'cashew', reason: 'requested mapping' },
	{
		needle: 'cayenne',
		replacement: 'cayenne pepper',
		reason: 'requested mapping',
	},
	{
		needle: 'cheddar',
		replacement: 'cheddar cheese',
		reason: 'requested mapping',
	},
	{
		needle: 'cheese whiz',
		replacement: 'cheez whiz',
		reason: 'requested mapping',
	},
	{
		needle: 'chicken quarter',
		replacement: 'chicken',
		reason: 'requested mapping',
	},
	{
		needle: 'chicken stock base',
		replacement: 'chicken stock',
		reason: 'requested mapping',
	},
	{
		needle: 'chicken stuffing mix',
		replacement: 'chicken stuffing',
		reason: 'requested mapping',
	},
	{
		needle: 'chili salsa',
		replacement: 'chili sauce',
		reason: 'requested mapping',
	},
	{ needle: 'chives', replacement: 'chive', reason: 'requested mapping' },
	{ needle: 'chunky salsa', replacement: 'salsa', reason: 'requested mapping' },
	{ needle: 'codfish', replacement: 'cod', reason: 'requested mapping' },
	{ needle: 'coke', replacement: 'coca-cola', reason: 'requested mapping' },
	{
		needle: 'cool whip',
		replacement: 'cool whip whipped topping',
		reason: 'requested mapping',
	},
	{
		needle: 'corn husks',
		replacement: 'corn husk',
		reason: 'requested mapping',
	},
	{
		needle: 'cornstarch',
		replacement: 'corn starch',
		reason: 'requested mapping',
	},
	{
		needle: 'country mustard',
		replacement: 'mustard',
		reason: 'requested mapping',
	},
	{
		needle: 'cream style corn',
		replacement: 'creamed corn',
		reason: 'requested mapping',
	},
	{
		needle: 'cream corn',
		replacement: 'creamed corn',
		reason: 'requested mapping',
	},
	{
		needle: 'cream-style horseradish',
		replacement: 'horseradish',
		reason: 'requested mapping',
	},
	{
		needle: 'creamed cottage cheese',
		replacement: 'cottage cheese',
		reason: 'requested mapping',
	},
	{
		needle: 'creamy peanut butter',
		replacement: 'peanut butter',
		reason: 'requested mapping',
	},
	{
		needle: 'dark rye bread',
		replacement: 'rye bread',
		reason: 'requested mapping',
	},
	{
		needle: 'doritos',
		replacement: 'doritos chips',
		reason: 'requested mapping',
	},
	{
		needle: 'dinner rolls',
		replacement: 'dinner roll',
		reason: 'requested mapping',
	},
	{
		needle: 'curly endive',
		replacement: 'endive',
		reason: 'requested mapping',
	},
	{
		needle: 'instant milk powder',
		replacement: 'milk powder',
		reason: 'requested mapping',
	},
	{
		needle: 'dry milk',
		replacement: 'milk powder',
		reason: 'requested mapping',
	},
	{ needle: 'enriched rice', replacement: 'rice', reason: 'requested mapping' },
	{
		needle: 'filo dough',
		replacement: 'phyllo dough',
		reason: 'requested mapping',
	},
	{
		needle: 'frozen apples',
		replacement: 'apple',
		reason: 'requested mapping',
	},
	{
		needle: 'fontina',
		replacement: 'fontina cheese',
		reason: 'requested mapping',
	},
	{
		needle: 'french fried onion rings',
		replacement: 'french fried onion',
		reason: 'requested mapping',
	},
	{
		needle: 'french fried onions',
		replacement: 'french fried onion',
		reason: 'requested mapping',
	},
	{
		needle: 'galliano liqueur',
		replacement: 'galliano',
		reason: 'requested mapping',
	},
	{ needle: 'garden pea', replacement: 'pea', reason: 'requested mapping' },
	{
		needle: 'garlic rolls',
		replacement: 'garlic roll',
		reason: 'requested mapping',
	},
	{
		needle: 'gorgonzola',
		replacement: 'gorgonzola cheese',
		reason: 'requested mapping',
	},
	{
		needle: 'ground cinnamon',
		replacement: 'cinnamon',
		reason: 'requested mapping',
	},
	{ needle: 'ground cumin', replacement: 'cumin', reason: 'requested mapping' },
	{
		needle: 'ground pepper',
		replacement: 'pepper',
		reason: 'requested mapping',
	},
	{
		needle: 'ground round',
		replacement: 'ground round steak',
		reason: 'requested mapping',
	},
	{ needle: 'ground thyme', replacement: 'thyme', reason: 'requested mapping' },
	{
		needle: 'ground walnuts',
		replacement: 'walnuts',
		reason: 'requested mapping',
	},
	{
		needle: 'ground white pepper',
		replacement: 'white pepper',
		reason: 'requested mapping',
	},
	{
		needle: 'gummy worms',
		replacement: 'gummy worm',
		reason: 'requested mapping',
	},
	{ needle: 'hearts', replacement: 'heart', reason: 'requested mapping' },
	{
		needle: 'instant potato',
		replacement: 'instant potato flakes',
		reason: 'requested mapping',
	},
	{
		needle: 'lemon flavor',
		replacement: 'lemon flavoring',
		reason: 'requested mapping',
	},
	{
		needle: 'lemon extract',
		replacement: 'lemon flavoring',
		reason: 'requested mapping',
	},
	{
		needle: 'lemon pepper',
		replacement: 'lemon pepper seasoning',
		reason: 'requested mapping',
	},
	{
		needle: 'lite salt',
		replacement: 'light salt',
		reason: 'requested mapping',
	},
	{
		needle: 'long grain converted rice',
		replacement: 'long grain rice',
		reason: 'requested mapping',
	},
	{
		needle: 'long grain',
		replacement: 'long grain rice',
		reason: 'requested mapping',
	},
	{
		needle: 'long-grain rice',
		replacement: 'long grain rice',
		reason: 'requested mapping',
	},
	{
		needle: 'low-fat monterey',
		replacement: 'monterey cheese',
		reason: 'requested mapping',
	},
	{
		needle: 'macaroni shells',
		replacement: 'macaroni',
		reason: 'requested mapping',
	},
	{
		needle: 'maraschino cherry syrup',
		replacement: 'maraschino cherry juice',
		reason: 'requested mapping',
	},
	{
		needle: 'mascarpone',
		replacement: 'mascarpone cheese',
		reason: 'requested mapping',
	},
	{
		needle: 'mixed spice',
		replacement: 'mixed spices',
		reason: 'requested mapping',
	},
	{
		needle: 'mock crab meat',
		replacement: 'imitation crab meat',
		reason: 'requested mapping',
	},
	{
		needle: 'monterey',
		replacement: 'monterey cheese',
		reason: 'requested mapping',
	},
	{ needle: 'noodle', replacement: 'noodles', reason: 'requested mapping' },
	{ needle: 'nut meats', replacement: 'nutmeat', reason: 'requested mapping' },
	{
		needle: 'orange extract',
		replacement: 'orange flavoring',
		reason: 'requested mapping',
	},
	{
		needle: 'orange flavor',
		replacement: 'orange flavoring',
		reason: 'requested mapping',
	},
	{
		needle: 'other vegetables',
		replacement: 'vegetables',
		reason: 'requested mapping',
	},
	{ needle: 'peanuts', replacement: 'peanut', reason: 'requested mapping' },
	{ needle: 'pea bean', replacement: 'pea', reason: 'requested mapping' },
	{ needle: 'pea pods', replacement: 'pea pod', reason: 'requested mapping' },
	{ needle: 'peas', replacement: 'pea', reason: 'requested mapping' },
	{ needle: 'pecans', replacement: 'pecan', reason: 'requested mapping' },
	{
		needle: 'pepperoncini pepper',
		replacement: 'pepperoncini',
		reason: 'requested mapping',
	},
	{
		needle: 'persimmon pulp',
		replacement: 'persimmon',
		reason: 'requested mapping',
	},
	{
		needle: 'phyllo',
		replacement: 'phyllo dough',
		reason: 'requested mapping',
	},
	{
		needle: 'phyllo pastry',
		replacement: 'phyllo dough',
		reason: 'requested mapping',
	},
	{
		needle: 'pie shell',
		replacement: 'pie crust',
		reason: 'requested mapping',
	},
	{
		needle: 'pie pastry',
		replacement: 'pie crust',
		reason: 'requested mapping',
	},
	{
		needle: 'pie crust dough',
		replacement: 'pie crust',
		reason: 'requested mapping',
	},
	{
		needle: 'popped corn',
		replacement: 'popcorn',
		reason: 'requested mapping',
	},
	{
		needle: 'pork shoulder steak',
		replacement: 'pork shoulder',
		reason: 'requested mapping',
	},
	{
		needle: 'powdered creamer',
		replacement: 'powdered nondairy creamer',
		reason: 'requested mapping',
	},
	{
		needle: 'red pepper flakes',
		replacement: 'red pepper',
		reason: 'requested mapping',
	},
	{
		needle: 'rice krispies',
		replacement: 'rice krispies cereal',
		reason: 'requested mapping',
	},
	{
		needle: 'rice crispies',
		replacement: 'rice krispies cereal',
		reason: 'requested mapping',
	},
	{
		needle: 'rice crispies cereal',
		replacement: 'rice krispies cereal',
		reason: 'requested mapping',
	},
	{ needle: 'rolls', replacement: 'roll', reason: 'requested mapping' },
	{
		needle: 'salad supreme',
		replacement: 'salad supreme seasoning',
		reason: 'requested mapping',
	},
	{
		needle: 'soft breadcrumbs',
		replacement: 'breadcrumbs',
		reason: 'requested mapping',
	},
	{
		needle: 'soup bones',
		replacement: 'soup bone',
		reason: 'requested mapping',
	},
	{
		needle: 'special k',
		replacement: 'special k cereal',
		reason: 'requested mapping',
	},
	{
		needle: 'strawberry preserves',
		replacement: 'strawberry jam',
		reason: 'requested mapping',
	},
	{
		needle: 'sunflower seeds',
		replacement: 'sunflower seed',
		reason: 'requested mapping',
	},
	{
		needle: "sweet'n low",
		replacement: "sweet 'n low",
		reason: 'requested mapping',
	},
	{
		needle: 'tart shell',
		replacement: 'tart crust',
		reason: 'requested mapping',
	},
	{
		needle: 'tender quick',
		replacement: 'tender quick salt',
		reason: 'requested mapping',
	},
	{
		needle: 'thin spaghetti',
		replacement: 'spaghetti',
		reason: 'requested mapping',
	},
	{ needle: 'tomatoes', replacement: 'tomato', reason: 'requested mapping' },
	{
		needle: 'tri-color rotini',
		replacement: 'tricolor rotini',
		reason: 'requested mapping',
	},
	{
		needle: 'unflavored gelatine',
		replacement: 'unflavored gelatin',
		reason: 'requested mapping',
	},
	{
		needle: 'vanilla flavoring',
		replacement: 'vanilla extract',
		reason: 'requested mapping',
	},
	{
		needle: 'vegetable juice cocktail',
		replacement: 'vegetable juice',
		reason: 'requested mapping',
	},
	{
		needle: 'vegetables',
		replacement: 'vegetable',
		reason: 'requested mapping',
	},
	{
		needle: 'vermicelli spaghetti',
		replacement: 'vermicelli',
		reason: 'requested mapping',
	},
	{ needle: 'walnuts', replacement: 'walnut', reason: 'requested mapping' },
	{
		needle: 'water-packed tuna',
		replacement: 'tuna',
		reason: 'requested mapping',
	},
	{
		needle: 'white zinfandel wine',
		replacement: 'zinfandel',
		reason: 'requested mapping',
	},
	{
		needle: 'white zinfandel',
		replacement: 'zinfandel',
		reason: 'requested mapping',
	},
	{ needle: 'white tuna', replacement: 'tuna', reason: 'requested mapping' },
	{
		needle: 'yellowfin tuna',
		replacement: 'tuna',
		reason: 'requested mapping',
	},
	{
		needle: 'frozen lima bean',
		replacement: 'lima bean',
		reason: 'requested mapping',
	},
	{
		needle: 'crab boil concentrate',
		replacement: 'crab boil',
		reason: 'requested mapping',
	},
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
	{
		needle: 'anchovy fillets',
		replacement: 'anchovy',
		reason: 'requested mapping',
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
		needle: 'grain vodka',
		replacement: 'vodka',
		reason: 'requested mapping',
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
		needle: 'havana club',
		replacement: 'rum',
		reason: 'requested mapping',
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
		needle: 'hennessy brandy',
		replacement: 'brandy',
		reason: 'requested mapping',
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
	{
		needle: 'london dry gin',
		replacement: 'gin',
		reason: 'requested mapping',
	},
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
		needle: 'orange-flavor liqueur',
		replacement: 'triple sec',
		reason: 'requested mapping',
	},
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
	{
		needle: 'spiny lobster',
		replacement: 'lobster',
		reason: 'requested mapping',
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
		needle: 'wild alaskan salmon',
		replacement: 'salmon',
		reason: 'requested mapping',
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

async function applySplitReplaceRule(
	rule: SplitReplaceRule,
	ingredientsCollection: Collection<IngredientDoc>,
	recipesCollection: Collection<RecipeDoc>,
	stats: Stats,
): Promise<void> {
	const source = rule.needle.trim().toLowerCase();
	const replacements = rule.replacements.map((value) =>
		value.trim().toLowerCase(),
	);

	const regex = new RegExp(escRegex(source), 'i');
	const matches = (await ingredientsCollection
		.find({ name: { $regex: regex } })
		.toArray()) as IngredientDoc[];
	if (matches.length === 0) {
		return;
	}

	stats.splitRulesWithMatches += 1;
	const replacementIds = await Promise.all(
		replacements.map((replacement) =>
			getOrCreateIngredient(ingredientsCollection, replacement, stats),
		),
	);

	let changedDocs = 0;
	let addedRefs = 0;

	for (const doc of matches) {
		if (!doc._id) {
			continue;
		}

		stats.sourceIngredientsMatched += 1;
		const recipes = (await recipesCollection
			.find(
				{ 'ingredients.ingedientId': doc._id },
				{ projection: { ingredients: 1 } },
			)
			.toArray()) as Array<{ _id?: ObjectId; ingredients?: IngredientRef[] }>;

		for (const recipe of recipes) {
			if (!recipe._id) {
				continue;
			}

			const sourceRefs = (recipe.ingredients ?? []).filter((item) =>
				item.ingedientId?.equals(doc._id),
			);
			if (sourceRefs.length === 0) {
				continue;
			}

			const refTemplate = sourceRefs[0];
			const replacementRefs = replacementIds.map((replacementId, index) => ({
				ingredient: replacements[index],
				ingedientId: replacementId,
				quantity: refTemplate.quantity,
			}));
			const updatedIngredients = (recipe.ingredients ?? [])
				.filter((item) => !item.ingedientId?.equals(doc._id))
				.concat(replacementRefs);

			await recipesCollection.updateOne(
				{ _id: recipe._id },
				{ $set: { ingredients: updatedIngredients } },
			);

			addedRefs += replacementRefs.length;
		}

		const deleted = await ingredientsCollection.deleteOne({ _id: doc._id });
		if (deleted.deletedCount > 0) {
			changedDocs += deleted.deletedCount;
		}
	}

	stats.recipeRefsAdded += addedRefs;
	stats.ingredientDocsDeleted += changedDocs;

	if (changedDocs > 0 || addedRefs > 0) {
		console.log(
			`SPLIT contains "${source}" -> "${replacements.join(', ')}" (${rule.reason}) | ingredient docs: ${changedDocs}, refs added: ${addedRefs}`,
		);
	}
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
		rulesEvaluated:
			exactDeleteRules.length +
			splitReplaceRules.length +
			containsReplaceRules.length,
		replaceRulesWithMatches: 0,
		splitRulesWithMatches: 0,
		deleteRulesWithMatches: 0,
		sourceIngredientsMatched: 0,
		replacementIngredientsCreated: 0,
		recipeRefsRewired: 0,
		recipeRefsAdded: 0,
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

		for (const rule of splitReplaceRules) {
			await applySplitReplaceRule(
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
		console.log(`Split rules with matches: ${stats.splitRulesWithMatches}`);
		console.log(`Delete rules with matches: ${stats.deleteRulesWithMatches}`);
		console.log(
			`Source ingredient docs matched: ${stats.sourceIngredientsMatched}`,
		);
		console.log(
			`Replacement ingredient docs created: ${stats.replacementIngredientsCreated}`,
		);
		console.log(`Recipe refs rewired: ${stats.recipeRefsRewired}`);
		console.log(`Recipe refs added: ${stats.recipeRefsAdded}`);
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
