/**
 * player の runtime。Manual を読んで「今どこにいるか」を持つ。Svelte に依存しない。
 *
 * - scope: 適用範囲の選択と絞り込み
 * - lookup: id から Topic / Screen / Step を探す
 * - flow: 画面遷移（P-1）。ホットスポットを押して進む、戻る、最初から
 * - procedure: 手順（P-2）。番号、1 つずつ進める、分岐
 * - troubleshooting: 困ったとき（P-4）。問いと答えの列
 */
export { createStore, type Readable, type Writable } from './store.js';
export {
  applicableBlocks,
  applicableScreens,
  applicableSteps,
  applicableTopics,
  isApplicable,
  listScopeProperties,
  parseScopeSelection,
  type ScopeProperty,
  type ScopeSelection
} from './scope.js';
export {
  findScreen,
  findStep,
  findTopic,
  resolveTarget,
  startScreenOf,
  type ScreenHit,
  type StepHit,
  type Target
} from './lookup.js';
export { createFlow, type Flow, type FlowOptions, type FlowState, type Pressable, type PressResult } from './flow.js';
export {
  createProcedure,
  type Branch,
  type NextResult,
  type Procedure,
  type ProcedureOptions,
  type ProcedureState
} from './procedure.js';
export {
  createTroubleshooting,
  type AnswerOption,
  type AnswerResult,
  type Asked,
  type Troubleshooting,
  type TroubleshootingOptions,
  type TroubleshootingState
} from './troubleshooting.js';
