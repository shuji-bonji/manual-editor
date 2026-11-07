/**
 * player の部品（Svelte 5）。editor はここから Stage と Frame を使う。
 */
export { default as Stage } from './Stage.svelte';
export { default as ScreenPane } from './ScreenPane.svelte';
export { default as ScreenFlow } from './ScreenFlow.svelte';
export { default as TopicView } from './TopicView.svelte';
export { default as ProcedureView } from './ProcedureView.svelte';
export { default as BlockView } from './BlockView.svelte';
export { default as FaultTree } from './FaultTree.svelte';
export { default as Figure } from './Figure.svelte';
export { default as Admonitions } from './Admonitions.svelte';
export { default as Frame } from './Frame.svelte';
export { t, toLang, type Key, type Lang } from './text.js';
