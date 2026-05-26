<template>
	<div class="ingredientField">
		<label :for="inputId">{{ label }}</label>
		<input
			:id="inputId"
			ref="inputRef"
			:value="modelValue"
			type="text"
			autocomplete="off"
			:placeholder="placeholder"
			:disabled="disabled"
			:tabindex="tabIndex"
			:style="{ width: inputWidth }"
			@focus="onInputFocus"
			@blur="onInputBlur"
			@input="onInput"
			@keydown="onInputKeydown"
		/>

		<ul v-if="showSuggestions" class="suggestions" role="listbox">
			<li
				v-for="(item, index) in suggestions"
				:key="item.name"
				class="suggestion"
				:class="{ active: index === activeSuggestionIndex }"
				role="option"
				@mousedown.prevent="selectSuggestion(item.name)"
			>
				<span v-html="highlightSuggestion(item.name)"></span>
				<small v-if="showType">{{ item.type }}</small>
			</li>
		</ul>
	</div>
</template>

<script setup lang="ts">
type IngredientSuggestion = {
	name: string;
	type: string;
};

const props = withDefaults(
	defineProps<{
		modelValue: string;
		inputId: string;
		label: string;
		placeholder?: string;
		disabled?: boolean;
		showType?: boolean;
		inputWidth?: string;
		blurOnSelect?: boolean;
		tabIndex?: number;
	}>(),
	{
		placeholder: '',
		disabled: false,
		showType: true,
		inputWidth: '100%',
		blurOnSelect: false,
		tabIndex: undefined,
	},
);

const emit = defineEmits<{
	(e: 'update:modelValue', value: string): void;
	(e: 'select', value: string): void;
	(e: 'submit'): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const suggestions = ref<IngredientSuggestion[]>([]);
const activeSuggestionIndex = ref(0);
const isFocused = ref(false);
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const showSuggestions = computed(
	() =>
		isFocused.value &&
		suggestions.value.length > 0 &&
		props.modelValue.trim().length > 0,
);

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function capitalizeWords(value: string): string {
	return value.replace(/\b([A-Za-z])/g, (letter) => letter.toUpperCase());
}

function highlightSuggestion(name: string): string {
	const query = props.modelValue.trim();
	const displayName = capitalizeWords(name);
	if (!query) {
		return escapeHtml(displayName);
	}

	const safeName = escapeHtml(displayName);
	const regex = new RegExp(`(${escapeRegExp(escapeHtml(query))})`, 'ig');
	return safeName.replace(regex, '<strong>$1</strong>');
}

async function fetchSuggestions(input: string): Promise<void> {
	if (!input.trim()) {
		suggestions.value = [];
		return;
	}

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
	}
}

function selectSuggestion(name: string): void {
	emit('update:modelValue', name);
	emit('select', name);
	suggestions.value = [];
	if (props.blurOnSelect) {
		inputRef.value?.blur();
	}
}

function onInput(event: Event): void {
	const target = event.target as HTMLInputElement;
	emit('update:modelValue', target.value);
}

function onInputFocus(): void {
	isFocused.value = true;
	if (props.modelValue.trim()) {
		void fetchSuggestions(props.modelValue);
	}
}

function onInputBlur(): void {
	isFocused.value = false;
	setTimeout(() => {
		if (!isFocused.value) {
			suggestions.value = [];
		}
	}, 80);
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
		emit('submit');
	}
}

watch(
	() => props.modelValue,
	(value) => {
		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer);
		}

		searchDebounceTimer = setTimeout(() => {
			if (!isFocused.value) {
				suggestions.value = [];
				return;
			}
			void fetchSuggestions(value);
		}, 140);
	},
	{ flush: 'post' },
);

onBeforeUnmount(() => {
	if (searchDebounceTimer) {
		clearTimeout(searchDebounceTimer);
	}
});
</script>

<style scoped>
.ingredientField {
	position: relative;
	min-width: 0;
}

label {
	display: block;
	font-size: 0.86rem;
	font-weight: 700;
	margin-bottom: 0.4rem;
	color: #344e41;
}

input {
	display: block;
	box-sizing: border-box;
	max-width: 100%;
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

.suggestions {
	position: absolute;
	z-index: 5;
	left: 0;
	right: 0;
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
}

.suggestion small {
	text-transform: lowercase;
	opacity: 0.72;
}

.suggestion.active,
.suggestion:hover {
	background: #e9edc9;
}
</style>
