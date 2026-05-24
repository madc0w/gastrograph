<template>
	<main class="page">
		<section class="shell">
			<header class="hero">
				<p class="eyebrow">Flavor Network Explorer</p>
				<h1>Gastrograph</h1>
				<p class="subtitle">
					Pick an ingredient to map which other ingredients most often appear
					with it across recipes.
				</p>
			</header>

			<section class="searchPanel">
				<form class="searchForm" @submit.prevent="submitIngredient">
					<label for="ingredient-input">Ingredient</label>
					<div class="inputRow">
						<input
							id="ingredient-input"
							ref="inputRef"
							v-model="query"
							type="text"
							autocomplete="off"
							placeholder="Try garlic, butter, tomato..."
							@focus="onInputFocus"
							@keydown="onInputKeydown"
						/>
						<button type="submit" :disabled="graphLoading">OK</button>
					</div>

					<ul v-if="showSuggestions" class="suggestions" role="listbox">
						<li
							v-for="(item, index) in suggestions"
							:key="item.name"
							class="suggestion"
							:class="{ active: index === activeSuggestionIndex }"
							role="option"
							@click="selectSuggestion(item.name)"
						>
							<span>{{ item.name }}</span>
							<small>{{ item.type }}</small>
						</li>
					</ul>
				</form>

				<p v-if="hintText" class="hint">{{ hintText }}</p>
				<p v-if="errorText" class="error">{{ errorText }}</p>
			</section>

			<section class="graphPanel">
				<div class="legend">
					<p v-if="centerName">
						Centered on <strong>{{ centerName }}</strong>
					</p>
					<p v-else>Enter an ingredient to build a graph.</p>
				</div>

				<svg
					ref="svgRef"
					class="graph"
					viewBox="0 0 980 640"
					@pointermove="onPointerMove"
					@pointerup="stopDragging"
					@pointerleave="stopDragging"
				>
					<g>
						<line
							v-for="(link, index) in renderedLinks"
							:key="`${link.source}-${link.target}-${index}`"
							:x1="link.x1"
							:y1="link.y1"
							:x2="link.x2"
							:y2="link.y2"
							:stroke-width="link.stroke"
						/>
						<text
							v-for="(link, index) in renderedLinks"
							:key="`label-${link.source}-${link.target}-${index}`"
							class="edgeLabel"
							:x="(link.x1 + link.x2) / 2"
							:y="(link.y1 + link.y2) / 2"
						>
							{{ link.weight }}
						</text>
					</g>

					<g>
						<g
							v-for="node in renderedNodes"
							:key="node.id"
							class="node"
							:class="{ centerNode: node.isCenter }"
							:transform="`translate(${node.x}, ${node.y})`"
							@pointerdown="startDragging($event, node.id)"
						>
							<circle :r="node.isCenter ? 28 : 20" :fill="node.color" />
							<text class="nodeLabel" :y="node.isCenter ? 44 : 36">
								{{ node.label }}
							</text>
						</g>
					</g>
				</svg>
			</section>
		</section>
	</main>
</template>

<script setup lang="ts">
type IngredientSuggestion = {
	name: string;
	type: string;
};

type GraphApiNode = {
	id: string;
	label: string;
	type: string;
	isCenter: boolean;
	count: number;
};

type GraphApiLink = {
	source: string;
	target: string;
	weight: number;
};

type RenderNode = GraphApiNode & {
	x: number;
	y: number;
	vx: number;
	vy: number;
	fx: number | null;
	fy: number | null;
	color: string;
};

const WIDTH = 980;
const HEIGHT = 640;

const query = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);

const suggestions = ref<IngredientSuggestion[]>([]);
const activeSuggestionIndex = ref(0);
const suggestionLoading = ref(false);
const graphLoading = ref(false);

const centerName = ref('');
const hintText = ref('');
const errorText = ref('');

const renderedNodes = ref<RenderNode[]>([]);
const renderedLinks = ref<
	Array<
		GraphApiLink & {
			x1: number;
			y1: number;
			x2: number;
			y2: number;
			stroke: number;
		}
	>
>([]);

const nodeById = computed(() => {
	const map = new Map<string, RenderNode>();
	for (const node of renderedNodes.value) {
		map.set(node.id, node);
	}
	return map;
});

const showSuggestions = computed(
	() =>
		suggestions.value.length > 0 &&
		query.value.trim().length > 0 &&
		document.activeElement === inputRef.value,
);

let simulationFrame = 0;
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const dragState = reactive({
	nodeId: '',
	active: false,
});

const typeColorMap: Record<string, string> = {
	beef: '#8c2f39',
	fish: '#2a6f97',
	poultry: '#bc6c25',
	pork: '#ae2012',
	vegetable: '#2d6a4f',
	fruit: '#d00000',
	cheeses: '#dda15e',
	spice: '#9c6644',
	dairy: '#b08968',
	grain: '#b5838d',
	herb: '#386641',
	oil: '#6b705c',
	sweetener: '#ff6f61',
	condiment: '#5f0f40',
	legume: '#4361ee',
	nut: '#7f5539',
	other: '#6c757d',
};

function pickNodeColor(type: string, isCenter: boolean): string {
	if (isCenter) {
		return '#101820';
	}
	return typeColorMap[type] ?? typeColorMap.other;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function createNodeLayout(nodes: GraphApiNode[]): RenderNode[] {
	const centerX = WIDTH / 2;
	const centerY = HEIGHT / 2;

	const center = nodes.find((node) => node.isCenter);
	const others = nodes.filter((node) => !node.isCenter);

	const laidOut: RenderNode[] = [];

	if (center) {
		laidOut.push({
			...center,
			x: centerX,
			y: centerY,
			vx: 0,
			vy: 0,
			fx: centerX,
			fy: centerY,
			color: pickNodeColor(center.type, true),
		});
	}

	others.forEach((node, index) => {
		const angle = (Math.PI * 2 * index) / Math.max(others.length, 1);
		const radius = 180 + (index % 4) * 26;
		laidOut.push({
			...node,
			x: centerX + Math.cos(angle) * radius,
			y: centerY + Math.sin(angle) * radius,
			vx: 0,
			vy: 0,
			fx: null,
			fy: null,
			color: pickNodeColor(node.type, false),
		});
	});

	return laidOut;
}

function rebuildRenderedLinks(links: GraphApiLink[]): void {
	const map = nodeById.value;
	renderedLinks.value = links
		.map((link) => {
			const source = map.get(link.source);
			const target = map.get(link.target);
			if (!source || !target) {
				return null;
			}

			return {
				...link,
				x1: source.x,
				y1: source.y,
				x2: target.x,
				y2: target.y,
				stroke: clamp(0.8 + Math.log2(link.weight + 1), 1, 6),
			};
		})
		.filter((link): link is NonNullable<typeof link> => Boolean(link));
}

function runSimulation(rawLinks: GraphApiLink[]): void {
	if (simulationFrame) {
		cancelAnimationFrame(simulationFrame);
	}

	const links = rawLinks;
	const tick = () => {
		const nodes = renderedNodes.value;
		const map = nodeById.value;

		for (let i = 0; i < nodes.length; i += 1) {
			for (let j = i + 1; j < nodes.length; j += 1) {
				const a = nodes[i];
				const b = nodes[j];
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const distSq = dx * dx + dy * dy + 0.01;
				const force = 3200 / distSq;
				const dist = Math.sqrt(distSq);
				const nx = dx / dist;
				const ny = dy / dist;

				a.vx -= nx * force;
				a.vy -= ny * force;
				b.vx += nx * force;
				b.vy += ny * force;
			}
		}

		for (const link of links) {
			const source = map.get(link.source);
			const target = map.get(link.target);
			if (!source || !target) {
				continue;
			}

			const dx = target.x - source.x;
			const dy = target.y - source.y;
			const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.001);
			const desired = 90 + Math.max(0, 120 - link.weight * 2);
			const stretch = dist - desired;
			const k = 0.0035;

			const fx = (dx / dist) * stretch * k;
			const fy = (dy / dist) * stretch * k;

			source.vx += fx;
			source.vy += fy;
			target.vx -= fx;
			target.vy -= fy;
		}

		for (const node of nodes) {
			const pullX = (WIDTH / 2 - node.x) * (node.isCenter ? 0.0025 : 0.0009);
			const pullY = (HEIGHT / 2 - node.y) * (node.isCenter ? 0.0025 : 0.0009);
			node.vx += pullX;
			node.vy += pullY;

			node.vx *= 0.9;
			node.vy *= 0.9;

			if (node.fx !== null && node.fy !== null) {
				node.x = node.fx;
				node.y = node.fy;
				node.vx = 0;
				node.vy = 0;
				continue;
			}

			node.x = clamp(node.x + node.vx, 32, WIDTH - 32);
			node.y = clamp(node.y + node.vy, 32, HEIGHT - 32);
		}

		rebuildRenderedLinks(links);
		simulationFrame = requestAnimationFrame(tick);
	};

	tick();
}

async function fetchSuggestions(input: string): Promise<void> {
	if (!input.trim()) {
		suggestions.value = [];
		return;
	}

	suggestionLoading.value = true;
	try {
		const response = await $fetch<{ items: IngredientSuggestion[] }>(
			'/api/ingredients',
			{
				query: { q: input.trim() },
			},
		);
		suggestions.value = response.items;
		activeSuggestionIndex.value = 0;
	} catch {
		suggestions.value = [];
	} finally {
		suggestionLoading.value = false;
	}
}

function selectSuggestion(name: string): void {
	query.value = name;
	suggestions.value = [];
	errorText.value = '';
	hintText.value = `Selected ${name}`;
}

function onInputFocus(): void {
	if (query.value.trim()) {
		void fetchSuggestions(query.value);
	}
}

function onInputKeydown(event: KeyboardEvent): void {
	if (event.key === 'ArrowDown' && suggestions.value.length > 0) {
		event.preventDefault();
		activeSuggestionIndex.value =
			(activeSuggestionIndex.value + 1) % suggestions.value.length;
		return;
	}

	if (event.key === 'ArrowUp' && suggestions.value.length > 0) {
		event.preventDefault();
		activeSuggestionIndex.value =
			(activeSuggestionIndex.value - 1 + suggestions.value.length) %
			suggestions.value.length;
		return;
	}

	if (event.key === 'Enter') {
		event.preventDefault();
		if (
			showSuggestions.value &&
			suggestions.value[activeSuggestionIndex.value]
		) {
			selectSuggestion(suggestions.value[activeSuggestionIndex.value].name);
		}
		void submitIngredient();
	}
}

async function submitIngredient(): Promise<void> {
	const ingredient = query.value.trim();
	if (!ingredient) {
		errorText.value = 'Type an ingredient name first.';
		hintText.value = '';
		return;
	}

	graphLoading.value = true;
	errorText.value = '';
	hintText.value = '';

	try {
		const response = await $fetch<{
			center: { name: string; recipeCount: number };
			nodes: GraphApiNode[];
			links: GraphApiLink[];
		}>('/api/graph', {
			query: { ingredient },
		});

		centerName.value = response.center.name;
		renderedNodes.value = createNodeLayout(response.nodes);
		rebuildRenderedLinks(response.links);
		runSimulation(response.links);

		hintText.value =
			response.links.length > 0
				? `${response.center.name} appears in ${response.center.recipeCount} recipes with ${response.links.length} linked ingredients.`
				: `${response.center.name} was found, but no linked ingredients were available in recipes.`;
		suggestions.value = [];
	} catch (error: unknown) {
		const message =
			typeof error === 'object' && error && 'statusMessage' in error
				? String((error as { statusMessage?: string }).statusMessage)
				: 'Could not build graph for that ingredient.';
		errorText.value = message;
	} finally {
		graphLoading.value = false;
	}
}

function getSvgPoint(event: PointerEvent): { x: number; y: number } {
	const svg = svgRef.value;
	if (!svg) {
		return { x: 0, y: 0 };
	}

	const point = svg.createSVGPoint();
	point.x = event.clientX;
	point.y = event.clientY;
	const matrix = svg.getScreenCTM();
	if (!matrix) {
		return { x: 0, y: 0 };
	}
	const transformed = point.matrixTransform(matrix.inverse());
	return { x: transformed.x, y: transformed.y };
}

function startDragging(event: PointerEvent, nodeId: string): void {
	event.preventDefault();
	const node = renderedNodes.value.find((item) => item.id === nodeId);
	if (!node) {
		return;
	}

	dragState.active = true;
	dragState.nodeId = nodeId;
	const p = getSvgPoint(event);
	node.fx = p.x;
	node.fy = p.y;
}

function onPointerMove(event: PointerEvent): void {
	if (!dragState.active) {
		return;
	}
	const node = renderedNodes.value.find((item) => item.id === dragState.nodeId);
	if (!node) {
		return;
	}

	const p = getSvgPoint(event);
	node.fx = clamp(p.x, 32, WIDTH - 32);
	node.fy = clamp(p.y, 32, HEIGHT - 32);
}

function stopDragging(): void {
	if (!dragState.active) {
		return;
	}

	const node = renderedNodes.value.find((item) => item.id === dragState.nodeId);
	if (node && !node.isCenter) {
		node.fx = null;
		node.fy = null;
	}

	dragState.active = false;
	dragState.nodeId = '';
}

watch(
	query,
	(value) => {
		errorText.value = '';
		hintText.value = '';

		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer);
		}

		searchDebounceTimer = setTimeout(() => {
			void fetchSuggestions(value);
		}, 140);
	},
	{ flush: 'post' },
);

onMounted(() => {
	hintText.value = 'Start by entering an ingredient.';
});

onBeforeUnmount(() => {
	if (searchDebounceTimer) {
		clearTimeout(searchDebounceTimer);
	}
	if (simulationFrame) {
		cancelAnimationFrame(simulationFrame);
	}
});
</script>

<style scoped>
.page {
	min-height: 100vh;
	padding: 2rem 1rem 3rem;
	background:
		radial-gradient(circle at 18% 12%, #ffe8d6 0%, transparent 38%),
		radial-gradient(circle at 88% 84%, #ccd5ae 0%, transparent 34%),
		linear-gradient(145deg, #f8f4e8 0%, #f0ead6 58%, #e9ddc2 100%);
	color: #1d1d1d;
	font-family: 'Trebuchet MS', 'Gill Sans', 'Century Gothic', sans-serif;
}

.shell {
	max-width: 1100px;
	margin: 0 auto;
	display: grid;
	gap: 1.1rem;
}

.hero {
	background: rgba(255, 255, 255, 0.72);
	border: 1px solid rgba(30, 30, 30, 0.14);
	border-radius: 20px;
	padding: 1.2rem 1.3rem;
	box-shadow: 0 14px 36px rgba(40, 34, 24, 0.11);
}

.eyebrow {
	margin: 0 0 0.4rem;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	font-size: 0.73rem;
	color: #6b705c;
	font-weight: 700;
}

h1 {
	margin: 0;
	font-family: 'Palatino Linotype', Palatino, 'Book Antiqua', serif;
	font-size: clamp(2rem, 5vw, 3.3rem);
	line-height: 1.03;
	color: #283618;
}

.subtitle {
	margin: 0.75rem 0 0;
	font-size: 1.03rem;
	max-width: 70ch;
	color: #3c3c3c;
}

.searchPanel {
	position: relative;
	background: rgba(255, 255, 255, 0.78);
	border-radius: 16px;
	padding: 1rem;
	border: 1px solid rgba(30, 30, 30, 0.12);
	box-shadow: 0 12px 28px rgba(41, 35, 26, 0.09);
}

.searchForm label {
	display: block;
	font-size: 0.86rem;
	font-weight: 700;
	margin-bottom: 0.4rem;
	color: #344e41;
}

.inputRow {
	display: grid;
	grid-template-columns: 1fr auto;
	gap: 0.55rem;
}

input {
	width: 100%;
	padding: 0.8rem 0.95rem;
	border-radius: 11px;
	border: 1px solid #adb5bd;
	font-size: 1rem;
	background: #fff;
	color: #212529;
}

input:focus {
	outline: none;
	border-color: #588157;
	box-shadow: 0 0 0 3px rgba(88, 129, 87, 0.2);
}

button {
	border: none;
	border-radius: 11px;
	padding: 0 1.1rem;
	font-size: 1rem;
	font-weight: 700;
	color: #f7f7f7;
	background: linear-gradient(140deg, #606c38 0%, #283618 100%);
	cursor: pointer;
	transition: transform 0.14s ease;
}

button:hover {
	transform: translateY(-1px);
}

button:disabled {
	cursor: wait;
	opacity: 0.72;
	transform: none;
}

.suggestions {
	list-style: none;
	margin: 0.5rem 0 0;
	padding: 0.4rem;
	border: 1px solid rgba(56, 102, 65, 0.24);
	border-radius: 10px;
	background: #fffdf8;
	max-height: 16rem;
	overflow-y: auto;
}

.suggestion {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 0.45rem 0.55rem;
	border-radius: 8px;
	cursor: pointer;
	text-transform: capitalize;
}

.suggestion small {
	text-transform: lowercase;
	opacity: 0.72;
}

.suggestion.active,
.suggestion:hover {
	background: #e9edc9;
}

.hint,
.error {
	margin: 0.65rem 0 0;
	font-size: 0.92rem;
}

.hint {
	color: #283618;
}

.error {
	color: #9d0208;
	font-weight: 600;
}

.graphPanel {
	background: rgba(255, 255, 255, 0.74);
	border-radius: 18px;
	padding: 0.8rem;
	border: 1px solid rgba(30, 30, 30, 0.12);
	box-shadow: 0 14px 30px rgba(33, 28, 21, 0.12);
}

.legend {
	padding: 0.3rem 0.5rem 0.7rem;
	color: #2f3e46;
}

.legend p {
	margin: 0;
	font-size: 0.94rem;
}

.graph {
	width: 100%;
	height: min(72vh, 640px);
	border-radius: 12px;
	background:
		radial-gradient(circle at 20% 20%, #fefae0 0%, transparent 33%),
		radial-gradient(circle at 80% 82%, #e9edc9 0%, transparent 32%),
		linear-gradient(180deg, #fffef9 0%, #f6f0dc 100%);
	border: 1px solid rgba(53, 79, 82, 0.18);
}

line {
	stroke: rgba(73, 80, 87, 0.65);
}

.node {
	cursor: grab;
	transition: opacity 0.16s ease;
	user-select: none;
}

.node:active {
	cursor: grabbing;
}

.nodeLabel {
	text-anchor: middle;
	font-size: 12px;
	font-weight: 700;
	font-family: 'Trebuchet MS', 'Gill Sans', 'Century Gothic', sans-serif;
	fill: #1f1f1f;
	pointer-events: none;
	text-transform: lowercase;
}

.centerNode .nodeLabel {
	font-size: 13px;
	fill: #101820;
	text-transform: none;
}

.edgeLabel {
	fill: #343a40;
	font-size: 11px;
	font-weight: 700;
	text-anchor: middle;
	paint-order: stroke;
	stroke: #fefefe;
	stroke-width: 3;
	stroke-linecap: butt;
	stroke-linejoin: miter;
	pointer-events: none;
}

@media (max-width: 760px) {
	.page {
		padding: 1.1rem 0.65rem 2.2rem;
	}

	.shell {
		gap: 0.85rem;
	}

	.searchPanel {
		padding: 0.8rem;
	}

	.inputRow {
		grid-template-columns: 1fr;
	}

	button {
		padding: 0.7rem;
	}

	.graph {
		height: min(66vh, 540px);
	}
}
</style>
