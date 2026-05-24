import { MongoClient, type Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getMongoDb(): Promise<Db> {
	if (db) {
		return db;
	}

	const config = useRuntimeConfig();
	const uri = config.mongodbUri;
	const dbName = config.mongodbDb;

	if (!uri) {
		throw createError({
			statusCode: 500,
			statusMessage: 'MONGODB_URI is not set',
		});
	}

	if (!client) {
		client = new MongoClient(uri);
		await client.connect();
	}

	db = client.db(dbName);
	return db;
}
