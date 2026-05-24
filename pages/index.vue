<template>
	<main class="page">
		<section class="shell">
			<header class="hero">
				<p class="eyebrow">Flavor Network Explorer</p>
				<h1>GastroGraph</h1>
				<!-- 				
				<p class="subtitle">
					Pick an ingredient to map which other ingredients most often appear
					with it across recipes.
				</p> -->
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
						<div class="inputRow">
							<IngredientAutocomplete
								class="searchIngredientField"
								input-id="ingredient-input"
								label="Ingredient"
								v-model="query"
								placeholder="Try garlic, butter, tomato..."
								:disabled="isGraphLoading"
								:blur-on-select="true"
								@select="onSearchIngredientSelected"
								@submit="submitIngredient"
							/>
							<button
								type="submit"
								class="primaryButton"
								:disabled="isGraphLoading"
							>
								OK
							</button>
						</div>
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
						v-if="hoverCard.isVisible"
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
						<p v-if="hoverCard.isLoading" class="hoverMeta">
							Loading recipes...
						</p>
						<p v-else class="hoverMeta">
							{{ hoverCard.titles.length }} recipes use this ingredient
						</p>
						<ul v-if="!hoverCard.isLoading && hoverCard.titles.length > 0">
							<li
								v-for="recipe in hoverCard.titles"
								:key="recipe.title"
								:class="{ pairedRecipe: recipe.containsCurrentIngredient }"
							>
								<button
									type="button"
									class="recipeButton"
									@click="openRecipeModal(recipe)"
								>
									{{ recipe.title }}
								</button>
								<small v-if="recipe.containsCurrentIngredient">Both</small>
							</li>
						</ul>
						<p
							v-if="!hoverCard.isLoading && hoverCard.titles.length === 0"
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
										hoverCard.isVisible && hoverCard.nodeId === node.id,
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
							<IngredientAutocomplete
								input-id="path-from-input"
								label="From ingredient"
								v-model="pathFromQuery"
								placeholder="Try butter"
								:tab-index="1"
								input-width="200px"
								:disabled="isPathLoading"
								:show-type="false"
								@select="onPathIngredientSelected('from')"
								@submit="submitPathSearch"
							/>

							<IngredientAutocomplete
								input-id="path-to-input"
								label="To ingredient"
								v-model="pathToQuery"
								placeholder="Try parsley"
								:tab-index="2"
								input-width="200px"
								:disabled="isPathLoading"
								:show-type="false"
								@select="onPathIngredientSelected('to')"
								@submit="submitPathSearch"
							/>

							<div class="pathActions">
								<button
									type="submit"
									tabindex="3"
									class="primaryButton"
									:disabled="isPathLoading"
								>
									<span v-if="!isPathLoading">OK</span>
									<span v-else class="pathSpinner" aria-hidden="true"></span>
								</button>
							</div>
						</div>
					</form>

					<p v-if="pathHintText" class="hint">{{ pathHintText }}</p>
					<p v-if="pathErrorText" class="error">{{ pathErrorText }}</p>
				</section>

				<section class="graphPanel pathPanel">
					<div v-if="!pathErrorText" class="legend">
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
							:key="`${path.recipeChain.map((recipe) => recipe.title).join('-')}-${index}`"
						>
							<ol class="pathSteps">
								<li
									v-for="(recipe, recipeIndex) in path.recipeChain"
									:key="`${recipe.title}-${recipeIndex}`"
								>
									<strong>
										<button
											type="button"
											class="recipeButton"
											@click="openRecipeModal(recipe)"
										>
											{{ recipe.title }}
										</button>
									</strong>
									uses
									{{ path.ingredientChain[recipeIndex] }} and
									{{ path.ingredientChain[recipeIndex + 1] }}
								</li>
							</ol>
						</li>
					</ol>
					<p v-else class="pathEmpty">
						Choose two ingredients, then click OK to find recipe-name chains.
					</p>
				</section>
			</template>

			<Teleport to="body">
				<div
					v-if="recipeModal.isVisible"
					class="recipeModalOverlay"
					@click.self="closeRecipeModal"
				>
					<section
						class="recipeModal"
						role="dialog"
						aria-modal="true"
						:aria-labelledby="recipeModalTitleId"
					>
						<header class="recipeModalHeader">
							<div>
								<p class="recipeModalEyebrow">Recipe details</p>
								<h2 :id="recipeModalTitleId">{{ recipeModal.title }}</h2>
							</div>
							<button
								type="button"
								class="recipeModalClose"
								@click="closeRecipeModal"
							>
								Close
							</button>
						</header>

						<p v-if="recipeModal.isLoading" class="recipeModalState">
							Loading recipe...
						</p>
						<p
							v-else-if="recipeModal.error"
							class="recipeModalState recipeModalError"
						>
							{{ recipeModal.error }}
						</p>
						<template v-else-if="recipeModal.recipe">
							<ul class="recipeIngredients">
								<li
									v-for="(ingredient, index) in recipeModal.recipe.ingredients"
									:key="`${ingredient.ingredient}-${index}`"
								>
									{{ ingredient.ingredient }}
								</li>
							</ul>

							<ol class="recipeDirections">
								<li
									v-for="(direction, index) in recipeModal.recipe.directions"
									:key="`${index}-${direction}`"
								>
									{{ direction }}
								</li>
							</ol>
						</template>
					</section>
				</div>
			</Teleport>
		</section>
	</main>
</template>

<script setup lang="ts">
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

type RecipeDetails = {
	title: string;
	ingredients: Array<{
		ingredient: string;
	}>;
	directions: string[];
};

type RecipeListItem = {
	title: string;
	containsCurrentIngredient: boolean;
};

function dedupeRecipeTitles(titles: RecipeListItem[]): RecipeListItem[] {
	const byTitle = new Map<string, RecipeListItem>();

	for (const recipe of titles) {
		const key = recipe.title.trim().toLowerCase();
		const existing = byTitle.get(key);
		if (!existing) {
			byTitle.set(key, { ...recipe });
			continue;
		}

		if (recipe.containsCurrentIngredient) {
			existing.containsCurrentIngredient = true;
		}
	}

	return Array.from(byTitle.values());
}

type IngredientPath = {
	ingredientChain: string[];
	recipeChain: RecipePathItem[];
	hops: number;
};

type RecipePathItem = {
	title: string;
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

type PathSearchStartResponse = {
	jobId: string;
	status: 'pending';
};

type PathSearchStatusResponse =
	| {
			status: 'pending';
	  }
	| {
			status: 'done';
			result: IngredientPathResponse;
	  }
	| {
			status: 'error';
			error: string;
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
const svgRef = ref<SVGSVGElement | null>(null);
const hoverCardRef = ref<HTMLDivElement | null>(null);

const isGraphLoading = ref(false);

const centerName = ref('');
const centerId = ref('');
const hintText = ref('');
const errorText = ref('');

const pathFromQuery = ref('');
const pathToQuery = ref('');
const pathResults = ref<IngredientPath[]>([]);
const pathHintText = ref('');
const pathErrorText = ref('');
const isPathLoading = ref(false);

const recipeModal = reactive<{
	isVisible: boolean;
	title: string;
	isLoading: boolean;
	error: string;
	recipe: RecipeDetails | null;
}>({
	isVisible: false,
	title: '',
	isLoading: false,
	error: '',
	recipe: null,
});

const recipeModalTitleId = 'recipe-modal-title';

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

let simulationFrame = 0;
let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
let pathSearchRequestId = 0;
const dragState = reactive({
	nodeId: '',
	isActive: false,
	isMoved: false,
	startX: 0,
	startY: 0,
});

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

const hoverCard = reactive({
	isVisible: false,
	nodeId: '',
	label: '',
	titles: [] as RecipeListItem[],
	isLoading: false,
	left: 0,
	top: 0,
});

const hoverState = reactive({
	isOverNode: false,
	isOverCard: false,
});

const recipeTitlesByNodeId = reactive<Record<string, RecipeListItem[]>>({});

function getRecipeCacheKey(nodeId: string): string {
	return `${centerId.value}:${nodeId}`;
}

const typeColorMap: Record<string, string> = {
	beef: '#8c2f39',
	fish: '#2a6f97',
	seafood: '#2a6f97',
	poultry: '#bc6c25',
	chicken: '#bc6c25',
	pork: '#ae2012',
	meat: '#ae2012',
	vegetable: '#2d6a4f',
	veggie: '#2d6a4f',
	fruit: '#d00000',
	cheeses: '#dda15e',
	cheese: '#dda15e',
	spice: '#9c6644',
	seasoning: '#9c6644',
	dairy: '#b08968',
	grain: '#b5838d',
	grains: '#b5838d',
	herb: '#386641',
	herbs: '#386641',
	oil: '#6b705c',
	sweetener: '#ff6f61',
	sugar: '#ff6f61',
	condiment: '#5f0f40',
	legume: '#4361ee',
	bean: '#4361ee',
	nut: '#7f5539',
	other: '#6c757d',
};

const typeAliasMap: Record<string, string> = {
	veggies: 'vegetable',
	vegetables: 'vegetable',
	fruits: 'fruit',
	spices: 'spice',
	seasonings: 'spice',
	cheeses: 'cheeses',
	grains: 'grain',
	herbs: 'herb',
	legumes: 'legume',
	nuts: 'nut',
};

function normalizeIngredientType(type: string): string {
	const normalized = type.trim().toLowerCase();
	if (!normalized) {
		return 'other';
	}

	return typeAliasMap[normalized] ?? normalized;
}

function pickNodeColor(type: string, _isCenter: boolean): string {
	const normalizedType = normalizeIngredientType(type);
	return typeColorMap[normalizedType] ?? typeColorMap.other;
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

function onSearchIngredientSelected(name: string): void {
	errorText.value = '';
	hintText.value = `Selected ${name}`;
}

function onPathIngredientSelected(_field: 'from' | 'to'): void {
	pathErrorText.value = '';
}

function openRecipeModal(recipe: RecipeListItem | RecipePathItem): void {
	recipeModal.isVisible = true;
	recipeModal.title = recipe.title;
	recipeModal.isLoading = true;
	recipeModal.error = '';
	recipeModal.recipe = null;
	void loadRecipeDetails(recipe);
}

function closeRecipeModal(): void {
	recipeModal.isVisible = false;
	recipeModal.title = '';
	recipeModal.isLoading = false;
	recipeModal.error = '';
	recipeModal.recipe = null;
}

function onGlobalKeyDown(event: KeyboardEvent): void {
	if (event.key !== 'Escape' || !recipeModal.isVisible) {
		return;
	}

	event.preventDefault();
	closeRecipeModal();
}

async function loadRecipeDetails(
	recipe: RecipeListItem | RecipePathItem,
): Promise<void> {
	try {
		const response = await $fetch<RecipeDetails>('/api/recipe-details', {
			query: {
				title: recipe.title,
			},
		});
		recipeModal.recipe = response;
		recipeModal.title = response.title || recipe.title;
	} catch (error: unknown) {
		recipeModal.error =
			typeof error === 'object' && error && 'statusMessage' in error
				? String((error as { statusMessage?: string }).statusMessage)
				: 'Could not load recipe details.';
	} finally {
		recipeModal.isLoading = false;
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
	pathSearchRequestId += 1;
	const requestId = pathSearchRequestId;
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
	pathHintText.value = 'Searching recipe chains...';

	try {
		const startResponse = await $fetch<PathSearchStartResponse>(
			'/api/ingredient-paths/start',
			{
				method: 'POST',
				body: {
					from,
					to,
					limit: 8,
				},
			},
		);

		const maxPolls = 90;
		const pollIntervalMs = 350;
		let response: IngredientPathResponse | null = null;

		for (let poll = 0; poll < maxPolls; poll += 1) {
			if (requestId !== pathSearchRequestId) {
				return;
			}

			const status = await $fetch<PathSearchStatusResponse>(
				'/api/ingredient-paths/status',
				{
					query: {
						jobId: startResponse.jobId,
					},
				},
			);

			if (status.status === 'done') {
				response = status.result;
				break;
			}

			if (status.status === 'error') {
				throw createError({
					statusCode: 500,
					statusMessage: status.error,
				});
			}

			await wait(pollIntervalMs);
		}

		if (!response) {
			throw createError({
				statusCode: 408,
				statusMessage: 'Path search is taking too long. Try a different pair.',
			});
		}

		if (requestId !== pathSearchRequestId) {
			return;
		}

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
		if (requestId !== pathSearchRequestId) {
			return;
		}

		const message =
			typeof error === 'object' && error && 'statusMessage' in error
				? String((error as { statusMessage?: string }).statusMessage)
				: 'Could not find paths for those ingredients.';
		pathErrorText.value = message;
		pathResults.value = [];
	} finally {
		if (requestId === pathSearchRequestId) {
			isPathLoading.value = false;
		}
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

	dragState.isActive = true;
	dragState.nodeId = nodeId;
	dragState.isMoved = false;
	const p = getSvgPoint(event);
	dragState.startX = p.x;
	dragState.startY = p.y;
	node.fx = p.x;
	node.fy = p.y;
}

function onPointerMove(event: PointerEvent): void {
	if (!dragState.isActive) {
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
		dragState.isMoved = true;
	}
	node.fx = clamp(p.x, 32, WIDTH - 32);
	node.fy = clamp(p.y, 32, HEIGHT - 32);
}

function stopDragging(): void {
	if (!dragState.isActive) {
		return;
	}

	const node = renderedNodes.value.find((item) => item.id === dragState.nodeId);
	if (node && !node.isCenter) {
		node.fx = null;
		node.fy = null;
	}

	dragState.isActive = false;
	dragState.nodeId = '';
}

function cancelHoverClose(): void {
	if (hoverCloseTimer) {
		clearTimeout(hoverCloseTimer);
		hoverCloseTimer = null;
	}
}

function hideHoverCard(): void {
	hoverCard.isVisible = false;
	hoverCard.nodeId = '';
	hoverState.isOverNode = false;
	hoverState.isOverCard = false;
}

function scheduleHoverClose(): void {
	cancelHoverClose();
	hoverCloseTimer = setTimeout(() => {
		if (!hoverState.isOverNode && !hoverState.isOverCard) {
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
		hoverCard.isLoading = false;
		return;
	}

	hoverCard.isLoading = true;
	try {
		const response = await $fetch<IngredientRecipesResponse>(
			'/api/ingredient-recipes',
			{
				query: { ingredientId: nodeId, currentIngredientId: centerId.value },
			},
		);
		const dedupedTitles = dedupeRecipeTitles(response.titles);
		recipeTitlesByNodeId[cacheKey] = dedupedTitles;
		hoverCard.titles = dedupedTitles;
	} catch {
		recipeTitlesByNodeId[cacheKey] = [];
		hoverCard.titles = [];
	} finally {
		hoverCard.isLoading = false;
	}
}

async function onNodePointerEnter(nodeId: string): Promise<void> {
	const node = renderedNodes.value.find((item) => item.id === nodeId);
	if (!node) {
		return;
	}

	cancelHoverClose();
	hoverState.isOverNode = true;
	hoverCard.nodeId = nodeId;
	hoverCard.label = node.label;
	hoverCard.isVisible = true;
	const cacheKey = getRecipeCacheKey(nodeId);
	hoverCard.titles = recipeTitlesByNodeId[cacheKey] ?? [];
	hoverCard.isLoading = !recipeTitlesByNodeId[cacheKey];
	updateHoverCardPosition(nodeId);
	await nextTick();
	updateHoverCardPosition(nodeId);
	await fetchRecipeTitlesForNode(nodeId);
}

function onNodePointerLeave(event: PointerEvent): void {
	hoverState.isOverNode = false;
	if (eventTargetInsideHoverCard(event.relatedTarget)) {
		hoverState.isOverCard = true;
		cancelHoverClose();
		return;
	}
	scheduleHoverClose();
}

function onHoverCardPointerEnter(): void {
	hoverState.isOverCard = true;
	cancelHoverClose();
}

function onHoverCardPointerLeave(event: PointerEvent): void {
	hoverState.isOverCard = false;
	if (eventTargetInsideHoverCard(event.relatedTarget)) {
		return;
	}
	scheduleHoverClose();
}

function onNodePointerUp(nodeId: string): void {
	if (dragState.isActive && dragState.nodeId === nodeId && !dragState.isMoved) {
		const node = renderedNodes.value.find((item) => item.id === nodeId);
		if (node) {
			query.value = node.label;
			void submitIngredient();
		}
	}
	stopDragging();
}

watch(query, () => {
	errorText.value = '';
	hintText.value = '';
});

watch(activeTab, () => {
	closeRecipeModal();
});

watch(
	() => recipeModal.isVisible,
	(visible) => {
		if (visible) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
	},
);

onMounted(() => {
	window.addEventListener('keydown', onGlobalKeyDown);
	hintText.value = 'Start by entering an ingredient.';
	pathHintText.value = 'Select two ingredients and click OK.';
});

watchEffect(() => {
	if (!hoverCard.isVisible || !hoverCard.nodeId) {
		return;
	}
	updateHoverCardPosition(hoverCard.nodeId);
});

onBeforeUnmount(() => {
	window.removeEventListener('keydown', onGlobalKeyDown);
	document.body.style.overflow = '';
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
	gap: 0.35rem;
	align-items: flex-end;
	padding: 0 0.15rem;
	border-bottom: 1px solid rgba(40, 54, 24, 0.28);
}

.tabButton {
	position: relative;
	padding: 0.58rem 1rem;
	border: 1px solid transparent;
	border-bottom: none;
	border-radius: 10px 10px 0 0;
	background: transparent;
	color: #283618;
	font-size: 0.9rem;
	font-weight: 700;
	cursor: pointer;
	transition:
		background 0.16s ease,
		color 0.16s ease,
		box-shadow 0.16s ease;
}

.tabButton.active {
	background: rgba(255, 255, 255, 0.86);
	color: #243213;
	border-color: rgba(40, 54, 24, 0.32);
	box-shadow: 0 -1px 0 rgba(255, 255, 255, 0.86) inset;
}

.tabButton:hover {
	background: rgba(255, 255, 255, 0.45);
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

.pathGrid {
	display: grid;
	grid-template-columns: repeat(2, minmax(120px, max-content)) auto;
	gap: 0.7rem;
	justify-content: start;
	align-items: end;
}

.pathActions {
	margin-top: 0;
	display: flex;
	justify-content: flex-start;
}

.inputRow {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 0.55rem;
	align-items: end;
}

.inputRow > * {
	min-width: 0;
}

.searchIngredientField {
	width: 100%;
	min-width: 0;
}

.inputRow :deep(.ingredientField) {
	min-width: 0;
}

.searchIngredientField :deep(input) {
	width: 100%;
}

.primaryButton {
	border: none;
	border-radius: 11px;
	padding: 0.75rem 1.1rem;
	font-size: 1rem;
	font-weight: 700;
	color: #f7f7f7;
	background: linear-gradient(140deg, #606c38 0%, #283618 100%);
	cursor: pointer;
	transition: transform 0.14s ease;
}

.primaryButton:hover {
	transform: translateY(-1px);
}

.primaryButton:disabled {
	cursor: wait;
	opacity: 0.72;
	transform: none;
}

.pathActions .primaryButton {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 72px;
	height: 46px;
	padding: 0;
	position: relative;
}

.pathSpinner {
	width: 0.95rem;
	height: 0.95rem;
	border-radius: 999px;
	border: 2px solid rgba(247, 247, 247, 0.28);
	border-top-color: #f7f7f7;
	animation: pathButtonSpin 0.7s linear infinite;
}

@keyframes pathButtonSpin {
	to {
		transform: rotate(360deg);
	}
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
	padding: 0;
	list-style: none;
	display: grid;
	gap: 0.75rem;
}

.pathResults > li {
	background: rgba(255, 255, 255, 0.82);
	border: 1px solid rgba(40, 54, 24, 0.15);
	border-radius: 12px;
	padding: 0.65rem 0.75rem;
}

.pathSteps {
	margin: 0;
	padding-left: 1rem;
	display: grid;
	gap: 0.2rem;
}

.pathSteps > li {
	margin: 0;
	color: #495057;
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

.recipeButton {
	flex: 1;
	min-width: 0;
	color: inherit;
	font: inherit;
	background: transparent;
	border: 0;
	padding: 0;
	text-align: left;
	cursor: pointer;
}

.recipeButton:hover {
	text-decoration: underline;
}

.pathSteps .recipeButton {
	display: inline;
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

.recipeModalOverlay {
	position: fixed;
	inset: 0;
	z-index: 20;
	display: grid;
	place-items: center;
	padding: 1rem;
	background: rgba(20, 24, 16, 0.55);
	backdrop-filter: blur(6px);
}

.recipeModal {
	width: min(760px, 100%);
	max-height: min(86vh, 900px);
	overflow: auto;
	background: #fffdf7;
	border-radius: 18px;
	border: 1px solid rgba(40, 54, 24, 0.18);
	box-shadow: 0 24px 60px rgba(17, 17, 17, 0.28);
	padding: 1rem 1rem 1.1rem;
	color: #1d1d1d;
}

.recipeModalHeader {
	display: flex;
	justify-content: space-between;
	gap: 1rem;
	align-items: start;
	margin-bottom: 0.9rem;
}

.recipeModalEyebrow {
	margin: 0 0 0.15rem;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	font-size: 0.72rem;
	font-weight: 700;
	color: #6b705c;
}

.recipeModal h2 {
	margin: 0;
	font-family: 'Palatino Linotype', Palatino, 'Book Antiqua', serif;
	font-size: clamp(1.5rem, 4vw, 2.1rem);
	line-height: 1.06;
	color: #283618;
}

.recipeModalClose {
	border: 1px solid rgba(40, 54, 24, 0.18);
	border-radius: 999px;
	background: #fff;
	color: #283618;
	font: inherit;
	font-weight: 700;
	padding: 0.52rem 0.9rem;
	cursor: pointer;
}

.recipeModalState {
	margin: 0;
	font-size: 0.95rem;
	color: #495057;
}

.recipeModalError {
	color: #9d0208;
	font-weight: 600;
}

.recipeIngredients,
.recipeDirections {
	margin: 0.85rem 0 0;
	padding-left: 1.2rem;
	display: grid;
	gap: 0.35rem;
}

.recipeIngredients {
	list-style: disc;
}

.recipeDirections {
	list-style: decimal;
	gap: 0.5rem;
}

.recipeIngredients li,
.recipeDirections li {
	line-height: 1.45;
	color: #263238;
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

	.recipeModalHeader {
		flex-direction: column;
	}

	.inputRow {
		grid-template-columns: 1fr;
	}

	.primaryButton {
		padding: 0.7rem;
	}

	.graph {
		height: min(66vh, 540px);
	}
}
</style>
