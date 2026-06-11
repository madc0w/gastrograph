import { randomUUID } from 'node:crypto';
import type { GraphProgressStage, GraphResponse } from './graph-build';

type GraphSearchJobStatus = 'pending' | 'done' | 'error';

export type GraphSearchJob = {
	id: string;
	status: GraphSearchJobStatus;
	progress: number;
	stage: GraphProgressStage;
	message: string;
	createdAt: number;
	updatedAt: number;
	result?: GraphResponse;
	error?: string;
};

const JOB_TTL_MS = 60 * 60 * 1000;
const JOB_LIMIT = 500;
const jobs = new Map<string, GraphSearchJob>();

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

export function createGraphSearchJob(): GraphSearchJob {
	const now = Date.now();
	cleanupJobs(now);

	const job: GraphSearchJob = {
		id: randomUUID(),
		status: 'pending',
		progress: 0,
		stage: 'validating',
		message: 'Queued',
		createdAt: now,
		updatedAt: now,
	};

	jobs.set(job.id, job);
	return job;
}

export function getGraphSearchJob(jobId: string): GraphSearchJob | null {
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

export function updateGraphSearchJobProgress(
	jobId: string,
	update: {
		progress: number;
		stage: GraphProgressStage;
		message: string;
	},
): void {
	const job = jobs.get(jobId);
	if (!job || job.status !== 'pending') {
		return;
	}

	job.progress = Math.max(job.progress, Math.min(100, update.progress));
	job.stage = update.stage;
	job.message = update.message;
	job.updatedAt = Date.now();
}

export function completeGraphSearchJob(
	jobId: string,
	result: GraphResponse,
): void {
	const job = jobs.get(jobId);
	if (!job) {
		return;
	}

	job.status = 'done';
	job.result = result;
	job.progress = 100;
	job.stage = 'complete';
	job.message = 'Graph ready';
	job.updatedAt = Date.now();
}

export function failGraphSearchJob(jobId: string, error: unknown): void {
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
				: 'Graph search failed.';
	job.message = 'Failed';
	job.updatedAt = Date.now();
}
