import { randomUUID } from 'node:crypto';
import type { IngredientPathResponse } from './ingredient-path-search';

type PathSearchJobStatus = 'pending' | 'done' | 'error';

type PathSearchJob = {
	id: string;
	status: PathSearchJobStatus;
	createdAt: number;
	updatedAt: number;
	result?: IngredientPathResponse;
	error?: string;
};

const JOB_TTL_MS = 10 * 60 * 1000;
const JOB_LIMIT = 500;
const jobs = new Map<string, PathSearchJob>();

function cleanupJobs(now: number): void {
	for (const [jobId, job] of jobs) {
		if (now - job.updatedAt > JOB_TTL_MS) {
			jobs.delete(jobId);
		}
	}

	if (jobs.size <= JOB_LIMIT) {
		return;
	}

	const sorted = Array.from(jobs.values()).sort(
		(left, right) => left.updatedAt - right.updatedAt,
	);
	const extra = sorted.length - JOB_LIMIT;
	for (let i = 0; i < extra; i += 1) {
		jobs.delete(sorted[i].id);
	}
}

export function createPathSearchJob(): PathSearchJob {
	const now = Date.now();
	cleanupJobs(now);

	const job: PathSearchJob = {
		id: randomUUID(),
		status: 'pending',
		createdAt: now,
		updatedAt: now,
	};

	jobs.set(job.id, job);
	return job;
}

export function getPathSearchJob(jobId: string): PathSearchJob | null {
	const job = jobs.get(jobId) ?? null;
	if (!job) {
		return null;
	}

	if (Date.now() - job.updatedAt > JOB_TTL_MS) {
		jobs.delete(jobId);
		return null;
	}

	return job;
}

export function completePathSearchJob(
	jobId: string,
	result: IngredientPathResponse,
): void {
	const job = jobs.get(jobId);
	if (!job) {
		return;
	}

	job.status = 'done';
	job.result = result;
	job.updatedAt = Date.now();
}

export function failPathSearchJob(jobId: string, error: unknown): void {
	const job = jobs.get(jobId);
	if (!job) {
		return;
	}

	job.status = 'error';
	job.error =
		typeof error === 'object' && error && 'statusMessage' in error
			? String((error as { statusMessage?: string }).statusMessage)
			: error instanceof Error
				? error.message
				: 'Path search failed.';
	job.updatedAt = Date.now();
}
