export default defineEventHandler(async () => {
	const db = await getMongoDb();

	const admin = db.admin();
	const ping = await admin.ping();

	return {
		ok: ping.ok === 1,
		db: db.databaseName,
		timestamp: new Date().toISOString(),
	};
});
