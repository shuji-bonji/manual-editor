/**
 * Web Components のビルドの入口。読み込むと <experiential-manual> が登録される。
 *
 *   <script type="module" src="experiential-manual.js"></script>
 *   <experiential-manual src="./help/manual.json" topic="topic-buy" hints></experiential-manual>
 */
import ExperientialManual from './element/ExperientialManual.svelte';

export { ExperientialManual };
export * from './runtime/index.js';
