import { createReadStream } from 'fs';
import { Collection, MongoClient, ObjectId } from 'mongodb';
import { resolve } from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

type IngredientDoc = {
	_id?: ObjectId;
	name: string;
	type: string;
};

type RecipeIngredient = {
	ingredient: string;
	ingedientId: ObjectId;
	quantity: string;
};

type RecipeDoc = {
	title: string;
	ingredients: RecipeIngredient[];
	directions: string[];
	ner: string;
};

type ParsedRow = {
	title: string;
	ingredients: string[];
	directions: string[];
	nerIngredients: string[];
};

const { MONGODB_URI, MONGODB_DB, OPENAI_API_KEY, OPENAI_MODEL } = process.env;

if (!MONGODB_URI || !MONGODB_DB || !OPENAI_API_KEY || !OPENAI_MODEL) {
	throw new Error(
		'Missing required env vars. Expected MONGODB_URI, MONGODB_DB, OPENAI_API_KEY, OPENAI_MODEL.',
	);
}

const mongodbUri = MONGODB_URI;
const mongodbDb = MONGODB_DB;
const openaiApiKey = OPENAI_API_KEY;
const openaiModel = OPENAI_MODEL;

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const DATASET_PATH = resolve(__dirname, '..', 'dataset', 'full_dataset.csv');

const ingredientTypeCache = new Map<string, string>();
const normalizedIngredientCache = new Map<
	string,
	{ name: string; isFood: boolean }
>();
const NON_INGREDIENT_TERMS = new Set([
	'also',
	'love',
	'balloon',
	'balloons',
	'bake',
	'taco',
	'tacos',
	'sandwich',
	'sandwiches',
	'cake',
	'cakes',
	'angel',
	'wrapper',
	'wrappers',
]);
const NON_INGREDIENT_PHRASES = new Set(['chocolate fudge cake']);
const EXACT_DELETE_INGREDIENT_NAMES = new Set([
	'all-purpose seasoning',
	'batter',
	'cracker barrel',
	'dough',
	'fry',
	'herb',
	'herb blend',
	'herb mix',
	'herbs',
	'instant chocolate',
	'instant chicken',
	'mixed herbs',
	'new',
	'nestle',
	'paraffin wax',
	'sauce',
	'soup',
	'spaghetti dinner',
]);
const EXACT_CANONICAL_REPLACEMENTS = new Map<string, string>([
	['all-purpose flour', 'flour'],
	['andouille', 'andouille sausage'],
	['bay', 'bay leaf'],
	['beef tips', 'beef tip'],
	['bread crumbs', 'breadcrumbs'],
	['bread-crumbs', 'breadcrumbs'],
	['breast', 'chicken breast'],
	['catsup', 'ketchup'],
	['chicken gumbo', 'chicken gumbo soup'],
	['chicken mushroom', 'chicken mushroom soup'],
	['chile', 'chili'],
	['chocolate chips', 'chocolate chip'],
	['chocolate fudge topping', 'chocolate fudge frosting'],
	['consomme', 'consommé'],
	['cooking sherry', 'sherry'],
	['coriander', 'coriander seed'],
	['cornflake', 'cornflakes'],
	['crabmeat', 'crab meat'],
	['cracklings', 'crackling'],
	['cranberries', 'cranberry'],
	['cranberry bean', 'cranberry'],
	['cranberry orange relish', 'cranberry-orange relish'],
	['cream cheese filling', 'cream cheese'],
	['cream of mushroom', 'cream of mushroom soup'],
	['creme', 'cream'],
	['crescent rolls', 'crescent roll'],
	['crisco oil', 'crisco'],
	['crisp rice cereal', 'crispy rice cereal'],
	['croutons', 'crouton'],
	['deer meat', 'deer'],
	['egg nog', 'eggnog'],
	['fusilli', 'fusilli pasta'],
	['frying chicken', 'chicken'],
	['frozen vegetable mix', 'frozen vegetables'],
	['glutamate', 'monosodium glutamate'],
	['green peas', 'green pea'],
	['grenadine', 'grenadine syrup'],
	['ground cayenne', 'cayenne'],
	['ground cayenne pepper', 'cayenne'],
	['hash brown', 'hash browns'],
	['hash brown potato', 'hash browns'],
	['hash brown potatoes', 'hash browns'],
	['heath bar chips', 'heath bar'],
	['heath bits', 'heath bar'],
	['heath candy bar', 'heath bar'],
	['honeydew', 'honeydew melon'],
	['imitation crabmeat', 'imitation crab'],
	['irish whiskey', 'whiskey'],
	['jalapeno', 'jalapeño'],
	['lentils', 'lentil'],
	['meatballs', 'meatball'],
	["miniature reese's", "mini reese's"],
	['miniature marshmallows', 'mini marshmallows'],
	['monterey jack', 'monterey jack cheese'],
	['mozzarella', 'mozzarella cheese'],
	['muenster', 'muenster cheese'],
	['navy beans', 'navy bean'],
	['oat', 'oats'],
	['olives', 'olive'],
	['orange flavored drink', 'orange drink'],
	['oreo', 'oreo cookie'],
	['parmesan', 'parmesan cheese'],
	['potato chips', 'potato chip'],
	['pretzels', 'pretzel'],
	['process cheese', 'processed cheese'],
	['provolone', 'provolone cheese'],
	['pumpkin pie filling', 'pumpkin filling'],
	['ramen', 'ramen noodles'],
	['ramen noodle', 'ramen noodles'],
	['ranch', 'ranch dressing'],
	['ranch-style salad dressing', 'ranch dressing'],
	['raspberries', 'raspberry'],
	['red hot', 'red hot candy'],
	['red hot cinnamon', 'red hot candy'],
	['red karo', 'red karo syrup'],
	['rice chex', 'rice chex cereal'],
	['ricotta', 'ricotta cheese'],
	['romano', 'romano cheese'],
	['ro-tel', 'ro-tel chili'],
	['rye whiskey', 'whiskey'],
	['saltine', 'saltine cracker'],
	['sausage meat', 'sausage'],
	['sherry cooking wine', 'sherry'],
	['sherry wine', 'sherry'],
	['sharp cheddar', 'sharp cheddar cheese'],
	['snickers', 'snickers bar'],
	['snow peas', 'snow pea'],
	['soda crackers', 'soda cracker'],
	['strawberries', 'strawberry'],
	['tabasco', 'tabasco sauce'],
	['tomato ketchup', 'ketchup'],
	['tomato pate', 'tomato paste'],
	['tuna steak', 'tuna'],
	['velveeta', 'velveeta cheese'],
	['wing', 'chicken wing'],
	['worcestershire', 'worcestershire sauce'],
	['yellow lima beans', 'yellow lima bean'],
	['7 up', '7-up soda'],
	['7-up', '7-up soda'],
	['all bran', 'all-bran cereal'],
	['all-bran', 'all-bran cereal'],
	['broccoli florets', 'broccoli'],
	['egg noodles', 'egg noodle'],
	['graham cracker crumbs', 'graham cracker crumb'],
	['jello', 'jell-o'],
	['lemon jello', 'lemon jell-o'],
	['tater', 'potato'],
	['taters', 'potato'],
]);
const ALLOWED_INGREDIENT_CATEGORIES = new Set([
	'beef',
	'fish',
	'poultry',
	'pork',
	'vegetable',
	'fruit',
	'cheese',
	'spice',
	'dairy',
	'grain',
	'herb',
	'oil',
	'sweetener',
	'condiment',
	'legume',
	'nut',
	'other',
]);

function formatDuration(totalSeconds: number): string {
	if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
		return 'unknown';
	}

	const sec = Math.floor(totalSeconds % 60);
	const min = Math.floor((totalSeconds / 60) % 60);
	const hrs = Math.floor(totalSeconds / 3600);

	if (hrs > 0) {
		return `${hrs}h ${min}m ${sec}s`;
	}

	if (min > 0) {
		return `${min}m ${sec}s`;
	}

	return `${sec}s`;
}

function parseCsvLine(line: string): string[] {
	const values: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i += 1) {
		const ch = line[i];

		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i += 1;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}

		if (ch === ',' && !inQuotes) {
			values.push(current);
			current = '';
			continue;
		}

		current += ch;
	}

	values.push(current);
	return values;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeJsonStringArray(raw: string): string[] {
	if (!raw) {
		return [];
	}

	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return parsed.map((x) => String(x).trim()).filter((x) => x.length > 0);
		}
		return [];
	} catch {
		return [];
	}
}

function splitNerIngredients(raw: string): string[] {
	const jsonValues = safeJsonStringArray(raw);

	if (jsonValues.length > 0) {
		return jsonValues
			.flatMap((value) => value.split(','))
			.map((value) => cleanIngredientName(value))
			.filter((value) => value.length > 0);
	}

	return raw
		.split(',')
		.map((value) => cleanIngredientName(value))
		.filter((value) => value.length > 0);
}

function normalizeIngredientName(name: string): string {
	return name
		.replace(/\([^)]*\)/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function applyIngredientCanonicalRules(name: string): string {
	let normalized = normalizeIngredientName(name);
	normalized = normalized.replace(/\bjello\b/g, 'jell-o');
	normalized = normalized.replace(/\bbread\s*[- ]\s*crumbs\b/g, 'breadcrumbs');
	normalized = normalized.replace(
		/\bsemi\s*[- ]?sweet chocolate (?:chips|morsels|pieces)\b/g,
		'chocolate chips',
	);

	const exactMapped = EXACT_CANONICAL_REPLACEMENTS.get(normalized);
	if (exactMapped) {
		normalized = exactMapped;
	}

	return normalizeIngredientName(normalized);
}

function isBlockedNonIngredient(name: string): boolean {
	const normalized = applyIngredientCanonicalRules(name);
	if (!normalized) {
		return true;
	}

	if (NON_INGREDIENT_TERMS.has(normalized)) {
		return true;
	}

	if (NON_INGREDIENT_PHRASES.has(normalized)) {
		return true;
	}

	if (EXACT_DELETE_INGREDIENT_NAMES.has(normalized)) {
		return true;
	}

	return false;
}

function splitIngredientCandidates(raw: string): string[] {
	const source = cleanIngredientName(raw);
	if (!source) {
		return [];
	}

	const rewritten = source
		.replace(/\band\/or\b/gi, ',')
		.replace(/\bor\b/gi, ',')
		.replace(/\band\b/gi, ',');

	const parts = rewritten
		.split(',')
		.map((part) => cleanIngredientName(part))
		.map((part) =>
			part
				.replace(/^or\s+/i, '')
				.replace(/^and\s+/i, '')
				.trim(),
		)
		.filter((part) => part.length > 0)
		.filter((part) => !/^(and|or)$/i.test(part));

	if (parts.length <= 1) {
		return [source];
	}

	return parts;
}

function splitQuantityAndName(raw: string): { quantity: string; name: string } {
	const clean = raw.replace(/\s+/g, ' ').trim();
	if (!clean) {
		return { quantity: '', name: '' };
	}

	const amountMatch = clean.match(
		/^(?<amount>\d+\s\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\b\s*(?<rest>.*)$/i,
	);

	if (!amountMatch?.groups) {
		return { quantity: '', name: cleanIngredientName(clean) };
	}

	const amount = (amountMatch.groups.amount ?? '').trim();
	let rest = (amountMatch.groups.rest ?? '').trim();

	const sizeMatch = rest.match(
		/^(?<size>small|medium|large|extra\s*large|extra-large|jumbo)\b\s*/i,
	);
	const size = (sizeMatch?.groups?.size ?? '').trim();
	if (sizeMatch) {
		rest = rest.slice(sizeMatch[0].length).trim();
	}

	const measurementMatch = rest.match(
		/^(?<measurement>\(\s*\d+(?:\.\d+)?\s*(?:oz|ounce|ounces|lb|lbs|pound|pounds|g|gram|grams|kg|kilogram|kilograms|ml|milliliter|milliliters|l|liter|liters)\.?\s*\))\s*/i,
	);
	const measurement = (measurementMatch?.groups?.measurement ?? '').trim();
	if (measurementMatch) {
		rest = rest.slice(measurementMatch[0].length).trim();
	}

	const unitMatch = rest.match(
		/^(?<unit>cup|cups|tablespoon|tablespoons|tbsp\.?|teaspoon|teaspoons|tsp\.?|oz|ounce|ounces|lb|lbs|pound|pounds|g|gram|grams|kg|kilogram|kilograms|ml|milliliter|milliliters|l|liter|liters|can|cans|pkg\.?|package|packages|packet|packets|container|containers|box|boxes|jar|jars|bottle|bottles|clove|cloves|stick|sticks|slice|slices|bunch|bunches|sprig|sprigs|pinch|dash)\b\s*/i,
	);
	const unit = (unitMatch?.groups?.unit ?? '').trim();
	if (unitMatch) {
		rest = rest.slice(unitMatch[0].length).trim();
	}

	let quantity = amount;
	if (unit.length > 0) {
		quantity = [amount, size, measurement, unit].filter(Boolean).join(' ');
	} else if (measurement.length > 0) {
		quantity = [amount, measurement].filter(Boolean).join(' ');
	}

	let name = rest;

	name = cleanIngredientName(name);

	if (name.length === 0) {
		return { quantity, name: '' };
	}

	return { quantity, name };
}

function cleanIngredientName(name: string): string {
	let result = name.trim();

	result = result.replace(/^[,.;:\-\s]+/, '').trim();

	const removableSuffixes = [
		/,\s*to taste$/i,
		/\s+to taste$/i,
		/,\s*cubed$/i,
		/,\s*cut\s+into\s+strips$/i,
		/,\s*cut\s+up$/i,
		/,\s*cut\s+into\s+[^,]+$/i,
		/^cut\s+into\s+strips$/i,
		/^cut\s+up$/i,
		/^cubed$/i,
	];

	let changed = true;
	while (changed) {
		changed = false;
		for (const pattern of removableSuffixes) {
			const next = result.replace(pattern, '').trim();
			if (next !== result) {
				result = next;
				changed = true;
			}
		}
	}

	result = result.replace(/^[,.;:\-\s]+/, '').trim();

	return result;
}

function heuristicIngredientType(name: string): string | null {
	const n = name.toLowerCase();

	if (/(^|\s)(egg|eggs|egg\s+white|egg\s+yolk)s?(\s|$)/.test(n)) {
		return 'other';
	}

	if (
		/\b(garlic powder|onion powder|chili powder|cayenne|paprika|cumin|turmeric|cinnamon|nutmeg|allspice|cloves?|peppercorn|black pepper|white pepper|red pepper|salt|seasoning)\b/.test(
			n,
		)
	) {
		return 'spice';
	}

	if (/\b(graham cracker|cracker crumbs?|bread crumbs?)\b/.test(n)) {
		return 'grain';
	}

	if (/\bpeanut butter\b/.test(n)) {
		return 'nut';
	}

	const rules: Array<{ type: string; keys: string[] }> = [
		{ type: 'beef', keys: ['beef', 'steak', 'sirloin', 'brisket'] },
		{
			type: 'fish',
			keys: ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'shrimp'],
		},
		{ type: 'poultry', keys: ['chicken', 'turkey', 'duck'] },
		{ type: 'pork', keys: ['pork', 'bacon', 'ham', 'sausage'] },
		{
			type: 'vegetable',
			keys: ['onion', 'garlic', 'carrot', 'pepper', 'tomato', 'spinach'],
		},
		{
			type: 'fruit',
			keys: ['apple', 'banana', 'lemon', 'lime', 'orange', 'berry'],
		},
		{
			type: 'cheese',
			keys: ['cheese', 'cheddar', 'mozzarella', 'parmesan', 'feta'],
		},
		{ type: 'dairy', keys: ['milk', 'cream', 'yogurt', 'butter'] },
		{ type: 'grain', keys: ['rice', 'flour', 'bread', 'pasta', 'oat'] },
		{
			type: 'spice',
			keys: ['salt', 'pepper', 'paprika', 'cumin', 'oregano', 'thyme'],
		},
		{ type: 'oil', keys: ['oil', 'olive oil', 'sesame oil'] },
		{ type: 'sweetener', keys: ['sugar', 'honey', 'syrup', 'molasses'] },
		{ type: 'nut', keys: ['almond', 'walnut', 'pecan', 'cashew', 'peanut'] },
		{ type: 'grain', keys: ['cracker', 'crumb', 'breadcrumb', 'bread crumb'] },
	];

	for (const rule of rules) {
		if (rule.keys.some((k) => n.includes(k))) {
			return rule.type;
		}
	}

	return null;
}

async function classifyIngredientType(name: string): Promise<string> {
	const normalized = normalizeIngredientName(name);

	if (ingredientTypeCache.has(normalized)) {
		return ingredientTypeCache.get(normalized) as string;
	}

	const heuristicType = heuristicIngredientType(normalized);
	if (heuristicType) {
		ingredientTypeCache.set(normalized, heuristicType);
		return heuristicType;
	}

	const prompt = [
		'Classify the ingredient into exactly one category from this allowed list:',
		'beef, fish, poultry, pork, vegetable, fruit, cheese, spice, dairy, grain, herb, oil, sweetener, condiment, legume, nut, other.',
		'Use culinary meaning, not naive substring matching.',
		'Rules:',
		'- seasoning powders and dried seasonings (for example garlic powder, onion powder, chili powder) => spice.',
		'- peanut butter and other nut butters => nut (not dairy).',
		'- eggs are not dairy; use other unless the item clearly belongs to another allowed class.',
		'- cracker crumbs, graham cracker crumbs, bread crumbs => grain (not pork).',
		'- plain garlic/onion used as produce => vegetable; but garlic powder/onion powder => spice.',
		'Return only one lowercase category token from the allowed list.',
		`Ingredient: ${normalized}`,
	].join('\n');

	try {
		const response = await fetch('https://api.openai.com/v1/responses', {
			method: 'POST',
			signal: AbortSignal.timeout(20_000),
			headers: {
				Authorization: `Bearer ${openaiApiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: openaiModel,
				input: prompt,
				max_output_tokens: 16,
			}),
		});

		if (!response.ok) {
			throw new Error(`OpenAI request failed: ${response.status}`);
		}

		const data = (await response.json()) as {
			output_text?: string;
			output?: Array<{ content?: Array<{ text?: string }> }>;
		};

		let category = (data.output_text || '').trim().toLowerCase();

		if (!category && Array.isArray(data.output)) {
			const maybe = data.output
				.flatMap((o) => o.content || [])
				.map((c) => c.text || '')
				.join(' ')
				.trim()
				.toLowerCase();
			category = maybe;
		}

		category = category.split(/\s+/)[0]?.replace(/[^a-z-]/g, '') || 'other';
		if (!ALLOWED_INGREDIENT_CATEGORIES.has(category)) {
			category = 'other';
		}
		if (!category) {
			category = 'other';
		}

		ingredientTypeCache.set(normalized, category);
		return category;
	} catch {
		ingredientTypeCache.set(normalized, 'other');
		return 'other';
	}
}

async function normalizeIngredientWithGpt(
	rawName: string,
): Promise<{ name: string; isFood: boolean }> {
	const seed = applyIngredientCanonicalRules(rawName);
	if (!seed) {
		return { name: '', isFood: false };
	}

	if (isBlockedNonIngredient(seed)) {
		const blocked = { name: '', isFood: false };
		normalizedIngredientCache.set(seed, blocked);
		return blocked;
	}

	if (normalizedIngredientCache.has(seed)) {
		return normalizedIngredientCache.get(seed) as {
			name: string;
			isFood: boolean;
		};
	}

	const prompt = [
		'Normalize this candidate into a canonical food ingredient name.',
		'Requirements:',
		'- Remove quantity and units.',
		'- Remove prep instructions/adjectives (for example "banana, mashed" => "banana").',
		'- Depluralize (for example "bananas" => "banana").',
		'- Convert "jello" to "jell-o".',
		'- Convert "tater" or "taters" to "potato".',
		'- Convert "broccoli florets" to "broccoli".',
		'- Fix obvious spelling mistakes (for example "bakon" => "bacon").',
		'- Minimize to the fewest words that preserve ingredient identity (for example "beef bouillon concentrate" => "beef bouillon").',
		'- Reject non-food words or actions (for example "also", "love", "balloons", "bake", "taco", "sandwich", "cake", "angel", "chocolate fudge cake", "wrapper").',
		'Respond with strict JSON only, no markdown:',
		'{"isFood": boolean, "name": string}',
		'If not a valid food ingredient, return {"isFood": false, "name": ""}.',
		`Candidate: ${seed}`,
	].join('\n');

	try {
		const response = await fetch('https://api.openai.com/v1/responses', {
			method: 'POST',
			signal: AbortSignal.timeout(20_000),
			headers: {
				Authorization: `Bearer ${openaiApiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: openaiModel,
				input: prompt,
				max_output_tokens: 80,
			}),
		});

		if (!response.ok) {
			throw new Error(`OpenAI request failed: ${response.status}`);
		}

		const data = (await response.json()) as {
			output_text?: string;
			output?: Array<{ content?: Array<{ text?: string }> }>;
		};

		let text = (data.output_text || '').trim();
		if (!text && Array.isArray(data.output)) {
			text = data.output
				.flatMap((o) => o.content || [])
				.map((c) => c.text || '')
				.join(' ')
				.trim();
		}

		if (!text) {
			const fallback = { name: '', isFood: false };
			normalizedIngredientCache.set(seed, fallback);
			return fallback;
		}

		const jsonMatch = text.match(/\{[\s\S]*\}/);
		const jsonText = (jsonMatch?.[0] || text).trim();
		const parsed = JSON.parse(jsonText) as {
			isFood?: unknown;
			name?: unknown;
		};

		const isFood = parsed.isFood === true;
		const normalized = isFood
			? applyIngredientCanonicalRules(String(parsed.name ?? ''))
			: '';

		if (!isFood || !normalized || isBlockedNonIngredient(normalized)) {
			const rejected = { name: '', isFood: false };
			normalizedIngredientCache.set(seed, rejected);
			return rejected;
		}

		const accepted = { name: normalized, isFood: true };
		normalizedIngredientCache.set(seed, accepted);
		return accepted;
	} catch {
		const fallback = { name: '', isFood: false };
		normalizedIngredientCache.set(seed, fallback);
		return fallback;
	}
}

function findValueByHeader(
	headers: string[],
	values: string[],
	name: string,
): string {
	const idx = headers.findIndex(
		(h) => h.trim().toLowerCase() === name.toLowerCase(),
	);
	if (idx < 0 || idx >= values.length) {
		return '';
	}
	return values[idx] ?? '';
}

function parseRow(headers: string[], line: string): ParsedRow | null {
	const values = parseCsvLine(line);

	if (!values.length) {
		return null;
	}

	const title = findValueByHeader(headers, values, 'title').trim();
	if (!title) {
		return null;
	}

	const ingredients = safeJsonStringArray(
		findValueByHeader(headers, values, 'ingredients'),
	);
	const directions = safeJsonStringArray(
		findValueByHeader(headers, values, 'directions'),
	);
	const nerIngredients = splitNerIngredients(
		findValueByHeader(headers, values, 'NER'),
	);

	return {
		title,
		ingredients,
		directions,
		nerIngredients,
	};
}

async function countDataLines(path: string): Promise<number> {
	const rl = readline.createInterface({
		input: createReadStream(path),
		crlfDelay: Infinity,
	});

	let count = 0;
	for await (const _line of rl) {
		count += 1;
	}

	return Math.max(0, count - 1);
}

async function upsertIngredient(
	ingredientsCollection: Collection<IngredientDoc>,
	namedIngredient: string,
	rawIngredient: string,
): Promise<RecipeIngredient[]> {
	const split = splitQuantityAndName(rawIngredient);
	const quantity = split.quantity;
	const candidates = splitIngredientCandidates(namedIngredient);

	if (candidates.length === 0) {
		return [];
	}

	const refs: RecipeIngredient[] = [];
	const seenIds = new Set<string>();

	for (const candidate of candidates) {
		const normalizedName = applyIngredientCanonicalRules(candidate);

		if (!normalizedName || isBlockedNonIngredient(normalizedName)) {
			continue;
		}

		let existing = (await ingredientsCollection.findOne({
			name: normalizedName,
		})) as IngredientDoc | null;

		let ingredientId: ObjectId;

		if (existing?._id) {
			ingredientId = existing._id;
		} else {
			const normalized = await normalizeIngredientWithGpt(normalizedName);
			if (!normalized.isFood || !normalized.name) {
				continue;
			}

			existing = (await ingredientsCollection.findOne({
				name: normalized.name,
			})) as IngredientDoc | null;

			if (existing?._id) {
				ingredientId = existing._id;
			} else {
				const type = await classifyIngredientType(normalized.name);
				const insert = await ingredientsCollection.insertOne({
					name: normalized.name,
					type,
				} as IngredientDoc);
				ingredientId = insert.insertedId;
			}
		}

		const key = ingredientId.toHexString();
		if (seenIds.has(key)) {
			continue;
		}

		seenIds.add(key);
		refs.push({
			ingredient: rawIngredient,
			ingedientId: ingredientId,
			quantity,
		});
	}

	return refs;
}

async function resolveRecipeTitle(
	recipesCollection: Collection<RecipeDoc>,
	baseTitle: string,
): Promise<string> {
	const escapedBaseTitle = escapeRegExp(baseTitle);
	const titleRegex = new RegExp(`^${escapedBaseTitle}(?: v\\d+)?$`);
	const matches = (await recipesCollection
		.find(
			{ title: { $regex: titleRegex } },
			{ projection: { _id: 0, title: 1 } },
		)
		.toArray()) as Array<{ title?: string }>;

	if (matches.length === 0) {
		return baseTitle;
	}

	let maxVersion = 1;
	for (const doc of matches) {
		const title = (doc.title ?? '').trim();
		if (title === baseTitle) {
			maxVersion = Math.max(maxVersion, 1);
			continue;
		}

		const versionMatch = title.match(
			new RegExp(`^${escapedBaseTitle} v(\\d+)$`),
		);
		if (!versionMatch) {
			continue;
		}

		const version = Number.parseInt(versionMatch[1] ?? '', 10);
		if (Number.isFinite(version) && version >= 2) {
			maxVersion = Math.max(maxVersion, version);
		}
	}

	return `${baseTitle} v${maxVersion + 1}`;
}

async function importCsvData(): Promise<void> {
	const client = new MongoClient(mongodbUri);

	await client.connect();

	try {
		const db = client.db(mongodbDb);
		const ingredientsCollection = db.collection<IngredientDoc>('Ingredients');
		const recipesCollection = db.collection<RecipeDoc>('Recipes');

		await ingredientsCollection.createIndex({ name: 1 }, { unique: true });
		await recipesCollection.createIndex({ title: 1 }, { unique: true });
		await recipesCollection.createIndex({ 'ingredients.ingedientId': 1 });

		const totalRows = await countDataLines(DATASET_PATH);
		if (totalRows === 0) {
			console.log('No data rows found in CSV.');
			return;
		}

		console.log(`Starting import for ${totalRows} rows.`);

		const rl = readline.createInterface({
			input: createReadStream(DATASET_PATH),
			crlfDelay: Infinity,
		});

		let headers: string[] = [];
		let lineNumber = 0;
		let processed = 0;
		let inserted = 0;
		let skipped = 0;
		let failed = 0;
		let lastPercentPrinted = -1;
		let lastProgressLogTime = Date.now();
		let lastProgressProcessed = 0;
		const startedAt = Date.now();
		const PROGRESS_LOG_INTERVAL_MS = 5_000;
		const PROGRESS_LOG_EVERY_ROWS = 500;

		for await (const line of rl) {
			lineNumber += 1;

			if (lineNumber === 1) {
				headers = parseCsvLine(line).map((h) => h.trim());
				continue;
			}

			processed += 1;

			try {
				const parsed = parseRow(headers, line);
				if (!parsed) {
					skipped += 1;
					continue;
				}

				const ingredientRefs: RecipeIngredient[] = [];
				let lastRowHeartbeatAt = Date.now();
				for (
					let ingredientIndex = 0;
					ingredientIndex < parsed.ingredients.length;
					ingredientIndex += 1
				) {
					const rawIngredient = parsed.ingredients[ingredientIndex] ?? '';
					if (!rawIngredient) {
						continue;
					}
					const nerIngredient =
						parsed.nerIngredients[ingredientIndex] ||
						splitQuantityAndName(rawIngredient).name;
					if (!nerIngredient) {
						continue;
					}
					const heartbeatNow = Date.now();
					if (heartbeatNow - lastRowHeartbeatAt >= 5_000) {
						process.stdout.write(
							`\rWorking row ${processed}/${totalRows} | ingredient ${ingredientIndex + 1}/${parsed.ingredients.length}`,
						);
						lastRowHeartbeatAt = heartbeatNow;
					}

					const refs = await upsertIngredient(
						ingredientsCollection,
						nerIngredient,
						rawIngredient,
					);
					if (refs.length > 0) {
						ingredientRefs.push(...refs);
					}
				}

				const recipeTitle = await resolveRecipeTitle(
					recipesCollection,
					parsed.title,
				);

				const recipeDoc: RecipeDoc = {
					title: recipeTitle,
					ingredients: ingredientRefs,
					directions: parsed.directions,
					ner: parsed.nerIngredients.join(', '),
				};

				await recipesCollection.insertOne(recipeDoc);

				inserted += 1;
			} catch (error) {
				failed += 1;
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Failed on data row ${processed}: ${message}`);
			}

			const percent = Math.floor((processed / totalRows) * 100);
			const now = Date.now();
			const shouldLog =
				percent > lastPercentPrinted ||
				processed === totalRows ||
				now - lastProgressLogTime >= PROGRESS_LOG_INTERVAL_MS ||
				processed - lastProgressProcessed >= PROGRESS_LOG_EVERY_ROWS;

			if (shouldLog) {
				lastPercentPrinted = Math.max(lastPercentPrinted, percent);
				lastProgressLogTime = now;
				lastProgressProcessed = processed;

				const elapsedSeconds = (now - startedAt) / 1000;
				const rowsPerSecond =
					elapsedSeconds > 0 ? processed / elapsedSeconds : 0;
				const remainingRows = Math.max(0, totalRows - processed);
				const etaSeconds =
					rowsPerSecond > 0
						? remainingRows / rowsPerSecond
						: Number.POSITIVE_INFINITY;

				process.stdout.write(
					`\rProgress: ${percent}% (${processed}/${totalRows}) | ${rowsPerSecond.toFixed(1)} rows/s | ETA ${formatDuration(etaSeconds)}`,
				);
			}
		}

		process.stdout.write('\n');
		console.log('Import complete.');
		console.log(`Processed: ${processed}`);
		console.log(`Inserted/Updated recipes: ${inserted}`);
		console.log(`Skipped: ${skipped}`);
		console.log(`Failed: ${failed}`);
	} finally {
		await client.close();
	}
}

importCsvData().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Import failed: ${message}`);
	process.exitCode = 1;
});
