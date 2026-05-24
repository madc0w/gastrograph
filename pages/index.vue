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

			<section class="tabs" role="tablist" aria-label="Gastrograph views">
				<button
					type="button"
					class="tabButton"
					:class="{ active: activeTab === 'search' }"
					role="tab"
					:aria-selected="activeTab === 'search'"
					@click="activeTab = 'search'"
				>
					Search
				</button>
				<button
					type="button"
					class="tabButton"
					:class="{ active: activeTab === 'path' }"
					role="tab"
					:aria-selected="activeTab === 'path'"
					@click="activeTab = 'path'"
				>
					Path
				</button>
			</section>

			<template v-if="activeTab === 'search'">
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
							<button type="submit" :disabled="isGraphLoading">OK</button>
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

					<div
						v-if="hoverCard.visible"
						ref="hoverCardRef"
						class="hoverCard"
						:style="{
							left: `${hoverCard.left}px`,
							top: `${hoverCard.top}px`,
						}"
						@pointerenter="onHoverCardPointerEnter"
						@pointerleave="onHoverCardPointerLeave"
					>
						<p class="hoverTitle">{{ hoverCard.label }}</p>
						<p v-if="hoverCard.loading" class="hoverMeta">Loading recipes...</p>
						<p v-else class="hoverMeta">
							{{ hoverCard.titles.length }} recipes use this ingredient
						</p>
						<ul v-if="!hoverCard.loading && hoverCard.titles.length > 0">
							<li
								v-for="recipe in hoverCard.titles"
								:key="recipe.title"
								:class="{ pairedRecipe: recipe.containsCurrentIngredient }"
							>
								<span>{{ recipe.title }}</span>
								<small v-if="recipe.containsCurrentIngredient">Both</small>
							</li>
						</ul>
						<p
							v-if="!hoverCard.loading && hoverCard.titles.length === 0"
							class="hoverMeta"
						>
							No recipes found.
						</p>
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
								:class="{
									centerNode: node.isCenter,
									hoveredNode:
										hoverCard.visible && hoverCard.nodeId === node.id,
								}"
								:transform="`translate(${node.x}, ${node.y})`"
								@pointerdown="startDragging($event, node.id)"
								@pointerup="onNodePointerUp(node.id)"
								@pointerenter="onNodePointerEnter(node.id)"
								@pointerleave="onNodePointerLeave"
							>
								<circle :r="node.isCenter ? 28 : 20" :fill="node.color" />
								<text class="nodeLabel" :y="node.isCenter ? 44 : 36">
									{{ node.label }}
								</text>
							</g>
						</g>
					</svg>
				</section>
			</template>

			<template v-else>
				<section class="searchPanel">
					<form class="searchForm" @submit.prevent="submitPathSearch">
						<div class="pathGrid">
							<div>
								<label for="path-from-input">From ingredient</label>
								<input
									id="path-from-input"
									v-model="pathFromQuery"
									type="text"
									autocomplete="off"
									list="path-from-options"
									placeholder="Try butter"
									@focus="void fetchPathSuggestions('from', pathFromQuery)"
									@input="void fetchPathSuggestions('from', pathFromQuery)"
								/>
								<datalist id="path-from-options">
									<option
										v-for="item in pathFromSuggestions"
										:key="`from-${item.name}`"
										:value="item.name"
									/>
								</datalist>
							</div>

							<div>
								<label for="path-to-input">To ingredient</label>
								<input
									id="path-to-input"
									v-model="pathToQuery"
									type="text"
									autocomplete="off"
									list="path-to-options"
									placeholder="Try parsley"
									@focus="void fetchPathSuggestions('to', pathToQuery)"
									@input="void fetchPathSuggestions('to', pathToQuery)"
								/>
								<datalist id="path-to-options">
									<option
										v-for="item in pathToSuggestions"
										:key="`to-${item.name}`"
										:value="item.name"
									/>
								</datalist>
							</div>
						</div>

						<div class="pathActions">
							<button type="submit" :disabled="isPathLoading">OK</button>
						</div>
					</form>

					<p v-if="pathHintText" class="hint">{{ pathHintText }}</p>
					<p v-if="pathErrorText" class="error">{{ pathErrorText }}</p>
				</section>

				<section class="graphPanel pathPanel">
					<div class="legend">
						<p>
							Showing recipe chains from
							<strong>{{ pathFromQuery || '...' }}</strong>
							to
							<strong>{{ pathToQuery || '...' }}</strong>
						</p>
					</div>

					<ol v-if="pathResults.length > 0" class="pathResults">
						<li
							v-for="(path, index) in pathResults"
							:key="`${path.recipeChain.join('-')}-${index}`"
						>
							<p class="pathHeading">Path {{ index + 1 }}</p>
							<p class="pathIngredients">
								{{ path.ingredientChain.join(' -> ') }}
							</p>
							<ul>
								<li
									v-for="(recipe, recipeIndex) in path.recipeChain"
									:key="`${recipe}-${recipeIndex}`"
								>
									{{ recipe }}
								</li>
							</ul>
						</li>
					</ol>
					<p v-else class="pathEmpty">
						Choose two ingredients, then click OK to find recipe-name chains.
					</p>
				</section>
			</template>
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

type IngredientRecipesResponse = {
	ingredientId: string;
	titles: RecipeListItem[];
};

type RecipeListItem = {
	title: string;
	containsCurrentIngredient: boolean;
};

type IngredientPath = {
	ingredientChain: string[];
	recipeChain: string[];
	hops: number;
};

type IngredientPathResponse = {
	from: {
		id: string;
		name: string;
	};
	to: {
		id: string;
		name: string;
	};
	paths: IngredientPath[];
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

const activeTab = ref<'search' | 'path'>('search');

const query = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const hoverCardRef = ref<HTMLDivElement | null>(null);

const suggestions = ref<IngredientSuggestion[]>([]);
const activeSuggestionIndex = ref(0);
const isSuggestionLoading = ref(false);
const isGraphLoading = ref(false);

const centerName = ref('');
const centerId = ref('');
const hintText = ref('');
const errorText = ref('');

const pathFromQuery = ref('');
const pathToQuery = ref('');
const pathFromSuggestions = ref<IngredientSuggestion[]>([]);
const pathToSuggestions = ref<IngredientSuggestion[]>([]);
const pathResults = ref<IngredientPath[]>([]);
const pathHintText = ref('');
const pathErrorText = ref('');
const isPathLoading = ref(false);

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
let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
const dragState = reactive({
	nodeId: '',
	active: false,
	moved: false,
	startX: 0,
	startY: 0,
});

const hoverCard = reactive({
	visible: false,
	nodeId: '',
	label: '',
	titles: [] as RecipeListItem[],
	loading: false,
	left: 0,
	top: 0,
});

const hoverState = reactive({
	overNode: false,
	overCard: false,
});

const recipeTitlesByNodeId = reactive<Record<string, RecipeListItem[]>>({});

function getRecipeCacheKey(nodeId: string): string {
	return `${centerId.value}:${nodeId}`;
}

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

	isSuggestionLoading.value = true;
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
		isSuggestionLoading.value = false;
	}
}

async function fetchPathSuggestions(
	field: 'from' | 'to',
	input: string,
): Promise<void> {
	if (!input.trim()) {
		if (field === 'from') {
			pathFromSuggestions.value = [];
		} else {
			pathToSuggestions.value = [];
		}
		return;
	}

	try {
		const response = await $fetch<{ items: IngredientSuggestion[] }>(
			'/api/ingredients',
			{
				query: { q: input.trim() },
			},
		);

		if (field === 'from') {
			pathFromSuggestions.value = response.items;
		} else {
			pathToSuggestions.value = response.items;
		}
	} catch {
		if (field === 'from') {
			pathFromSuggestions.value = [];
		} else {
			pathToSuggestions.value = [];
		}
	}
}

function selectSuggestion(name: string): void {
	query.value = name;
	suggestions.value = [];
	errorText.value = '';
	hintText.value = `Selected ${name}`;
	inputRef.value?.blur();
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

	isGraphLoading.value = true;
	errorText.value = '';
	hintText.value = '';

	try {
		const response = await $fetch<{
			center: { id: string; name: string; recipeCount: number };
			nodes: GraphApiNode[];
			links: GraphApiLink[];
		}>('/api/graph', {
			query: { ingredient },
		});

		centerId.value = response.center.id;
		centerName.value = response.center.name;
		query.value = response.center.name;
		renderedNodes.value = createNodeLayout(response.nodes);
		rebuildRenderedLinks(response.links);
		runSimulation(response.links);
		hideHoverCard();

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
		isGraphLoading.value = false;
	}
}

async function submitPathSearch(): Promise<void> {
	const from = pathFromQuery.value.trim();
	const to = pathToQuery.value.trim();

	if (!from || !to) {
		pathErrorText.value = 'Select both ingredients first.';
		pathHintText.value = '';
		pathResults.value = [];
		return;
	}

	isPathLoading.value = true;
	pathErrorText.value = '';
	pathHintText.value = '';

	try {
		const response = await $fetch<IngredientPathResponse>(
			'/api/ingredient-paths',
			{
				query: {
					from,
					to,
					limit: 8,
				},
			},
		);

		pathFromQuery.value = response.from.name;
		pathToQuery.value = response.to.name;
		pathResults.value = response.paths.slice(0, 8);

		if (response.paths.length > 0) {
			pathHintText.value = `Found ${response.paths.length} shortest recipe chains.`;
		} else {
			pathHintText.value =
				'No connecting chain was found within the search depth.';
		}
	} catch (error: unknown) {
		const message =
			typeof error === 'object' && error && 'statusMessage' in error
				? String((error as { statusMessage?: string }).statusMessage)
				: 'Could not find paths for those ingredients.';
		pathErrorText.value = message;
		pathResults.value = [];
	} finally {
		isPathLoading.value = false;
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
	dragState.moved = false;
	const p = getSvgPoint(event);
	dragState.startX = p.x;
	dragState.startY = p.y;
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
	const movedDistance = Math.hypot(
		p.x - dragState.startX,
		p.y - dragState.startY,
	);
	if (movedDistance > 4) {
		dragState.moved = true;
	}
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

function cancelHoverClose(): void {
	if (hoverCloseTimer) {
		clearTimeout(hoverCloseTimer);
		hoverCloseTimer = null;
	}
}

function hideHoverCard(): void {
	hoverCard.visible = false;
	hoverCard.nodeId = '';
	hoverState.overNode = false;
	hoverState.overCard = false;
}

function scheduleHoverClose(): void {
	cancelHoverClose();
	hoverCloseTimer = setTimeout(() => {
		if (!hoverState.overNode && !hoverState.overCard) {
			hideHoverCard();
		}
	}, 90);
}

function eventTargetInsideHoverCard(target: EventTarget | null): boolean {
	if (!(target instanceof Node)) {
		return false;
	}
	return hoverCardRef.value?.contains(target) ?? false;
}

function updateHoverCardPosition(nodeId: string): void {
	const node = renderedNodes.value.find((item) => item.id === nodeId);
	const svg = svgRef.value;
	if (!node || !svg) {
		return;
	}

	const panelWidth = svg.clientWidth;
	const panelHeight = svg.clientHeight;
	const cardWidth = hoverCardRef.value?.offsetWidth ?? 300;
	const cardHeight = hoverCardRef.value?.offsetHeight ?? 260;
	const panel = svg.parentElement;
	if (!panel) {
		return;
	}
	const svgRect = svg.getBoundingClientRect();
	const panelRect = panel.getBoundingClientRect();
	const svgOffsetLeft = svgRect.left - panelRect.left;
	const svgOffsetTop = svgRect.top - panelRect.top;
	const nodeX = (node.x / WIDTH) * panelWidth;
	const nodeY = (node.y / HEIGHT) * panelHeight;

	const gap = 14;
	const nodeRadius = node.isCenter ? 28 : 20;
	const spaceLeft = nodeX;
	const spaceRight = panelWidth - nodeX;
	const spaceAbove = nodeY;
	const spaceBelow = panelHeight - nodeY;
	const fitsRight = spaceRight >= cardWidth + gap + nodeRadius;
	const fitsLeft = spaceLeft >= cardWidth + gap + nodeRadius;
	const placeRight = fitsRight || (!fitsLeft && spaceRight >= spaceLeft);
	const fitsBelow = spaceBelow >= cardHeight + gap + nodeRadius;
	const fitsAbove = spaceAbove >= cardHeight + gap + nodeRadius;
	const placeBelow = fitsBelow || (!fitsAbove && spaceBelow >= spaceAbove);

	const anchoredLeft = placeRight
		? nodeX + nodeRadius + gap
		: nodeX - cardWidth - nodeRadius - gap;
	const anchoredTop = placeBelow
		? nodeY + nodeRadius + gap
		: nodeY - cardHeight - nodeRadius - gap;

	const left = svgOffsetLeft + anchoredLeft;
	const top = svgOffsetTop + anchoredTop;

	hoverCard.left = left;
	hoverCard.top = top;
}

async function fetchRecipeTitlesForNode(nodeId: string): Promise<void> {
	const cacheKey = getRecipeCacheKey(nodeId);
	if (recipeTitlesByNodeId[cacheKey]) {
		hoverCard.titles = recipeTitlesByNodeId[cacheKey];
		hoverCard.loading = false;
		return;
	}

	hoverCard.loading = true;
	try {
		const response = await $fetch<IngredientRecipesResponse>(
			'/api/ingredient-recipes',
			{
				query: { ingredientId: nodeId, currentIngredientId: centerId.value },
			},
		);
		recipeTitlesByNodeId[cacheKey] = response.titles;
		hoverCard.titles = response.titles;
	} catch {
		recipeTitlesByNodeId[cacheKey] = [];
		hoverCard.titles = [];
	} finally {
		hoverCard.loading = false;
	}
}

async function onNodePointerEnter(nodeId: string): Promise<void> {
	const node = renderedNodes.value.find((item) => item.id === nodeId);
	if (!node) {
		return;
	}

	cancelHoverClose();
	hoverState.overNode = true;
	hoverCard.nodeId = nodeId;
	hoverCard.label = node.label;
	hoverCard.visible = true;
	const cacheKey = getRecipeCacheKey(nodeId);
	hoverCard.titles = recipeTitlesByNodeId[cacheKey] ?? [];
	hoverCard.loading = !recipeTitlesByNodeId[cacheKey];
	updateHoverCardPosition(nodeId);
	await nextTick();
	updateHoverCardPosition(nodeId);
	await fetchRecipeTitlesForNode(nodeId);
}

function onNodePointerLeave(event: PointerEvent): void {
	hoverState.overNode = false;
	if (eventTargetInsideHoverCard(event.relatedTarget)) {
		hoverState.overCard = true;
		cancelHoverClose();
		return;
	}
	scheduleHoverClose();
}

function onHoverCardPointerEnter(): void {
	hoverState.overCard = true;
	cancelHoverClose();
}

function onHoverCardPointerLeave(event: PointerEvent): void {
	hoverState.overCard = false;
	if (eventTargetInsideHoverCard(event.relatedTarget)) {
		return;
	}
	scheduleHoverClose();
}

function onNodePointerUp(nodeId: string): void {
	if (dragState.active && dragState.nodeId === nodeId && !dragState.moved) {
		const node = renderedNodes.value.find((item) => item.id === nodeId);
		if (node) {
			query.value = node.label;
			void submitIngredient();
		}
	}
	stopDragging();
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
			if (document.activeElement !== inputRef.value) {
				suggestions.value = [];
				return;
			}
			void fetchSuggestions(value);
		}, 140);
	},
	{ flush: 'post' },
);

onMounted(() => {
	hintText.value = 'Start by entering an ingredient.';
	pathHintText.value = 'Select two ingredients and click OK.';
});

watchEffect(() => {
	if (!hoverCard.visible || !hoverCard.nodeId) {
		return;
	}
	updateHoverCardPosition(hoverCard.nodeId);
});

onBeforeUnmount(() => {
	if (searchDebounceTimer) {
		clearTimeout(searchDebounceTimer);
	}
	if (hoverCloseTimer) {
		clearTimeout(hoverCloseTimer);
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

.tabs {
	display: flex;
	gap: 0.55rem;
}

.tabButton {
	padding: 0.55rem 0.95rem;
	border-radius: 999px;
	border: 1px solid rgba(40, 54, 24, 0.26);
	background: rgba(255, 255, 255, 0.75);
	color: #283618;
	font-size: 0.9rem;
	font-weight: 700;
	cursor: pointer;
	transition:
		background 0.16s ease,
		transform 0.14s ease,
		box-shadow 0.16s ease;
}

.tabButton.active {
	background: linear-gradient(140deg, #606c38 0%, #283618 100%);
	color: #f8fafc;
	box-shadow: 0 8px 18px rgba(40, 54, 24, 0.24);
}

.tabButton:hover {
	transform: translateY(-1px);
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

.pathGrid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.7rem;
}

.pathActions {
	margin-top: 0.7rem;
	display: flex;
	justify-content: flex-end;
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
	position: relative;
	background: rgba(255, 255, 255, 0.74);
	border-radius: 18px;
	padding: 0.8rem;
	border: 1px solid rgba(30, 30, 30, 0.12);
	box-shadow: 0 14px 30px rgba(33, 28, 21, 0.12);
}

.pathPanel {
	padding: 1rem;
}

.pathResults {
	margin: 0;
	padding: 0 0 0 1.1rem;
	display: grid;
	gap: 0.75rem;
}

.pathResults > li {
	background: rgba(255, 255, 255, 0.82);
	border: 1px solid rgba(40, 54, 24, 0.15);
	border-radius: 12px;
	padding: 0.65rem 0.75rem;
}

.pathHeading {
	margin: 0 0 0.2rem;
	font-weight: 700;
	color: #344e41;
}

.pathIngredients {
	margin: 0 0 0.45rem;
	font-size: 0.88rem;
	color: #495057;
}

.pathResults ul {
	margin: 0;
	padding-left: 1rem;
	display: grid;
	gap: 0.2rem;
}

.pathEmpty {
	margin: 0;
	padding: 0.4rem 0.6rem;
	font-size: 0.92rem;
	color: #495057;
}

.hoverCard {
	position: absolute;
	z-index: 3;
	width: min(300px, calc(100% - 16px));
	max-height: 260px;
	padding: 0.75rem 0.75rem 0.65rem;
	border-radius: 10px;
	border: 1px solid rgba(38, 70, 83, 0.22);
	background: rgba(255, 255, 255, 0.96);
	box-shadow: 0 12px 26px rgba(22, 22, 22, 0.18);
	overflow-y: auto;
	pointer-events: auto;
}

.hoverTitle {
	margin: 0;
	font-weight: 700;
	text-transform: capitalize;
	color: #1d3557;
}

.hoverMeta {
	margin: 0.2rem 0 0.5rem;
	font-size: 0.86rem;
	color: #495057;
}

.hoverCard ul {
	list-style: disc;
	margin: 0;
	padding-left: 1rem;
	font-size: 0.9rem;
	color: #212529;
}

.hoverCard li {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 0.25rem;
	gap: 0.75rem;
	padding: 0.22rem 0.42rem;
	border-radius: 8px;
}

.hoverCard li small {
	flex-shrink: 0;
	font-size: 0.7rem;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: #6b705c;
}

.hoverCard li.pairedRecipe {
	background: linear-gradient(
		135deg,
		rgba(233, 237, 201, 0.95),
		rgba(255, 244, 199, 0.95)
	);
	box-shadow: inset 0 0 0 1px rgba(96, 108, 56, 0.2);
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

.node circle {
	stroke: rgba(255, 255, 255, 0.18);
	stroke-width: 1.5;
	transition:
		stroke-width 0.16s ease,
		stroke 0.16s ease,
		filter 0.16s ease;
}

.node.hoveredNode circle,
.node:hover circle {
	stroke: #fff4c7;
	stroke-width: 4;
	filter: drop-shadow(0 0 10px rgba(255, 244, 199, 0.8));
}

.node.hoveredNode .nodeLabel,
.node:hover .nodeLabel {
	fill: #0f172a;
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

	.pathGrid {
		grid-template-columns: 1fr;
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
