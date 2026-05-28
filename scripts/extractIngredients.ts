import { promises as fs } from 'fs';
import { MongoClient } from 'mongodb';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

type IngredientRow = {
	_id: string;
	name: string;
	type: string;
	count: string;
	creationDate: string;
};

const { MONGODB_URI, MONGODB_DB, INGREDIENTS_CSV_PATH } = process.env;

if (!MONGODB_URI || !MONGODB_DB) {
	throw new Error(
		'Missing required env vars. Expected MONGODB_URI and MONGODB_DB.',
	);
}

const mongodbUri = MONGODB_URI;
const mongodbDb = MONGODB_DB;

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const OUTPUT_PATH = INGREDIENTS_CSV_PATH
	? resolve(INGREDIENTS_CSV_PATH)
	: resolve(__dirname, '..', 'dataset', 'ingredients.csv');

function escapeCsvValue(value: string): string {
	const normalized = String(value ?? '');
	if (/[",\r\n]/.test(normalized)) {
		return `"${normalized.replace(/"/g, '""')}"`;
	}
	return normalized;
}

function toCsv(rows: IngredientRow[]): string {
	const header = '_id,name,type,count,creationDate';
	const lines = rows.map((row) =>
		[
			escapeCsvValue(row._id),
			escapeCsvValue(row.name),
			escapeCsvValue(row.type),
			escapeCsvValue(row.count),
			escapeCsvValue(row.creationDate),
		].join(','),
	);
	return `${header}\n${lines.join('\n')}\n`;
}

async function getIngredientCollection(db: ReturnType<MongoClient['db']>) {
	const preferredCollections = ['Ingredients'];

	for (const name of preferredCollections) {
		const count = await db.collection(name).estimatedDocumentCount();
		if (count > 0) {
			return db.collection(name);
		}
	}

	for (const name of preferredCollections) {
		const exists = await db
			.listCollections({ name }, { nameOnly: true })
			.hasNext();
		if (exists) {
			return db.collection(name);
		}
	}

	return db.collection('Ingredients');
}

async function extractIngredients(): Promise<void> {
	const client = new MongoClient(mongodbUri);
	await client.connect();

	try {
		const db = client.db(mongodbDb);
		const ingredientsCollection = await getIngredientCollection(db);

		const rawDocs = await ingredientsCollection
			.find(
				{},
				{
					projection: {
						_id: 1,
						name: 1,
						type: 1,
						recipeCount: 1,
						creationDate: 1,
					},
				},
			)
			.sort({ creationDate: 1, name: 1 })
			.toArray();

		const rows: IngredientRow[] = rawDocs.map((doc) => ({
			_id: String(doc._id ?? ''),
			name: String(doc.name ?? ''),
			type: String(doc.type ?? ''),
			count: String(doc.recipeCount ?? ''),
			creationDate:
				doc.creationDate instanceof Date
					? doc.creationDate.toISOString()
					: String(doc.creationDate ?? ''),
		}));

		const csv = toCsv(rows);
		await fs.mkdir(resolve(OUTPUT_PATH, '..'), { recursive: true });
		await fs.writeFile(OUTPUT_PATH, csv, 'utf8');

		console.log(`Wrote ${rows.length} ingredients to ${OUTPUT_PATH}`);
	} finally {
		await client.close();
	}
}

extractIngredients().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Extract failed: ${message}`);
	process.exitCode = 1;
});
