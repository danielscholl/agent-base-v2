# Changelog

## [0.3.8](https://github.com/danielscholl/agent-base-v2/compare/v0.3.7...v0.3.8) (2026-01-06)


### Features

* **cli:** enforce https and trusted-domain checks for downloads ([efa3278](https://github.com/danielscholl/agent-base-v2/commit/efa327879cd11ebe97f6f0886f609f25fa0f4d75))
* **update:** add trusted-domain URL validation for downloads ([c47dbd1](https://github.com/danielscholl/agent-base-v2/commit/c47dbd18fd8865dd9ddcf1ded3992aba07e9d6f0))
* **workspace:** add workspace root CLI management ([45e87c7](https://github.com/danielscholl/agent-base-v2/commit/45e87c7e549a78763a39de0652639ea7ad920963))
* **workspace:** add workspace root management (show/set/clear) ([760854d](https://github.com/danielscholl/agent-base-v2/commit/760854d942694f73568160601aec22c76700fc66))
* **workspace:** strengthen workspace root narrowing with symlink safety ([3982bbe](https://github.com/danielscholl/agent-base-v2/commit/3982bbe1cd6508e05ec52568a33f879c3a9124e3))


### Bug Fixes

* **security:** resolve CodeQL network data validation and add dependabot ([c297b60](https://github.com/danielscholl/agent-base-v2/commit/c297b6041a0e3f099f691fecda3e57bbce2ad4d1))


### Code Refactoring

* **update:** use validated data copy before writing archive ([487c0c9](https://github.com/danielscholl/agent-base-v2/commit/487c0c94b0e02b812e6d8f098fd30dbfc92d97ac))


### Tests

* **workspace:** add tests for getWorkspaceInfo resolution logic ([c6b3a85](https://github.com/danielscholl/agent-base-v2/commit/c6b3a8538bb0deb7d0dd586caa06b67713446439))


### Build System

* **bun:** update bun.lock dependencies ([c3e315a](https://github.com/danielscholl/agent-base-v2/commit/c3e315a589e094f632dfad8fbb9f8c938e5f2e3c))


### Continuous Integration

* auto-regenerate bun.lock for Dependabot PRs ([610f4a8](https://github.com/danielscholl/agent-base-v2/commit/610f4a8e28f682cdfae74db18bc617240851c65e))
* **dependabot:** update bun workflow and lockfile handling ([689a5c9](https://github.com/danielscholl/agent-base-v2/commit/689a5c9f641cec8b9257cd30617bb22a2c6d6c8d))
* **deps:** bump the actions group with 5 updates ([eb20432](https://github.com/danielscholl/agent-base-v2/commit/eb204324525c632af8948bc730793d778270fa2d))
* **deps:** bump the actions group with 5 updates ([8bea399](https://github.com/danielscholl/agent-base-v2/commit/8bea399e43dbb76343a5f0c8fd7a2e4769185245))
* **workflow:** add dependabot bun lockfile workflow ([80a31d5](https://github.com/danielscholl/agent-base-v2/commit/80a31d5d09233fa5594889b9a1889499c094286b))


### Miscellaneous

* **deps:** bump the dev-dependencies group with 3 updates ([ac4452f](https://github.com/danielscholl/agent-base-v2/commit/ac4452f4ba11162be76f261206d7e036d87add65))
* **deps:** bump the dev-dependencies group with 3 updates ([1d2bd1e](https://github.com/danielscholl/agent-base-v2/commit/1d2bd1e44b206918e5c4fecf4d0c11eaebe151db))
* update dependabot to allow major updates across groups ([efa3278](https://github.com/danielscholl/agent-base-v2/commit/efa327879cd11ebe97f6f0886f609f25fa0f4d75))

## [0.3.7](https://github.com/danielscholl/agent-base-v2/compare/v0.3.6...v0.3.7) (2026-01-06)


### Features

* **prompts:** add AGENTS.md support ([3a9906d](https://github.com/danielscholl/agent-base-v2/commit/3a9906dfe0d05a029cd4d475d4e1a504d30be12f))
* **prompts:** add AGENTS.md support for prompts ([d061ee4](https://github.com/danielscholl/agent-base-v2/commit/d061ee43dbec34c80755fa4fcf4473bc4ca6bdb9))
* **prompts:** use workspace root for AGENTS.md discovery ([c0445f9](https://github.com/danielscholl/agent-base-v2/commit/c0445f91c32bc2b3cc2cec2c281f04989ebd90e0))


### Documentation

* **architecture:** apply targeted polish to README ([800a3d4](https://github.com/danielscholl/agent-base-v2/commit/800a3d4d9523733c1416ff506c7e66f8b929b19b))
* **architecture:** final polish pass ([5ee874a](https://github.com/danielscholl/agent-base-v2/commit/5ee874a2b994400a82193b6d9c3b00cd61143890))
* **architecture:** improve readability and address feedback ([8bc065f](https://github.com/danielscholl/agent-base-v2/commit/8bc065faa4ae593408f51a42f32f5090563abe7f))
* **architecture:** improve README as effective entry point ([ae69506](https://github.com/danielscholl/agent-base-v2/commit/ae6950602c6a0dff5b949065ee5dc11b01e0766d))
* **architecture:** improve README as effective entry point ([009f89a](https://github.com/danielscholl/agent-base-v2/commit/009f89ac76262cea93be1990c307e0af6ba64e47))
* **architecture:** refresh architecture docs with clarifications and notes ([c581c94](https://github.com/danielscholl/agent-base-v2/commit/c581c9461466311ef00543d58303937df6f11160))
* **prompts:** clarify skills loading via loadSystemPromptWithSkills() ([5b850f5](https://github.com/danielscholl/agent-base-v2/commit/5b850f5fb88dab4c84be709d7d66ddb092b0b6c7))
* **readme:** reorganize with improved information architecture ([0f47123](https://github.com/danielscholl/agent-base-v2/commit/0f47123ea649426d10361647c1e6559a15efbf16))
* **readme:** reorganize with improved information architecture ([e4fa92c](https://github.com/danielscholl/agent-base-v2/commit/e4fa92cdf25cb04666b8d3a52cde3554fe382630))
* **readme:** simplify intro and remove deprecated sections ([b5077ea](https://github.com/danielscholl/agent-base-v2/commit/b5077eaa77b969492a81de86cad06277522a9b52))
* **readme:** simplify intro and remove deprecated sections ([300adc6](https://github.com/danielscholl/agent-base-v2/commit/300adc6638a4a90d9dfcfd7f8923d5893a52a601))
* **readme:** simplify memory description and add silent mode examples ([3a87648](https://github.com/danielscholl/agent-base-v2/commit/3a8764818fe56c33d0530b3f0d46f2b8be652634))

## [0.3.6](https://github.com/danielscholl/agent-base-v2/compare/v0.3.5...v0.3.6) (2026-01-06)


### Features

* **cli:** use platform-aware tar flags and detect prebuilt binaries ([95355b6](https://github.com/danielscholl/agent-base-v2/commit/95355b69a93a544b338538782e3d745b27b8c250))


### Bug Fixes

* **update:** use linux-only --no-absolute-names for tar extraction ([e275684](https://github.com/danielscholl/agent-base-v2/commit/e275684f02fc4248cf6d2b0badc06e166192d994))
* **update:** use platform-aware tar flags for macOS compatibility ([f55888c](https://github.com/danielscholl/agent-base-v2/commit/f55888cf6bd186035998bd1d75b524f5bce4515e))

## [0.3.5](https://github.com/danielscholl/agent-base-v2/compare/v0.3.4...v0.3.5) (2026-01-06)


### Bug Fixes

* **model:** correct Azure provider detection in --check ([06f1eef](https://github.com/danielscholl/agent-base-v2/commit/06f1eefb23e32cd2dde3ff286a744c8e4a3b7672))
* **model:** treat azure as configured if endpoint or deployment or apiVersion is set ([365ed28](https://github.com/danielscholl/agent-base-v2/commit/365ed28849e12581e60bc209fbbdb1189fdf6482))
* **utils:** restrict azure config to endpoint or deployment only ([8e5f1b4](https://github.com/danielscholl/agent-base-v2/commit/8e5f1b4dfaeb90ba71a69b14e1db6882da509eee))

## [0.3.4](https://github.com/danielscholl/agent-base-v2/compare/v0.3.3...v0.3.4) (2026-01-06)


### Bug Fixes

* **cli:** correct exe path selection for bun binaries ([2ae88a0](https://github.com/danielscholl/agent-base-v2/commit/2ae88a028df2a11b43835a715b9701584a1bf236))
* **cli:** correct installation type detection for compiled Bun binaries ([d757e4c](https://github.com/danielscholl/agent-base-v2/commit/d757e4c187e9a00aa2972f5d36a55804baeecdce))

## [0.3.3](https://github.com/danielscholl/agent-base-v2/compare/v0.3.2...v0.3.3) (2026-01-06)


### Features

* add telemetry CLI, default foundry mode to cloud ([b38498a](https://github.com/danielscholl/agent-base-v2/commit/b38498a0790700c4de878adffb78eb9887b936b3))
* **azure-openai:** auto-select chat vs responses Azure API by model ([d92f43b](https://github.com/danielscholl/agent-base-v2/commit/d92f43bd16342762cbcdb9743090074b425022f8))
* **azureai:** add azure-responses chat model for azure openai ([ec22a2e](https://github.com/danielscholl/agent-base-v2/commit/ec22a2e4589edede9fb14b8fd1bf82528dda9608))
* **github:** auto-detect org via gh CLI for GitHub models ([d92f43b](https://github.com/danielscholl/agent-base-v2/commit/d92f43bd16342762cbcdb9743090074b425022f8))
* **github:** improve token handling and models:read scope guidance ([5aab0ba](https://github.com/danielscholl/agent-base-v2/commit/5aab0ba0bb06a9e072df3980ef8c93d373120814))
* **prompts:** enable mode-specific provider prompts and loading ([aeb5416](https://github.com/danielscholl/agent-base-v2/commit/aeb5416a86d5ce39b27f22134dc16b6b92a08ebe))
* **providers:** enhance config display and add telemetry CLI ([1dae745](https://github.com/danielscholl/agent-base-v2/commit/1dae74587e105bd217578b3e66a52224da0d49f5))
* **providers:** enhance config display and simplify base prompt ([f04bd79](https://github.com/danielscholl/agent-base-v2/commit/f04bd79df2bf3e874303a25191161b398ae1d986))


### Bug Fixes

* **azure-openai:** tighten requiresResponsesApi deployment matching ([5f8650a](https://github.com/danielscholl/agent-base-v2/commit/5f8650a20bd9d222a2a36f4aca6f3cf8aab63d29))
* **azure:** respect field.isOptional() when determining required fields ([88e8591](https://github.com/danielscholl/agent-base-v2/commit/88e8591a986774e92a866c9bcf82b0c751a626ab))


### Documentation

* **architecture:** document streaming callbacks and dual API support ([c5e14b4](https://github.com/danielscholl/agent-base-v2/commit/c5e14b4d781fc9d4d9d2a9448ba616f981b03a03))


### Code Refactoring

* **azure:** adjust bindTools to accept unknown[] ([186d878](https://github.com/danielscholl/agent-base-v2/commit/186d878830d82aced2aeb1e6a3a035f826d37648))


### Tests

* **azure:** add token provider tests for Azure OpenAI client ([3c38b1d](https://github.com/danielscholl/agent-base-v2/commit/3c38b1d53abe38b68b264eb8b0cdd688301832b2))
* **config:** add tests for foundry mode display in config show ([8aacc11](https://github.com/danielscholl/agent-base-v2/commit/8aacc11e12c036921d45c47e4c4d720adf596e23))


### Miscellaneous

* **cli:** remove telemetry command and aliases from CLI ([e3dff40](https://github.com/danielscholl/agent-base-v2/commit/e3dff40e5e5f88ff6b0e7fd05c2a06c6e44a1afb))

## [0.3.2](https://github.com/danielscholl/agent-base-v2/compare/v0.3.1...v0.3.2) (2026-01-05)


### Continuous Integration

* **release:** adjust release workflow fail-fast and publish condition ([a03677c](https://github.com/danielscholl/agent-base-v2/commit/a03677c673be2a9159fc513102d4118291f5ee73))
* **release:** improve release workflow resilience and update docs ([8b15ede](https://github.com/danielscholl/agent-base-v2/commit/8b15ede0a8d63c34fd7cc62d8d09c1c1f740f792))

## [0.3.1](https://github.com/danielscholl/agent-base-v2/compare/v0.3.0...v0.3.1) (2026-01-05)


### Features

* **update:** add --no-absolute-names tar flag ([a4c5041](https://github.com/danielscholl/agent-base-v2/commit/a4c504148b72cb42622e85678b91d11a907cabc0))
* **update:** add auto-update system with version checking ([0ded57e](https://github.com/danielscholl/agent-base-v2/commit/0ded57eceb57fb2ca40d043a772af5fa76855e99))
* **update:** add GitHub token auth header for release fetch ([a4c5041](https://github.com/danielscholl/agent-base-v2/commit/a4c504148b72cb42622e85678b91d11a907cabc0))
* **update:** implement multi-type updater with GitHub releases ([e0229d7](https://github.com/danielscholl/agent-base-v2/commit/e0229d7d1820988400d14771697cb5c33379fe0b))
* **update:** improve update flow and checksum parsing ([08d86af](https://github.com/danielscholl/agent-base-v2/commit/08d86af8dac58a2a7f203fed4c85f3403c3177b5))
* **updater:** improve updater reliability and status UI ([3f1647c](https://github.com/danielscholl/agent-base-v2/commit/3f1647cf08799edcac3822f74977eea190b4d832))
* **update:** use provided token for authorization in releases request ([a4c5041](https://github.com/danielscholl/agent-base-v2/commit/a4c504148b72cb42622e85678b91d11a907cabc0))
* **update:** use VERSION constant for current version checks ([4f06a15](https://github.com/danielscholl/agent-base-v2/commit/4f06a15f2f25f39f60d355a2226d4d1ccec948a0))
* **update:** validate and sanitize update data from github ([dd582d0](https://github.com/danielscholl/agent-base-v2/commit/dd582d0d35024623749fd53f2bda21711bb87484))


### Bug Fixes

* **cli:** create temp dir early and remove it in finally ([bde0262](https://github.com/danielscholl/agent-base-v2/commit/bde0262a1c7c8d165baee943a46d7f1051690497))
* **cli:** harden semver handling and temp cleanup in update ([bde0262](https://github.com/danielscholl/agent-base-v2/commit/bde0262a1c7c8d165baee943a46d7f1051690497))
* **cli:** validate and sanitize semver; drop invalid cache files ([bde0262](https://github.com/danielscholl/agent-base-v2/commit/bde0262a1c7c8d165baee943a46d7f1051690497))


### Documentation

* **decisions:** add self-update strategy ADR ([207e244](https://github.com/danielscholl/agent-base-v2/commit/207e2441dda107d15a3a9c82a7295528b334a7df))
* **readme:** update llm providers and installation sections ([844521f](https://github.com/danielscholl/agent-base-v2/commit/844521fb4e7a7b80cf63a0d2942322993615e854))

## [0.3.0](https://github.com/danielscholl/agent-base-v2/compare/v0.2.2...v0.3.0) (2026-01-05)


### ⚠ BREAKING CHANGES

* **tools:** createTool(), successResponse(), errorResponse(), and wrapWithToolResponse() exports removed from tools/index.ts

### Features

* add GitHub and GitLab CLI bundled skills ([095b0ea](https://github.com/danielscholl/agent-base-v2/commit/095b0ea8d4835f6be1d601e1a8f5af80a56c9df9))
* add GitHub and GitLab CLI bundled skills ([62ee87d](https://github.com/danielscholl/agent-base-v2/commit/62ee87da581e25e5d62c97d9015d6b91d6eedcee))
* **agent:** add debug callback support for git command failures ([5381e26](https://github.com/danielscholl/agent-base-v2/commit/5381e26c09e897c78b0003ffb10e775c7e2cd48f))
* **agent:** add useToolRegistry option with legacy mode ([7309157](https://github.com/danielscholl/agent-base-v2/commit/7309157d2bfa0e359f8707a23417dd0d25ce6cff))
* **agent:** detect LLM_ASSIST_REQUIRED from multiple formats ([46780e6](https://github.com/danielscholl/agent-base-v2/commit/46780e6d1066391fc2d86238e49b97dea671e333))
* **agent:** detect LLM_ASSIST_REQUIRED signals in tool output ([6ad5e0a](https://github.com/danielscholl/agent-base-v2/commit/6ad5e0aae69af7af2ff233df0bbb77f5874b3f6e))
* **agent:** enhance LLM assist parsing with multi-strategy approach ([70442aa](https://github.com/danielscholl/agent-base-v2/commit/70442aae75ccaa45d7c97968ef8130ab5a6e69ff))
* **agent:** implement core Agent orchestration loop ([d1ee9f8](https://github.com/danielscholl/agent-base-v2/commit/d1ee9f8f96d122b42ec458263f0cdeb92500a2fd))
* **agent:** implement core Agent orchestration with tool execution ([209c861](https://github.com/danielscholl/agent-base-v2/commit/209c86111b9e43c3bc5af64205035ef83616f6b3))
* **agent:** load tools from ToolRegistry and drop legacy tool injection ([6c8abff](https://github.com/danielscholl/agent-base-v2/commit/6c8abff09032ae6884323b281094d0dc041110ab))
* **cli:** add update command to manage agent updates ([0162584](https://github.com/danielscholl/agent-base-v2/commit/01625846481b9bcda47b6d8d17ec0885a118ddf9))
* **cli:** enhance cli help and add skill help ([58345ad](https://github.com/danielscholl/agent-base-v2/commit/58345ad6dcdb6557de98f7ef378a81252073538b))
* **cli:** enhance nested help and show subcommand for config ([8a863f0](https://github.com/danielscholl/agent-base-v2/commit/8a863f07ce0022e3a1ac7b088d28baec200482f2))
* **cli:** implement CLI subcommands and redesign health check display ([520ad50](https://github.com/danielscholl/agent-base-v2/commit/520ad50b649cfdfb6b93b54bb6cadc0f0a7a3768))
* **cli:** implement CLI subcommands and redesign health check display ([1524634](https://github.com/danielscholl/agent-base-v2/commit/152463470559795e5a7f4509ec22357a643f771b))
* **cli:** implement command autocomplete with telemetry integration ([8abf85f](https://github.com/danielscholl/agent-base-v2/commit/8abf85f5565a59f01e1db7c3ec29df20f9c67e3e))
* **cli:** implement comprehensive configuration and skill management commands ([db2631a](https://github.com/danielscholl/agent-base-v2/commit/db2631aa9f3898922f9ab39e2f875c0b7a08f666))
* **cli:** implement Ink CLI shell with interactive and single-prompt modes ([a9d6ba4](https://github.com/danielscholl/agent-base-v2/commit/a9d6ba429d0b23a5c0fe6daf5d49a1fa777afeb2))
* **cli:** implement ink-based CLI for agent with meow parsing ([f5ccfc2](https://github.com/danielscholl/agent-base-v2/commit/f5ccfc28ecaf50b93dab7df87810cc0f83590626))
* **cli:** implement input handling and command parsing system ([400a22d](https://github.com/danielscholl/agent-base-v2/commit/400a22d9f003491769f413af74ad8607ec092afa))
* **cli:** implement input handling and command parsing system ([6574b6a](https://github.com/danielscholl/agent-base-v2/commit/6574b6a0a7dda7c77fd9bc4b83e57a11bea570bc))
* **cli:** implement Phase 5 CLI completeness (Features 31-35) ([7cfa543](https://github.com/danielscholl/agent-base-v2/commit/7cfa543a8a9ed83291348e4ebb97f2da81caf0db))
* **components:** add React App component with test configuration ([8f6de47](https://github.com/danielscholl/agent-base-v2/commit/8f6de4709b8d340654a44d3f01de8091786e523a))
* **config:** add dirname method to IFileSystem interface ([b0685c3](https://github.com/danielscholl/agent-base-v2/commit/b0685c308f65119e536ccb76d21cad00f90b4299))
* **config:** add pluginsDir support for skills config persistence ([d90221e](https://github.com/danielscholl/agent-base-v2/commit/d90221e8dafbc6ed353da96fb7683de3b7cc673f))
* **config:** add provider validation and setup wizard integration ([676c1df](https://github.com/danielscholl/agent-base-v2/commit/676c1dfe2d1b71049e38e64c16e64d4bcb973458))
* **config:** add validation for retry delay configuration ([745e346](https://github.com/danielscholl/agent-base-v2/commit/745e3468b2c0867c589a00751bede277a8af4558))
* **config:** enhance provider configuration with comprehensive management system ([9071279](https://github.com/danielscholl/agent-base-v2/commit/90712794a3069279bce0036e54c76377c82754c6))
* **config:** enhance provider configuration with comprehensive management system ([66a59a5](https://github.com/danielscholl/agent-base-v2/commit/66a59a57d6f17fa5040dc44510b44b921dc94e7f))
* **config:** enhance provider setup with environment variable detection ([89ae1aa](https://github.com/danielscholl/agent-base-v2/commit/89ae1aac8d81f1b1a05d0f25d373880f23b52135))
* **config:** enhance provider validation and input handling ([332a4c3](https://github.com/danielscholl/agent-base-v2/commit/332a4c394e0204b780399f511aa03b2867e7e625))
* **config:** implement configuration schemas and manager ([d887182](https://github.com/danielscholl/agent-base-v2/commit/d887182e12a7ca64349d76462771ff5aea3cf43b))
* **config:** implement configuration schemas and manager with Zod validation ([17b3f4d](https://github.com/danielscholl/agent-base-v2/commit/17b3f4d74a6829379d096b62ac1b63e9fd0530ee))
* **config:** migrate config from json to yaml ([f10fea4](https://github.com/danielscholl/agent-base-v2/commit/f10fea45591ef84db49e2898d93800ffdd2bff8a))
* **config:** replace interactive field editing with system editor integration ([e40b293](https://github.com/danielscholl/agent-base-v2/commit/e40b293a68cae80843ec49412bd67c904abff5ef))
* **errors:** implement structured error types with provider metadata ([43f3a74](https://github.com/danielscholl/agent-base-v2/commit/43f3a74c247033f73696b0aba5a9e782d955d2e0))
* **errors:** implement structured error types with provider metadata ([6d2bdba](https://github.com/danielscholl/agent-base-v2/commit/6d2bdba918637e43183db869af8466e578fbeef4))
* **execution:** add multi-phase verbose execution tracking ([97bf7cd](https://github.com/danielscholl/agent-base-v2/commit/97bf7cda160ab69051faa57bbd64d4eadc74fd0f))
* **execution:** add multi-phase verbose execution tracking ([b560f5f](https://github.com/danielscholl/agent-base-v2/commit/b560f5f6bf414cceb6d195b82c5d901647edec25))
* **foundry:** implement Azure AI Foundry provider with local and cloud modes ([ae162a2](https://github.com/danielscholl/agent-base-v2/commit/ae162a2c49f6b074ee1638216495c26b9c1509c5))
* **hooks:** add commit-msg hook to block Claude co-authorship ([457dedf](https://github.com/danielscholl/agent-base-v2/commit/457dedf09d21384049e7ddbf1bdb6d2810157369))
* implement compositional prompt system with provider layers ([ffe620f](https://github.com/danielscholl/agent-base-v2/commit/ffe620fa43ff9c8bfdc1003c1751bf7d2160fb63))
* implement compositional prompt system with provider layers ([cc2d5d0](https://github.com/danielscholl/agent-base-v2/commit/cc2d5d05ed086be62e2e3c327ec69220d773b9d6))
* implement comprehensive test infrastructure and documentation ([742ec14](https://github.com/danielscholl/agent-base-v2/commit/742ec14bb8620b6afe6c52873f1b2b4324c4e9ea))
* implement local Docker Model Runner provider ([fb71fd4](https://github.com/danielscholl/agent-base-v2/commit/fb71fd408aaae8f6e03d276dcad45bfcdbc44a59))
* implement message history memory for multi-turn conversations ([3c50350](https://github.com/danielscholl/agent-base-v2/commit/3c50350a40187df0dbd97b717c069314603e80f1))
* implement message history memory for multi-turn conversations ([a377f7f](https://github.com/danielscholl/agent-base-v2/commit/a377f7fb0f23c85735f5854b2783db0fa8fa2159))
* implement token counting utilities with session tracking ([aee34af](https://github.com/danielscholl/agent-base-v2/commit/aee34af46f0ade4d88ebc5f15ec63e05e669a240))
* initialize Bun + TypeScript workspace with React/Ink setup ([57aa2f2](https://github.com/danielscholl/agent-base-v2/commit/57aa2f24259759d4bc97e73b75cdbdd052343171))
* initialize Bun + TypeScript workspace with React/Ink setup ([1200774](https://github.com/danielscholl/agent-base-v2/commit/120077429a2a00bdfa74055573f0131ec7fded87))
* **installer:** add hybrid installation with pre-built binaries ([b0bfa6f](https://github.com/danielscholl/agent-base-v2/commit/b0bfa6fb3409a95ff4f8af9662d7929933be5525))
* **installer:** add hybrid installer with binary-first fallback ([508a9b5](https://github.com/danielscholl/agent-base-v2/commit/508a9b5e24af6f63c1cb6de1d848647076e5e971))
* **installer:** implement hybrid source/binary packaging ([636fd96](https://github.com/danielscholl/agent-base-v2/commit/636fd9686b5201ab1b5a5da459c2b786960693fc))
* **model:** add Anthropic, Gemini, and Azure OpenAI provider support ([17b2440](https://github.com/danielscholl/agent-base-v2/commit/17b2440b69dc2d99bc04388ba9c3a159862e11f5))
* **model:** add Anthropic, Gemini, and Azure OpenAI provider support ([5152c1d](https://github.com/danielscholl/agent-base-v2/commit/5152c1d1edc05be1bf0b2e2505dd13164a9287e5))
* **model:** add retry-after header support for rate limiting ([5c05483](https://github.com/danielscholl/agent-base-v2/commit/5c05483e0404aef9857491fe9e55011150ea2a35))
* **model:** enhance retry mechanism with HTTP-date support and comprehensive testing ([13b177d](https://github.com/danielscholl/agent-base-v2/commit/13b177d635be8d8d49b47f64a9b116c78c4b96ce))
* **model:** implement GitHub Models provider ([900cd53](https://github.com/danielscholl/agent-base-v2/commit/900cd534a214b6a001ce0fa20449a8b008d902f2))
* **model:** implement GitHub Models provider with OpenAI-compatible API ([7ccd6d1](https://github.com/danielscholl/agent-base-v2/commit/7ccd6d151c7b77da37436a694b2d0ddc00a554a5))
* **model:** implement multi-provider LLM abstraction with OpenAI support ([0903a2f](https://github.com/danielscholl/agent-base-v2/commit/0903a2fc4f22e762c07291436f19453de0bfe7ad))
* **model:** implement multi-provider LLM abstraction with OpenAI support ([e3ba58d](https://github.com/danielscholl/agent-base-v2/commit/e3ba58d7d97e429c32c5258773db8894670f603d))
* **model:** implement retry logic with exponential backoff ([df3b216](https://github.com/danielscholl/agent-base-v2/commit/df3b216186438ce6745bea8df45e7fe7454112ad))
* **model:** implement retry logic with exponential backoff ([04569df](https://github.com/danielscholl/agent-base-v2/commit/04569dfa8180b1618d7cd23e54e1846efabdb7cc))
* Phase 6 - Polish and Testing ([97f7591](https://github.com/danielscholl/agent-base-v2/commit/97f7591d3659e987d4f1715130d6ff374634848b))
* **plan:** add OpenTelemetry to Phase 1 foundation ([3e0d9b7](https://github.com/danielscholl/agent-base-v2/commit/3e0d9b7002feb782e73a3f3bf5d0a4770e87aa3c))
* **prompts:** add onDebug callback and warn on missing prompts ([61efda9](https://github.com/danielscholl/agent-base-v2/commit/61efda99126ae9d06b26e3eec3c69f614d6349a7))
* **prompts:** implement tiered prompt loading and per-agent tool ([e81b6d4](https://github.com/danielscholl/agent-base-v2/commit/e81b6d41594665b8c957c33250418e5d1d75a88a))
* **release:** simplify tag format to vX.Y.Z ([8e090e2](https://github.com/danielscholl/agent-base-v2/commit/8e090e272180e1f65b83be5bdde8760a165a3252))
* **release:** simplify tag format to vX.Y.Z ([2ebc8b2](https://github.com/danielscholl/agent-base-v2/commit/2ebc8b2f212b48c1f8c8f8ab0855ccab374ab3a3))
* **security:** add URL validation and domain allowlist to summarize tool ([ee1b0f0](https://github.com/danielscholl/agent-base-v2/commit/ee1b0f0d0e31d967fc757bf52c3212344c707266))
* **session:** implement interactive session selector for /resume command ([effff97](https://github.com/danielscholl/agent-base-v2/commit/effff97f3b19bc0e0b1e93946ebefb45234b49f1))
* **session:** implement session save/restore and history management ([7d41721](https://github.com/danielscholl/agent-base-v2/commit/7d417219ee802ba93959d8aeebda827b463e9be1))
* **session:** implement session save/restore and history management ([5e94df5](https://github.com/danielscholl/agent-base-v2/commit/5e94df536e50b4a51f70e74f20806ab144b6497b))
* **skills:** add plugin source support and legacy plugin defs ([31cd2fd](https://github.com/danielscholl/agent-base-v2/commit/31cd2fda2a4c74e71641a29e4ee42fb417dfdf36))
* **skills:** add plugin-based skill installer and plugin support ([0d1dab3](https://github.com/danielscholl/agent-base-v2/commit/0d1dab3a6866e18ced3b665a2c206e1718c9f7ce))
* **skills:** add pluginsDir and disabled flag for plugin management ([fb95971](https://github.com/danielscholl/agent-base-v2/commit/fb95971d4bdc3fc328ef9dfc1a56e44c2bbd7b52))
* **skills:** align skill commands with osdu-agent pattern ([71e4195](https://github.com/danielscholl/agent-base-v2/commit/71e4195e98fc276fd40e75c9358f096cbc403a24))
* **skills:** implement Agent Skills specification with progressive disclosure ([c3fef43](https://github.com/danielscholl/agent-base-v2/commit/c3fef43644f9111b59863aaf899266341a4baf41))
* **skills:** implement Agent Skills specification with progressive disclosure ([f17a6a6](https://github.com/danielscholl/agent-base-v2/commit/f17a6a6c5c34dba962a99d485624945e01f33cec))
* **skills:** loader supports includeDisabled and plugin status ([fb95971](https://github.com/danielscholl/agent-base-v2/commit/fb95971d4bdc3fc328ef9dfc1a56e44c2bbd7b52))
* **skills:** refine skill install flow and description handling ([dd29b49](https://github.com/danielscholl/agent-base-v2/commit/dd29b494b5bd7479e31cbe2793652d8737ad164f))
* **skills:** support legacy plugins by deriving name from URL ([c26e92f](https://github.com/danielscholl/agent-base-v2/commit/c26e92f71e34b98ce7001ddcd8a0243b850efa3a))
* **skills:** validate git url/ref and switch to execFile ([fb95971](https://github.com/danielscholl/agent-base-v2/commit/fb95971d4bdc3fc328ef9dfc1a56e44c2bbd7b52))
* **skills:** validate skill names to prevent path traversal ([13b15fb](https://github.com/danielscholl/agent-base-v2/commit/13b15fb7c6146cdadb0a0df0ed1bcdf22309a0ae))
* **telemetry:** add gRPC exporter support and callback telemetry wrapper ([01632d7](https://github.com/danielscholl/agent-base-v2/commit/01632d76f74ed6ef15a5d63e1a18c0a2284f6182))
* **telemetry:** fix span hierarchy and add gRPC exporter support ([ba04e8b](https://github.com/danielscholl/agent-base-v2/commit/ba04e8b3937b4c6cd03c6d32c92c71a5f61698f4))
* **telemetry:** implement Aspire Dashboard Docker container management ([252f878](https://github.com/danielscholl/agent-base-v2/commit/252f878b7110558958abfaca751efef7d644debf))
* **telemetry:** implement Aspire Dashboard integration ([1bef734](https://github.com/danielscholl/agent-base-v2/commit/1bef734204160fe95f3ccaa867d40ac17b629a94))
* **telemetry:** implement GenAI semantic conventions for spans ([9b15af5](https://github.com/danielscholl/agent-base-v2/commit/9b15af5bbcabe86ce7d109bb29f51d1b9546a0dc))
* **telemetry:** implement GenAI semantic conventions for spans ([dbb3a82](https://github.com/danielscholl/agent-base-v2/commit/dbb3a82cf5d2c52fed36ea59c0487447ed02fab3))
* **telemetry:** implement OpenTelemetry setup with OTLP exporter ([4eca0c6](https://github.com/danielscholl/agent-base-v2/commit/4eca0c6bb2fa0de4f8acf7be7de62be27ddb5cc4))
* **telemetry:** implement OpenTelemetry setup with OTLP exporter ([b7330a9](https://github.com/danielscholl/agent-base-v2/commit/b7330a9ba3f0619723e451181e814c721966e871))
* **tokens:** implement session token usage tracking and display ([1a2f19a](https://github.com/danielscholl/agent-base-v2/commit/1a2f19a219d73cac57f6d7a1270ebe11a3c5ad55))
* **tool:** extend onToolEnd to receive executionResult ([5249133](https://github.com/danielscholl/agent-base-v2/commit/52491338d82ab52454d0a1e9a0d176a68c8e0f5f))
* **tools:** implement filesystem tools with workspace sandboxing ([d126abe](https://github.com/danielscholl/agent-base-v2/commit/d126abeb85cecd493838da8de2f60d36fe57cdf8))
* **tools:** implement filesystem tools with workspace sandboxing ([eb81720](https://github.com/danielscholl/agent-base-v2/commit/eb81720b2850d9618ee8d5d7abdbf2942838dc6c))
* **tools:** implement hello world and greet user tools ([ee34db6](https://github.com/danielscholl/agent-base-v2/commit/ee34db660038294d23a385b94cf61cb799b10964))
* **tools:** implement hello world and greet user tools ([0e8c75a](https://github.com/danielscholl/agent-base-v2/commit/0e8c75aae2b2a4ba03242187d23e3fde833a7ef9))
* **tools:** implement LangChain tool wrapper with response contract ([a4359ba](https://github.com/danielscholl/agent-base-v2/commit/a4359ba76e592ba66a04b3fa9170e0396ab79844))
* **tools:** implement LangChain tool wrapper with response contract ([6e00cef](https://github.com/danielscholl/agent-base-v2/commit/6e00cef0ff06bc0f1cd52cb176b0200be0aa55cc))
* **tools:** implement OpenCode-style tool system with registry and new tools ([0f43e98](https://github.com/danielscholl/agent-base-v2/commit/0f43e983ab0e719607f9eb8eda4c8af6bd5a23bc))
* **ui:** enhance header with context information and styling ([9a0e24e](https://github.com/danielscholl/agent-base-v2/commit/9a0e24e86adbe8a41c16171d86b4c40cd8728f69))
* **ui:** implement execution status visualization with tree display ([581d760](https://github.com/danielscholl/agent-base-v2/commit/581d760428a1e84b19040d77f6295c4f8b93baa6))
* **ui:** implement execution status visualization with tree display ([9d49f9f](https://github.com/danielscholl/agent-base-v2/commit/9d49f9f7b47ba1cfdd92225b5e032711a756bc9b))
* **ui:** implement terminal display components for agent feedback ([6805618](https://github.com/danielscholl/agent-base-v2/commit/6805618b8326c03f0bd9db32dabc38e2129376a2))
* **ui:** implement terminal display components for agent feedback ([ec5a42e](https://github.com/danielscholl/agent-base-v2/commit/ec5a42e8c8a6b30c09933f28eb08ad6228eefff2))
* **utils:** implement token counting utilities with session tracking ([44dca43](https://github.com/danielscholl/agent-base-v2/commit/44dca43ba75406de0f624ea8de45d501a03813a7))
* **utils:** implement tool context persistence with filesystem storage ([c042131](https://github.com/danielscholl/agent-base-v2/commit/c042131bae8b9fa01165e8977010317c2e066879))
* **utils:** implement tool context persistence with filesystem storage ([032d1df](https://github.com/danielscholl/agent-base-v2/commit/032d1df484f028a475518f5e77bdd3baa3a71d44))
* UX improvements for session management and verbose mode ([740e2b6](https://github.com/danielscholl/agent-base-v2/commit/740e2b62755a1205953fc9eee0640083e8af5fb2))
* **workspace:** add initializeWorkspaceRoot to resolve workspace root ([5160ddb](https://github.com/danielscholl/agent-base-v2/commit/5160ddbc21746d073339549c5ae03ef678f112f1))
* **workspace:** async, symlink-safe workspace root resolution ([97d46cb](https://github.com/danielscholl/agent-base-v2/commit/97d46cb6edbe75ed72dae6c83166b7a0e420f82d))


### Bug Fixes

* **agent:** add type-safe error code mapping for model errors ([4f1e8c8](https://github.com/danielscholl/agent-base-v2/commit/4f1e8c8628fe8c5d0f196c905fe046ff37edf898))
* **agent:** resolve wiring bugs and harden workspace security ([92717da](https://github.com/danielscholl/agent-base-v2/commit/92717da524d76e11855860943bea5761fac6c3eb))
* **agent:** unify tool result contract and remove legacy code ([cac0675](https://github.com/danielscholl/agent-base-v2/commit/cac06750a1c04609cc1468319866bc8676dd037f))
* align architecture docs with implementation ([f06dba9](https://github.com/danielscholl/agent-base-v2/commit/f06dba907ef523b24283691288d795324cd913a7))
* **build:** remove scripts from tsconfig include ([c93ab14](https://github.com/danielscholl/agent-base-v2/commit/c93ab140a5baac9c4266d2b865b0e7bba822c597))
* **ci:** fix issues in 7 files ([b6f27e2](https://github.com/danielscholl/agent-base-v2/commit/b6f27e2d861f05314bcba50d9056e7d786a1f682))
* **cli:** unify help styling and fix provider config detection ([575edfb](https://github.com/danielscholl/agent-base-v2/commit/575edfb44387dd11a2b7fc454bb51efd454cad61))
* **config:** exclude scripts from typecheck and eslint ([778aa24](https://github.com/danielscholl/agent-base-v2/commit/778aa2492b771e20d6d9932c23f4606d4ac3c002))
* **config:** improve endpoint validation using URL parsing ([729fc60](https://github.com/danielscholl/agent-base-v2/commit/729fc601e1112d01aa98e55fb3deb5ed5ebf24bb))
* **config:** improve YAML parse error handling in config loader ([262db29](https://github.com/danielscholl/agent-base-v2/commit/262db29f5a889dd2d189d52bce0fd10853f24ebc))
* **config:** robust YAMLParseError detection in ConfigManager ([3f10095](https://github.com/danielscholl/agent-base-v2/commit/3f10095fe90a5302a21c9cbb9f3157352bcf9dff))
* **config:** use YAMLParseError for YAML parse error checks ([b8180bd](https://github.com/danielscholl/agent-base-v2/commit/b8180bdf056d93b1025c99637bab244f46157dc6))
* **docs:** fix issues in 13 files ([97c8975](https://github.com/danielscholl/agent-base-v2/commit/97c8975fe619dea0c0da612ccb261cab475da585))
* **foundry:** improve validation for model initialization and API key ([81579ee](https://github.com/danielscholl/agent-base-v2/commit/81579eef101d8bb77ac39f57c975f1f16543c15f))
* **foundry:** validate apiKey requirement in cloud mode ([7046051](https://github.com/danielscholl/agent-base-v2/commit/70460512e44b0a85b52b7c177c83d1e3fc88a60a))
* improve telemetry and error signaling for tool execution ([0394ad9](https://github.com/danielscholl/agent-base-v2/commit/0394ad940de5dbdd5d39337731b7e9bcacbee39f))
* **install:** address remaining review findings ([5d37c53](https://github.com/danielscholl/agent-base-v2/commit/5d37c53fd5a9722bc587b313bb4615395886cf4b))
* **install:** copy assets alongside agent.exe on Windows ([0df3433](https://github.com/danielscholl/agent-base-v2/commit/0df343369056d2bfa7f6a3709ba8cf5f8e909fcf))
* **installer:** restrict git URL validation to HTTPS only ([777ba65](https://github.com/danielscholl/agent-base-v2/commit/777ba6565d1d6dc7f657fbe4d3cc17bc397ba151))
* **model:** improve OpenAI client robustness and cross-platform compatibility ([1555e8b](https://github.com/danielscholl/agent-base-v2/commit/1555e8bc4bf51bd12c1061a0328696b86a97f8b2))
* resolve race conditions and improve error handling across components ([024a271](https://github.com/danielscholl/agent-base-v2/commit/024a271f0646bfd2b40678b4b6d124a6da97ea72))
* **review:** address PR review comments ([3951a04](https://github.com/danielscholl/agent-base-v2/commit/3951a043c7887e88a5ab5f54ddeecad31a81c681))
* **review:** address PR review comments ([e1af56f](https://github.com/danielscholl/agent-base-v2/commit/e1af56fbed5f480c893e43e94aa2060c6aed6adc))
* **review:** address PR review comments ([b835713](https://github.com/danielscholl/agent-base-v2/commit/b835713a78284c720861589ee77b0bd81b8c0139))
* **review:** address PR review comments ([83714bd](https://github.com/danielscholl/agent-base-v2/commit/83714bd51c75e3bb2a0d5eddb7d3a499a396d572))
* **review:** address PR review comments ([f14a2e3](https://github.com/danielscholl/agent-base-v2/commit/f14a2e38235fe345aa708a3e2fad6649141c3dea))
* **review:** address PR review comments ([5d0719c](https://github.com/danielscholl/agent-base-v2/commit/5d0719c48778d10f7c4732cdfa9e122d9cb5db0d))
* **review:** address PR review comments from Copilot ([a748dd1](https://github.com/danielscholl/agent-base-v2/commit/a748dd127a50d22283aceac6082c8d1cc8ec8000))
* **security:** replace Math.random with crypto.randomBytes ([3b59639](https://github.com/danielscholl/agent-base-v2/commit/3b59639774b1c96a02d8a0aed0559af2f5338523))
* **skills:** address PR review comments from Copilot ([a0f9f3d](https://github.com/danielscholl/agent-base-v2/commit/a0f9f3d3a328e34fe6f8a578968169a6f6c73414))
* **telemetry:** correct OTLP endpoint reachability check ([dcd398e](https://github.com/danielscholl/agent-base-v2/commit/dcd398e7c71596d8f43dd8c9783868660f8cbb90))
* **telemetry:** improve gRPC endpoint detection using URL parsing ([6939981](https://github.com/danielscholl/agent-base-v2/commit/6939981460fa5bd9165885ca6757ed1959e651ab))
* **test:** add passWithNoTests flag to coverage script ([b3ce5f4](https://github.com/danielscholl/agent-base-v2/commit/b3ce5f445174d4dafca13a05629c2339b23a6494))
* **test:** update InteractiveShell mock to match resolveModelName signature ([c24a4f1](https://github.com/danielscholl/agent-base-v2/commit/c24a4f11bcd70d7f55ac38df5c4cd5b95e41323b))
* **tools:** add type safety comment for template literal usage ([299816d](https://github.com/danielscholl/agent-base-v2/commit/299816d83d459f0c4e4dc44415464306a3508577))
* **webfetch:** add additional script tag sanitization in HTML processing ([915d8dd](https://github.com/danielscholl/agent-base-v2/commit/915d8dd6466f0549ef39b75bf5bb910977f9feae))
* **webfetch:** add final script tag verification in HTML sanitization ([bd625c7](https://github.com/danielscholl/agent-base-v2/commit/bd625c7be52cc6212816fe6b7b8d1e882dc8dbe0))
* **webfetch:** enhance HTML sanitization with improved script removal ([f7a7b61](https://github.com/danielscholl/agent-base-v2/commit/f7a7b616fbe4e4e28f32391afac9ee17cdc5b426))
* **webfetch:** replace regex loops with while loops for static analysis ([a5c20e5](https://github.com/danielscholl/agent-base-v2/commit/a5c20e51d412a337120c7e038c8efddcf9dc6793))
* **workspace:** harden workspace root against symlink escapes ([383afb6](https://github.com/danielscholl/agent-base-v2/commit/383afb6e332c0c0be98daec29f96401dfb6fdba7))


### Documentation

* add Archon AI-assisted development workflow ([8cc5102](https://github.com/danielscholl/agent-base-v2/commit/8cc5102a9c4278c6bde67b8c34430ee31a6f8d89))
* add reference guides and update CLAUDE.md structure ([8a28265](https://github.com/danielscholl/agent-base-v2/commit/8a2826553e5f590deac124afcf27dba5618c597b))
* add typed callbacks specification and git hooks documentation ([af77bd0](https://github.com/danielscholl/agent-base-v2/commit/af77bd0e9a0d291fc9ba2f94deed2db9acc0055f))
* add typed callbacks specification and git hooks documentation ([61b8dcc](https://github.com/danielscholl/agent-base-v2/commit/61b8dcc1ac5ace687f38b7e62f3c40844a2eac8d))
* **architecture:** add comprehensive model layer and provider system documentation ([62f9127](https://github.com/danielscholl/agent-base-v2/commit/62f91273eeb6a05d6cc2bfb807b79e488aa95470))
* **architecture:** add deep dive and diagrams for providers folder ([12ca0ee](https://github.com/danielscholl/agent-base-v2/commit/12ca0ee65321a6d5459a49cbdd54dba7f48e889d))
* **architecture:** add status banners and source-of-truth notes ([487b3dc](https://github.com/danielscholl/agent-base-v2/commit/487b3dc25b20a8b2e294a67b08d5b977cf0abb4a))
* **architecture:** add system architecture document ([f7c0b67](https://github.com/danielscholl/agent-base-v2/commit/f7c0b67d241ee337798ddd4fa22485b85e897f28))
* **architecture:** align architecture documentation with implementation ([a0acb8d](https://github.com/danielscholl/agent-base-v2/commit/a0acb8db30c54c196f7fa78747770386b8a211c6))
* **architecture:** refactor into multi-file structure ([552011f](https://github.com/danielscholl/agent-base-v2/commit/552011f8ade84320c9cb018d28c6cb425f6d7022))
* **architecture:** reflect extended skills, extension points, file layout, and telemetry ([5e7de7d](https://github.com/danielscholl/agent-base-v2/commit/5e7de7dcebc42789da00bb3ce17912bb22b3023f))
* **architecture:** update architecture docs with revised error handling ([5e7de7d](https://github.com/danielscholl/agent-base-v2/commit/5e7de7dcebc42789da00bb3ce17912bb22b3023f))
* **arch:** update architecture docs for error handling and telemetry ([44b3ff1](https://github.com/danielscholl/agent-base-v2/commit/44b3ff1b8434f326077dd14390852cffd1837af0))
* **arch:** update architecture docs for function calling and telemetry ([e5400f8](https://github.com/danielscholl/agent-base-v2/commit/e5400f89207d5fd213e8793e4b081f55d4d6d848))
* **cli:** remove examples section from help text ([29c342f](https://github.com/danielscholl/agent-base-v2/commit/29c342f336b09cc2247cd13f354c5b0ac675bb0b))
* **cli:** remove examples section from help text ([98f7258](https://github.com/danielscholl/agent-base-v2/commit/98f725828e21b31e0891cd33f67527fbf767a9ff))
* **config:** clarify API key validation behavior for enterprise setups ([781208c](https://github.com/danielscholl/agent-base-v2/commit/781208c17f9e7419150181379ec1fe0491f6c5d1))
* **contrib:** enhance AI development workflow documentation ([1e4f0b9](https://github.com/danielscholl/agent-base-v2/commit/1e4f0b9a5c3783ae826bcacbd88b5395f9487472))
* document executionResult support for onToolEnd in AgentCallbacks ([93af08f](https://github.com/danielscholl/agent-base-v2/commit/93af08fa1f9913b447bf2331e2b8f8ad67dd4a07))
* enhance API documentation with parameter details and examples ([7c38db1](https://github.com/danielscholl/agent-base-v2/commit/7c38db123282c90f11b1fdd80ebe1eb270e3456f))
* **errors:** clarify agent error handling docs and types ([c8ce078](https://github.com/danielscholl/agent-base-v2/commit/c8ce078692cbb9eb01f3ffc4278ac62f5c4a46ec))
* improve documentation and code comments for memory system ([2b9e4f7](https://github.com/danielscholl/agent-base-v2/commit/2b9e4f7e18efeb2f71d6f8e1ec08839c3159b5d0))
* **installation:** simplify installation instructions and remove Windows CMD section ([cbf2422](https://github.com/danielscholl/agent-base-v2/commit/cbf242217d653bedeb42e1bf45212420356636e1))
* **prompts:** remove sections directory from prompts guide ([1b32057](https://github.com/danielscholl/agent-base-v2/commit/1b3205786d13f55f10fd479dea27cbaaee48c513))
* **readme:** update quick start with install flag and new steps ([f278e27](https://github.com/danielscholl/agent-base-v2/commit/f278e27c0e36773f3a9734195b47bfae009098fb))
* **readme:** update quick start with install improvements ([0cee5ed](https://github.com/danielscholl/agent-base-v2/commit/0cee5edd9bc500afa7fb455b91f6b1a71a75e5d8))
* update O1 model references and remove environment template ([6810967](https://github.com/danielscholl/agent-base-v2/commit/68109671ff5a6f916662e5c2968f856ab23acadf))
* **webfetch:** add LGTM security annotations for HTML sanitization ([4c46a67](https://github.com/danielscholl/agent-base-v2/commit/4c46a678a643b5d893c132dace5ddeab51d6b31d))


### Code Refactoring

* **agent:** remove unused token usage tracking and improve memory status display ([4d097d6](https://github.com/danielscholl/agent-base-v2/commit/4d097d6ed9499436ce5515ca71fa91fd7f017a7c))
* **cli:** remove access check and unused imports in update command ([11aa76d](https://github.com/danielscholl/agent-base-v2/commit/11aa76d91dbd349d32ed7505a1df3d98b534ed2f))
* **config:** migrate configuration format from JSON to YAML ([2149c79](https://github.com/danielscholl/agent-base-v2/commit/2149c79030726837c8f367b7c3b1ca3e3f6579d2))
* **config:** simplify config command - edit opens system editor ([44f278f](https://github.com/danielscholl/agent-base-v2/commit/44f278f92b54312ef05831cd463498b396181deb))
* **filesystem:** eliminate TOCTOU race conditions in file operations ([863ee63](https://github.com/danielscholl/agent-base-v2/commit/863ee63e8b688fd9a80645aaf9da96495fcf7216))
* improve filesystem config sync and add TOCTOU documentation ([e8ddc02](https://github.com/danielscholl/agent-base-v2/commit/e8ddc020dabe83968e3dbfc6857fc88f226935c0))
* **prompts:** remove legacy system.md fallback ([bafd2db](https://github.com/danielscholl/agent-base-v2/commit/bafd2dbc41b98f0dc62bb7d3ea221c650ffd7119))
* **prompts:** switch package default from system.md to base.md ([aed90f5](https://github.com/danielscholl/agent-base-v2/commit/aed90f53a1793e39fe1d6cd84700f341cc81c50a))
* replace Math.random() with crypto.randomUUID() for ID generation ([befb63f](https://github.com/danielscholl/agent-base-v2/commit/befb63fc8033dde01fc58da0b48783c68119578f))
* **SinglePrompt:** remove toolNodes prop, rely on phases ([c246224](https://github.com/danielscholl/agent-base-v2/commit/c246224d3cfb9dc241b38eca345c4418927b9ee9))
* **test:** replace manual type guards with utility functions ([dcf5051](https://github.com/danielscholl/agent-base-v2/commit/dcf505171e68002df5ae902e2652ae3a7affdb91))
* **tools:** align tool definitions with new Tool.define API ([b505ac7](https://github.com/danielscholl/agent-base-v2/commit/b505ac7007c90de7d66385ffa5fd6d57d5dd22c0))
* **tools:** remove isSuccessResponse and isErrorResponse guards ([f0c1743](https://github.com/danielscholl/agent-base-v2/commit/f0c1743534ea28aa077bc74be8186bbe3887b3fc))
* **tools:** remove legacy tool patterns and hello tool scaffolding ([42eb9d2](https://github.com/danielscholl/agent-base-v2/commit/42eb9d20af761bda610050eeda5e084cbd4f33cd))
* **tools:** remove legacy tool patterns and hello tool scaffolding ([cea1332](https://github.com/danielscholl/agent-base-v2/commit/cea1332064499cd52d69b432fbd39bd15115f1cc))
* **tools:** return structured errors instead of throwing ([add3ac1](https://github.com/danielscholl/agent-base-v2/commit/add3ac1195c742998a563a632177a3147e059989))
* **tools:** strengthen error handling across tools ([9247deb](https://github.com/danielscholl/agent-base-v2/commit/9247deb8a94020c358157d03577ccf853746e7f1))
* **ui:** extract session restore logic and improve navigation ([e2a7c46](https://github.com/danielscholl/agent-base-v2/commit/e2a7c4684b553f9779b6875bb2ee6cb154acd9b6))
* **utils:** extract resolveModelName to shared utility ([aab0ccc](https://github.com/danielscholl/agent-base-v2/commit/aab0cccfa4cb1e864d0cb9706ea9e3304132e6a9))
* **webfetch:** extract dangerous element removal into separate function ([c17621a](https://github.com/danielscholl/agent-base-v2/commit/c17621a97a82d1ff4efb234d241cd0f121d252ea))
* **webfetch:** improve HTML entity decoding and tag removal ([10d1b5a](https://github.com/danielscholl/agent-base-v2/commit/10d1b5a0f6beab694b10d22cbc080b06c953c066))


### Tests

* add Jest setup file for test environment cleanup ([9f8f385](https://github.com/danielscholl/agent-base-v2/commit/9f8f385157d2402c57083f47e37eefeccee1cd0d))
* **bash:** add timeout configuration for abort signal tests ([fe1526e](https://github.com/danielscholl/agent-base-v2/commit/fe1526e6269e49f6907588c98d861effea09d115))
* **cli:** increase waitForRender timeout to 100ms for CI environments ([9fd4714](https://github.com/danielscholl/agent-base-v2/commit/9fd471426cefae33518655f1909576890c2b8db9))
* **cli:** isolate CLI tests with module mocks ([b3a79b2](https://github.com/danielscholl/agent-base-v2/commit/b3a79b2a1596f78f48882fbb7db1ba42257a979f))
* **cli:** refactor tests to render CLI output without mocks ([54c7591](https://github.com/danielscholl/agent-base-v2/commit/54c759192902ce2f51f05ee2460de3201963d2de))
* **cli:** replace waitForRender with content polling in tests ([cf17c42](https://github.com/danielscholl/agent-base-v2/commit/cf17c4259139c3cb03ea53439fde04d7de0eafaa))
* **config:** add GitHub provider environment detection and OAuth token tests ([ef33be9](https://github.com/danielscholl/agent-base-v2/commit/ef33be9004dd551de9a27d350157454e048b3093))
* **config:** add tests for loadConfigFromFiles YAML parsing and defaults ([379d300](https://github.com/danielscholl/agent-base-v2/commit/379d30042b84bfcba52c8ee6ad5a4c8c8be6146a))
* **installer:** add comprehensive installer tests and mocks ([7b39051](https://github.com/danielscholl/agent-base-v2/commit/7b39051e002ca7e4ef534a84dd359cee5ba64c7b))
* **llm:** add stream error handling and retry disabled tests ([a4daab9](https://github.com/danielscholl/agent-base-v2/commit/a4daab955961129ec5493d1c4f9a9b24f6d65784))
* **shell:** add error state timing verification to config init test ([4f79f95](https://github.com/danielscholl/agent-base-v2/commit/4f79f959ce9c8c8c7fce6a890967fe75d641e554))
* **tests:** add tests for executionResult-driven error handling ([7e94d3b](https://github.com/danielscholl/agent-base-v2/commit/7e94d3b7258e655a2926277e90a6eecb77d4135b))
* **tests:** replace fixed delays with polling in tests for stability ([933a586](https://github.com/danielscholl/agent-base-v2/commit/933a586a47ae9d1df9f2bc2e747bb8f5f6fbfbe0))
* **tests:** update gpt model expectations to gpt-5-mini ([e01521e](https://github.com/danielscholl/agent-base-v2/commit/e01521ed93bb737ebcba3435cc432c05f1381e80))
* **tools:** add comprehensive test suite for all tool implementations ([eff7387](https://github.com/danielscholl/agent-base-v2/commit/eff73878fe491c3c1cbf2665a1994af2f918657a))
* update tests for prompts and tool registry ([8a614c9](https://github.com/danielscholl/agent-base-v2/commit/8a614c9194917121d738eb770bb1c524c4c01ca8))


### Build System

* add husky and lint-staged for pre-commit hooks ([adf8bb6](https://github.com/danielscholl/agent-base-v2/commit/adf8bb660138f69afe9a6b09965e67881b75af3d))
* **cli:** add agent bin entry and update docs ([745ad68](https://github.com/danielscholl/agent-base-v2/commit/745ad684380498d8dfaecbe120909446d2513430))
* **deps:** upgrade all packages to align with tech stack targets ([629ec13](https://github.com/danielscholl/agent-base-v2/commit/629ec1395ab7d3bd9437a688ffb1fb2c26c0205f))
* **deps:** upgrade to Node 24 LTS with Bun 1.3.4 ([4bbcc1c](https://github.com/danielscholl/agent-base-v2/commit/4bbcc1c962ce109cc171f2ff7fa6fcae19691aa8))
* **deps:** upgrade to Node 24 LTS with Bun 1.3.4 ([8cefdc0](https://github.com/danielscholl/agent-base-v2/commit/8cefdc0c768d025145b9875eaea9a85997799b3b))
* **release:** simplify GitHub release artifact creation ([e4a35bc](https://github.com/danielscholl/agent-base-v2/commit/e4a35bc0dcd2f594096edd9b9f400a5a7042dd3e))


### Continuous Integration

* add GitHub workflows for validation and releases ([a421c64](https://github.com/danielscholl/agent-base-v2/commit/a421c645be20e2ae5691b233532334fda78126ee))
* optimize GitHub workflows and CodeQL configuration ([eeeb6c4](https://github.com/danielscholl/agent-base-v2/commit/eeeb6c4199fc419427ed955de119ea85651c0681))
* **security:** update CodeQL action to v4 and improve SBOM generation ([fb9c6ee](https://github.com/danielscholl/agent-base-v2/commit/fb9c6ee3ab82693215db355fc9b5d8a5ce68d5bd))
* update bun version from 1.1 to 1.2 in test matrix ([387dc2d](https://github.com/danielscholl/agent-base-v2/commit/387dc2dc92b73ed33473e1854e67025df600ded8))


### Miscellaneous

* **bun.lock:** update bun.lock to reflect new dependency versions ([c11a839](https://github.com/danielscholl/agent-base-v2/commit/c11a8392314a70c84e031690f27173765e400611))
* **cli:** increase DEFAULT_MAX_ITERATIONS to 50 ([32159b3](https://github.com/danielscholl/agent-base-v2/commit/32159b337d7a8d8e57bbaa67ec589cf1a90244a0))
* **docs:** remove outdated TypeScript rewrite feature specs and plans ([54d38e9](https://github.com/danielscholl/agent-base-v2/commit/54d38e9883cf5f3e277bbed23a58c5e8be94c649))
* increase iteration limit to 50 and clean up help text ([d96d19d](https://github.com/danielscholl/agent-base-v2/commit/d96d19d39828212a693ed4ba9d4df68beb0b594d))
* **jest:** lower branch coverage for src/tools/**/*.ts ([0baf492](https://github.com/danielscholl/agent-base-v2/commit/0baf492fb772fec80c96975dbd8f99b86b38e79b))
* **lockfile:** update bun.lock by removing configVersion ([ed64f12](https://github.com/danielscholl/agent-base-v2/commit/ed64f1290874c5aaea1ab94e46343374a50a2a58))
* **main:** release agent-base-v2 0.2.0 ([970d4ba](https://github.com/danielscholl/agent-base-v2/commit/970d4ba6e1245e90c43a467668659c4c7979a36d))
* **main:** release agent-base-v2 0.2.0 ([36d88b6](https://github.com/danielscholl/agent-base-v2/commit/36d88b65d04cbfcdc579db34e4d872dd92a81ce4))
* **main:** release agent-base-v2 0.2.1 ([fbe05ac](https://github.com/danielscholl/agent-base-v2/commit/fbe05acede9de41c81f628ab42759daec77bcdd8))
* **main:** release agent-base-v2 0.2.1 ([f74951a](https://github.com/danielscholl/agent-base-v2/commit/f74951a97534c94695db74bc49bfb22e660b26b5))
* **main:** release agent-base-v2 0.2.2 ([a5b5c27](https://github.com/danielscholl/agent-base-v2/commit/a5b5c27e5d8fdcf087d409b976cef60b92f2e7ac))
* **main:** release agent-base-v2 0.2.2 ([7391108](https://github.com/danielscholl/agent-base-v2/commit/7391108f6c396ed47b60fbac08dd8119f143801b))
* **shell:** add placeholder for resume session in InteractiveShell ([9d2dbb0](https://github.com/danielscholl/agent-base-v2/commit/9d2dbb0472426dabc15ab42269679704aefeea49))
* **test:** adjust coverage thresholds for Jest 30 compatibility ([0044ac8](https://github.com/danielscholl/agent-base-v2/commit/0044ac8626b51b05a5610bfcdc71377dd0ac6db9))
* trigger CI re-run ([6866921](https://github.com/danielscholl/agent-base-v2/commit/68669217c4603b5e98be7fbc5d5ed0cbf07961b0))
* update bun.lock ([3a81fb7](https://github.com/danielscholl/agent-base-v2/commit/3a81fb70780a9cccb4d9e91480e020e937bc205c))

## [0.2.2](https://github.com/danielscholl/agent-base-v2/compare/agent-base-v2-v0.2.1...agent-base-v2-v0.2.2) (2026-01-05)


### Features

* **installer:** add hybrid installation with pre-built binaries ([b0bfa6f](https://github.com/danielscholl/agent-base-v2/commit/b0bfa6fb3409a95ff4f8af9662d7929933be5525))
* **installer:** add hybrid installer with binary-first fallback ([508a9b5](https://github.com/danielscholl/agent-base-v2/commit/508a9b5e24af6f63c1cb6de1d848647076e5e971))
* **installer:** implement hybrid source/binary packaging ([636fd96](https://github.com/danielscholl/agent-base-v2/commit/636fd9686b5201ab1b5a5da459c2b786960693fc))


### Bug Fixes

* **config:** exclude scripts from typecheck and eslint ([778aa24](https://github.com/danielscholl/agent-base-v2/commit/778aa2492b771e20d6d9932c23f4606d4ac3c002))
* **install:** address remaining review findings ([5d37c53](https://github.com/danielscholl/agent-base-v2/commit/5d37c53fd5a9722bc587b313bb4615395886cf4b))
* **install:** copy assets alongside agent.exe on Windows ([0df3433](https://github.com/danielscholl/agent-base-v2/commit/0df343369056d2bfa7f6a3709ba8cf5f8e909fcf))
* **review:** address PR review comments from Copilot ([a748dd1](https://github.com/danielscholl/agent-base-v2/commit/a748dd127a50d22283aceac6082c8d1cc8ec8000))

## [0.2.1](https://github.com/danielscholl/agent-base-v2/compare/agent-base-v2-v0.2.0...agent-base-v2-v0.2.1) (2026-01-05)


### Documentation

* **prompts:** remove sections directory from prompts guide ([1b32057](https://github.com/danielscholl/agent-base-v2/commit/1b3205786d13f55f10fd479dea27cbaaee48c513))
* **readme:** update quick start with install flag and new steps ([f278e27](https://github.com/danielscholl/agent-base-v2/commit/f278e27c0e36773f3a9734195b47bfae009098fb))
* **readme:** update quick start with install improvements ([0cee5ed](https://github.com/danielscholl/agent-base-v2/commit/0cee5edd9bc500afa7fb455b91f6b1a71a75e5d8))


### Code Refactoring

* **prompts:** remove legacy system.md fallback ([bafd2db](https://github.com/danielscholl/agent-base-v2/commit/bafd2dbc41b98f0dc62bb7d3ea221c650ffd7119))
* **prompts:** switch package default from system.md to base.md ([aed90f5](https://github.com/danielscholl/agent-base-v2/commit/aed90f53a1793e39fe1d6cd84700f341cc81c50a))


### Build System

* **cli:** add agent bin entry and update docs ([745ad68](https://github.com/danielscholl/agent-base-v2/commit/745ad684380498d8dfaecbe120909446d2513430))

## [0.2.0](https://github.com/danielscholl/agent-base-v2/compare/agent-base-v2-v0.1.0...agent-base-v2-v0.2.0) (2026-01-05)


### ⚠ BREAKING CHANGES

* **tools:** createTool(), successResponse(), errorResponse(), and wrapWithToolResponse() exports removed from tools/index.ts

### Features

* add GitHub and GitLab CLI bundled skills ([095b0ea](https://github.com/danielscholl/agent-base-v2/commit/095b0ea8d4835f6be1d601e1a8f5af80a56c9df9))
* add GitHub and GitLab CLI bundled skills ([62ee87d](https://github.com/danielscholl/agent-base-v2/commit/62ee87da581e25e5d62c97d9015d6b91d6eedcee))
* **agent:** add debug callback support for git command failures ([5381e26](https://github.com/danielscholl/agent-base-v2/commit/5381e26c09e897c78b0003ffb10e775c7e2cd48f))
* **agent:** add useToolRegistry option with legacy mode ([7309157](https://github.com/danielscholl/agent-base-v2/commit/7309157d2bfa0e359f8707a23417dd0d25ce6cff))
* **agent:** detect LLM_ASSIST_REQUIRED from multiple formats ([46780e6](https://github.com/danielscholl/agent-base-v2/commit/46780e6d1066391fc2d86238e49b97dea671e333))
* **agent:** detect LLM_ASSIST_REQUIRED signals in tool output ([6ad5e0a](https://github.com/danielscholl/agent-base-v2/commit/6ad5e0aae69af7af2ff233df0bbb77f5874b3f6e))
* **agent:** enhance LLM assist parsing with multi-strategy approach ([70442aa](https://github.com/danielscholl/agent-base-v2/commit/70442aae75ccaa45d7c97968ef8130ab5a6e69ff))
* **agent:** implement core Agent orchestration loop ([d1ee9f8](https://github.com/danielscholl/agent-base-v2/commit/d1ee9f8f96d122b42ec458263f0cdeb92500a2fd))
* **agent:** implement core Agent orchestration with tool execution ([209c861](https://github.com/danielscholl/agent-base-v2/commit/209c86111b9e43c3bc5af64205035ef83616f6b3))
* **agent:** load tools from ToolRegistry and drop legacy tool injection ([6c8abff](https://github.com/danielscholl/agent-base-v2/commit/6c8abff09032ae6884323b281094d0dc041110ab))
* **cli:** add update command to manage agent updates ([0162584](https://github.com/danielscholl/agent-base-v2/commit/01625846481b9bcda47b6d8d17ec0885a118ddf9))
* **cli:** enhance cli help and add skill help ([58345ad](https://github.com/danielscholl/agent-base-v2/commit/58345ad6dcdb6557de98f7ef378a81252073538b))
* **cli:** enhance nested help and show subcommand for config ([8a863f0](https://github.com/danielscholl/agent-base-v2/commit/8a863f07ce0022e3a1ac7b088d28baec200482f2))
* **cli:** implement CLI subcommands and redesign health check display ([520ad50](https://github.com/danielscholl/agent-base-v2/commit/520ad50b649cfdfb6b93b54bb6cadc0f0a7a3768))
* **cli:** implement CLI subcommands and redesign health check display ([1524634](https://github.com/danielscholl/agent-base-v2/commit/152463470559795e5a7f4509ec22357a643f771b))
* **cli:** implement command autocomplete with telemetry integration ([8abf85f](https://github.com/danielscholl/agent-base-v2/commit/8abf85f5565a59f01e1db7c3ec29df20f9c67e3e))
* **cli:** implement comprehensive configuration and skill management commands ([db2631a](https://github.com/danielscholl/agent-base-v2/commit/db2631aa9f3898922f9ab39e2f875c0b7a08f666))
* **cli:** implement Ink CLI shell with interactive and single-prompt modes ([a9d6ba4](https://github.com/danielscholl/agent-base-v2/commit/a9d6ba429d0b23a5c0fe6daf5d49a1fa777afeb2))
* **cli:** implement ink-based CLI for agent with meow parsing ([f5ccfc2](https://github.com/danielscholl/agent-base-v2/commit/f5ccfc28ecaf50b93dab7df87810cc0f83590626))
* **cli:** implement input handling and command parsing system ([400a22d](https://github.com/danielscholl/agent-base-v2/commit/400a22d9f003491769f413af74ad8607ec092afa))
* **cli:** implement input handling and command parsing system ([6574b6a](https://github.com/danielscholl/agent-base-v2/commit/6574b6a0a7dda7c77fd9bc4b83e57a11bea570bc))
* **cli:** implement Phase 5 CLI completeness (Features 31-35) ([7cfa543](https://github.com/danielscholl/agent-base-v2/commit/7cfa543a8a9ed83291348e4ebb97f2da81caf0db))
* **components:** add React App component with test configuration ([8f6de47](https://github.com/danielscholl/agent-base-v2/commit/8f6de4709b8d340654a44d3f01de8091786e523a))
* **config:** add dirname method to IFileSystem interface ([b0685c3](https://github.com/danielscholl/agent-base-v2/commit/b0685c308f65119e536ccb76d21cad00f90b4299))
* **config:** add pluginsDir support for skills config persistence ([d90221e](https://github.com/danielscholl/agent-base-v2/commit/d90221e8dafbc6ed353da96fb7683de3b7cc673f))
* **config:** add provider validation and setup wizard integration ([676c1df](https://github.com/danielscholl/agent-base-v2/commit/676c1dfe2d1b71049e38e64c16e64d4bcb973458))
* **config:** add validation for retry delay configuration ([745e346](https://github.com/danielscholl/agent-base-v2/commit/745e3468b2c0867c589a00751bede277a8af4558))
* **config:** enhance provider configuration with comprehensive management system ([9071279](https://github.com/danielscholl/agent-base-v2/commit/90712794a3069279bce0036e54c76377c82754c6))
* **config:** enhance provider configuration with comprehensive management system ([66a59a5](https://github.com/danielscholl/agent-base-v2/commit/66a59a57d6f17fa5040dc44510b44b921dc94e7f))
* **config:** enhance provider setup with environment variable detection ([89ae1aa](https://github.com/danielscholl/agent-base-v2/commit/89ae1aac8d81f1b1a05d0f25d373880f23b52135))
* **config:** enhance provider validation and input handling ([332a4c3](https://github.com/danielscholl/agent-base-v2/commit/332a4c394e0204b780399f511aa03b2867e7e625))
* **config:** implement configuration schemas and manager ([d887182](https://github.com/danielscholl/agent-base-v2/commit/d887182e12a7ca64349d76462771ff5aea3cf43b))
* **config:** implement configuration schemas and manager with Zod validation ([17b3f4d](https://github.com/danielscholl/agent-base-v2/commit/17b3f4d74a6829379d096b62ac1b63e9fd0530ee))
* **config:** migrate config from json to yaml ([f10fea4](https://github.com/danielscholl/agent-base-v2/commit/f10fea45591ef84db49e2898d93800ffdd2bff8a))
* **config:** replace interactive field editing with system editor integration ([e40b293](https://github.com/danielscholl/agent-base-v2/commit/e40b293a68cae80843ec49412bd67c904abff5ef))
* **errors:** implement structured error types with provider metadata ([43f3a74](https://github.com/danielscholl/agent-base-v2/commit/43f3a74c247033f73696b0aba5a9e782d955d2e0))
* **errors:** implement structured error types with provider metadata ([6d2bdba](https://github.com/danielscholl/agent-base-v2/commit/6d2bdba918637e43183db869af8466e578fbeef4))
* **execution:** add multi-phase verbose execution tracking ([97bf7cd](https://github.com/danielscholl/agent-base-v2/commit/97bf7cda160ab69051faa57bbd64d4eadc74fd0f))
* **execution:** add multi-phase verbose execution tracking ([b560f5f](https://github.com/danielscholl/agent-base-v2/commit/b560f5f6bf414cceb6d195b82c5d901647edec25))
* **foundry:** implement Azure AI Foundry provider with local and cloud modes ([ae162a2](https://github.com/danielscholl/agent-base-v2/commit/ae162a2c49f6b074ee1638216495c26b9c1509c5))
* **hooks:** add commit-msg hook to block Claude co-authorship ([457dedf](https://github.com/danielscholl/agent-base-v2/commit/457dedf09d21384049e7ddbf1bdb6d2810157369))
* implement compositional prompt system with provider layers ([ffe620f](https://github.com/danielscholl/agent-base-v2/commit/ffe620fa43ff9c8bfdc1003c1751bf7d2160fb63))
* implement compositional prompt system with provider layers ([cc2d5d0](https://github.com/danielscholl/agent-base-v2/commit/cc2d5d05ed086be62e2e3c327ec69220d773b9d6))
* implement comprehensive test infrastructure and documentation ([742ec14](https://github.com/danielscholl/agent-base-v2/commit/742ec14bb8620b6afe6c52873f1b2b4324c4e9ea))
* implement local Docker Model Runner provider ([fb71fd4](https://github.com/danielscholl/agent-base-v2/commit/fb71fd408aaae8f6e03d276dcad45bfcdbc44a59))
* implement message history memory for multi-turn conversations ([3c50350](https://github.com/danielscholl/agent-base-v2/commit/3c50350a40187df0dbd97b717c069314603e80f1))
* implement message history memory for multi-turn conversations ([a377f7f](https://github.com/danielscholl/agent-base-v2/commit/a377f7fb0f23c85735f5854b2783db0fa8fa2159))
* implement token counting utilities with session tracking ([aee34af](https://github.com/danielscholl/agent-base-v2/commit/aee34af46f0ade4d88ebc5f15ec63e05e669a240))
* initialize Bun + TypeScript workspace with React/Ink setup ([57aa2f2](https://github.com/danielscholl/agent-base-v2/commit/57aa2f24259759d4bc97e73b75cdbdd052343171))
* initialize Bun + TypeScript workspace with React/Ink setup ([1200774](https://github.com/danielscholl/agent-base-v2/commit/120077429a2a00bdfa74055573f0131ec7fded87))
* **model:** add Anthropic, Gemini, and Azure OpenAI provider support ([17b2440](https://github.com/danielscholl/agent-base-v2/commit/17b2440b69dc2d99bc04388ba9c3a159862e11f5))
* **model:** add Anthropic, Gemini, and Azure OpenAI provider support ([5152c1d](https://github.com/danielscholl/agent-base-v2/commit/5152c1d1edc05be1bf0b2e2505dd13164a9287e5))
* **model:** add retry-after header support for rate limiting ([5c05483](https://github.com/danielscholl/agent-base-v2/commit/5c05483e0404aef9857491fe9e55011150ea2a35))
* **model:** enhance retry mechanism with HTTP-date support and comprehensive testing ([13b177d](https://github.com/danielscholl/agent-base-v2/commit/13b177d635be8d8d49b47f64a9b116c78c4b96ce))
* **model:** implement GitHub Models provider ([900cd53](https://github.com/danielscholl/agent-base-v2/commit/900cd534a214b6a001ce0fa20449a8b008d902f2))
* **model:** implement GitHub Models provider with OpenAI-compatible API ([7ccd6d1](https://github.com/danielscholl/agent-base-v2/commit/7ccd6d151c7b77da37436a694b2d0ddc00a554a5))
* **model:** implement multi-provider LLM abstraction with OpenAI support ([0903a2f](https://github.com/danielscholl/agent-base-v2/commit/0903a2fc4f22e762c07291436f19453de0bfe7ad))
* **model:** implement multi-provider LLM abstraction with OpenAI support ([e3ba58d](https://github.com/danielscholl/agent-base-v2/commit/e3ba58d7d97e429c32c5258773db8894670f603d))
* **model:** implement retry logic with exponential backoff ([df3b216](https://github.com/danielscholl/agent-base-v2/commit/df3b216186438ce6745bea8df45e7fe7454112ad))
* **model:** implement retry logic with exponential backoff ([04569df](https://github.com/danielscholl/agent-base-v2/commit/04569dfa8180b1618d7cd23e54e1846efabdb7cc))
* Phase 6 - Polish and Testing ([97f7591](https://github.com/danielscholl/agent-base-v2/commit/97f7591d3659e987d4f1715130d6ff374634848b))
* **plan:** add OpenTelemetry to Phase 1 foundation ([3e0d9b7](https://github.com/danielscholl/agent-base-v2/commit/3e0d9b7002feb782e73a3f3bf5d0a4770e87aa3c))
* **prompts:** add onDebug callback and warn on missing prompts ([61efda9](https://github.com/danielscholl/agent-base-v2/commit/61efda99126ae9d06b26e3eec3c69f614d6349a7))
* **prompts:** implement tiered prompt loading and per-agent tool ([e81b6d4](https://github.com/danielscholl/agent-base-v2/commit/e81b6d41594665b8c957c33250418e5d1d75a88a))
* **security:** add URL validation and domain allowlist to summarize tool ([ee1b0f0](https://github.com/danielscholl/agent-base-v2/commit/ee1b0f0d0e31d967fc757bf52c3212344c707266))
* **session:** implement interactive session selector for /resume command ([effff97](https://github.com/danielscholl/agent-base-v2/commit/effff97f3b19bc0e0b1e93946ebefb45234b49f1))
* **session:** implement session save/restore and history management ([7d41721](https://github.com/danielscholl/agent-base-v2/commit/7d417219ee802ba93959d8aeebda827b463e9be1))
* **session:** implement session save/restore and history management ([5e94df5](https://github.com/danielscholl/agent-base-v2/commit/5e94df536e50b4a51f70e74f20806ab144b6497b))
* **skills:** add plugin source support and legacy plugin defs ([31cd2fd](https://github.com/danielscholl/agent-base-v2/commit/31cd2fda2a4c74e71641a29e4ee42fb417dfdf36))
* **skills:** add plugin-based skill installer and plugin support ([0d1dab3](https://github.com/danielscholl/agent-base-v2/commit/0d1dab3a6866e18ced3b665a2c206e1718c9f7ce))
* **skills:** add pluginsDir and disabled flag for plugin management ([fb95971](https://github.com/danielscholl/agent-base-v2/commit/fb95971d4bdc3fc328ef9dfc1a56e44c2bbd7b52))
* **skills:** align skill commands with osdu-agent pattern ([71e4195](https://github.com/danielscholl/agent-base-v2/commit/71e4195e98fc276fd40e75c9358f096cbc403a24))
* **skills:** implement Agent Skills specification with progressive disclosure ([c3fef43](https://github.com/danielscholl/agent-base-v2/commit/c3fef43644f9111b59863aaf899266341a4baf41))
* **skills:** implement Agent Skills specification with progressive disclosure ([f17a6a6](https://github.com/danielscholl/agent-base-v2/commit/f17a6a6c5c34dba962a99d485624945e01f33cec))
* **skills:** loader supports includeDisabled and plugin status ([fb95971](https://github.com/danielscholl/agent-base-v2/commit/fb95971d4bdc3fc328ef9dfc1a56e44c2bbd7b52))
* **skills:** refine skill install flow and description handling ([dd29b49](https://github.com/danielscholl/agent-base-v2/commit/dd29b494b5bd7479e31cbe2793652d8737ad164f))
* **skills:** support legacy plugins by deriving name from URL ([c26e92f](https://github.com/danielscholl/agent-base-v2/commit/c26e92f71e34b98ce7001ddcd8a0243b850efa3a))
* **skills:** validate git url/ref and switch to execFile ([fb95971](https://github.com/danielscholl/agent-base-v2/commit/fb95971d4bdc3fc328ef9dfc1a56e44c2bbd7b52))
* **skills:** validate skill names to prevent path traversal ([13b15fb](https://github.com/danielscholl/agent-base-v2/commit/13b15fb7c6146cdadb0a0df0ed1bcdf22309a0ae))
* **telemetry:** add gRPC exporter support and callback telemetry wrapper ([01632d7](https://github.com/danielscholl/agent-base-v2/commit/01632d76f74ed6ef15a5d63e1a18c0a2284f6182))
* **telemetry:** fix span hierarchy and add gRPC exporter support ([ba04e8b](https://github.com/danielscholl/agent-base-v2/commit/ba04e8b3937b4c6cd03c6d32c92c71a5f61698f4))
* **telemetry:** implement Aspire Dashboard Docker container management ([252f878](https://github.com/danielscholl/agent-base-v2/commit/252f878b7110558958abfaca751efef7d644debf))
* **telemetry:** implement Aspire Dashboard integration ([1bef734](https://github.com/danielscholl/agent-base-v2/commit/1bef734204160fe95f3ccaa867d40ac17b629a94))
* **telemetry:** implement GenAI semantic conventions for spans ([9b15af5](https://github.com/danielscholl/agent-base-v2/commit/9b15af5bbcabe86ce7d109bb29f51d1b9546a0dc))
* **telemetry:** implement GenAI semantic conventions for spans ([dbb3a82](https://github.com/danielscholl/agent-base-v2/commit/dbb3a82cf5d2c52fed36ea59c0487447ed02fab3))
* **telemetry:** implement OpenTelemetry setup with OTLP exporter ([4eca0c6](https://github.com/danielscholl/agent-base-v2/commit/4eca0c6bb2fa0de4f8acf7be7de62be27ddb5cc4))
* **telemetry:** implement OpenTelemetry setup with OTLP exporter ([b7330a9](https://github.com/danielscholl/agent-base-v2/commit/b7330a9ba3f0619723e451181e814c721966e871))
* **tokens:** implement session token usage tracking and display ([1a2f19a](https://github.com/danielscholl/agent-base-v2/commit/1a2f19a219d73cac57f6d7a1270ebe11a3c5ad55))
* **tool:** extend onToolEnd to receive executionResult ([5249133](https://github.com/danielscholl/agent-base-v2/commit/52491338d82ab52454d0a1e9a0d176a68c8e0f5f))
* **tools:** implement filesystem tools with workspace sandboxing ([d126abe](https://github.com/danielscholl/agent-base-v2/commit/d126abeb85cecd493838da8de2f60d36fe57cdf8))
* **tools:** implement filesystem tools with workspace sandboxing ([eb81720](https://github.com/danielscholl/agent-base-v2/commit/eb81720b2850d9618ee8d5d7abdbf2942838dc6c))
* **tools:** implement hello world and greet user tools ([ee34db6](https://github.com/danielscholl/agent-base-v2/commit/ee34db660038294d23a385b94cf61cb799b10964))
* **tools:** implement hello world and greet user tools ([0e8c75a](https://github.com/danielscholl/agent-base-v2/commit/0e8c75aae2b2a4ba03242187d23e3fde833a7ef9))
* **tools:** implement LangChain tool wrapper with response contract ([a4359ba](https://github.com/danielscholl/agent-base-v2/commit/a4359ba76e592ba66a04b3fa9170e0396ab79844))
* **tools:** implement LangChain tool wrapper with response contract ([6e00cef](https://github.com/danielscholl/agent-base-v2/commit/6e00cef0ff06bc0f1cd52cb176b0200be0aa55cc))
* **tools:** implement OpenCode-style tool system with registry and new tools ([0f43e98](https://github.com/danielscholl/agent-base-v2/commit/0f43e983ab0e719607f9eb8eda4c8af6bd5a23bc))
* **ui:** enhance header with context information and styling ([9a0e24e](https://github.com/danielscholl/agent-base-v2/commit/9a0e24e86adbe8a41c16171d86b4c40cd8728f69))
* **ui:** implement execution status visualization with tree display ([581d760](https://github.com/danielscholl/agent-base-v2/commit/581d760428a1e84b19040d77f6295c4f8b93baa6))
* **ui:** implement execution status visualization with tree display ([9d49f9f](https://github.com/danielscholl/agent-base-v2/commit/9d49f9f7b47ba1cfdd92225b5e032711a756bc9b))
* **ui:** implement terminal display components for agent feedback ([6805618](https://github.com/danielscholl/agent-base-v2/commit/6805618b8326c03f0bd9db32dabc38e2129376a2))
* **ui:** implement terminal display components for agent feedback ([ec5a42e](https://github.com/danielscholl/agent-base-v2/commit/ec5a42e8c8a6b30c09933f28eb08ad6228eefff2))
* **utils:** implement token counting utilities with session tracking ([44dca43](https://github.com/danielscholl/agent-base-v2/commit/44dca43ba75406de0f624ea8de45d501a03813a7))
* **utils:** implement tool context persistence with filesystem storage ([c042131](https://github.com/danielscholl/agent-base-v2/commit/c042131bae8b9fa01165e8977010317c2e066879))
* **utils:** implement tool context persistence with filesystem storage ([032d1df](https://github.com/danielscholl/agent-base-v2/commit/032d1df484f028a475518f5e77bdd3baa3a71d44))
* UX improvements for session management and verbose mode ([740e2b6](https://github.com/danielscholl/agent-base-v2/commit/740e2b62755a1205953fc9eee0640083e8af5fb2))
* **workspace:** add initializeWorkspaceRoot to resolve workspace root ([5160ddb](https://github.com/danielscholl/agent-base-v2/commit/5160ddbc21746d073339549c5ae03ef678f112f1))
* **workspace:** async, symlink-safe workspace root resolution ([97d46cb](https://github.com/danielscholl/agent-base-v2/commit/97d46cb6edbe75ed72dae6c83166b7a0e420f82d))


### Bug Fixes

* **agent:** add type-safe error code mapping for model errors ([4f1e8c8](https://github.com/danielscholl/agent-base-v2/commit/4f1e8c8628fe8c5d0f196c905fe046ff37edf898))
* **agent:** resolve wiring bugs and harden workspace security ([92717da](https://github.com/danielscholl/agent-base-v2/commit/92717da524d76e11855860943bea5761fac6c3eb))
* **agent:** unify tool result contract and remove legacy code ([cac0675](https://github.com/danielscholl/agent-base-v2/commit/cac06750a1c04609cc1468319866bc8676dd037f))
* align architecture docs with implementation ([f06dba9](https://github.com/danielscholl/agent-base-v2/commit/f06dba907ef523b24283691288d795324cd913a7))
* **build:** remove scripts from tsconfig include ([c93ab14](https://github.com/danielscholl/agent-base-v2/commit/c93ab140a5baac9c4266d2b865b0e7bba822c597))
* **ci:** fix issues in 7 files ([b6f27e2](https://github.com/danielscholl/agent-base-v2/commit/b6f27e2d861f05314bcba50d9056e7d786a1f682))
* **cli:** unify help styling and fix provider config detection ([575edfb](https://github.com/danielscholl/agent-base-v2/commit/575edfb44387dd11a2b7fc454bb51efd454cad61))
* **config:** improve endpoint validation using URL parsing ([729fc60](https://github.com/danielscholl/agent-base-v2/commit/729fc601e1112d01aa98e55fb3deb5ed5ebf24bb))
* **config:** improve YAML parse error handling in config loader ([262db29](https://github.com/danielscholl/agent-base-v2/commit/262db29f5a889dd2d189d52bce0fd10853f24ebc))
* **config:** robust YAMLParseError detection in ConfigManager ([3f10095](https://github.com/danielscholl/agent-base-v2/commit/3f10095fe90a5302a21c9cbb9f3157352bcf9dff))
* **config:** use YAMLParseError for YAML parse error checks ([b8180bd](https://github.com/danielscholl/agent-base-v2/commit/b8180bdf056d93b1025c99637bab244f46157dc6))
* **docs:** fix issues in 13 files ([97c8975](https://github.com/danielscholl/agent-base-v2/commit/97c8975fe619dea0c0da612ccb261cab475da585))
* **foundry:** improve validation for model initialization and API key ([81579ee](https://github.com/danielscholl/agent-base-v2/commit/81579eef101d8bb77ac39f57c975f1f16543c15f))
* **foundry:** validate apiKey requirement in cloud mode ([7046051](https://github.com/danielscholl/agent-base-v2/commit/70460512e44b0a85b52b7c177c83d1e3fc88a60a))
* improve telemetry and error signaling for tool execution ([0394ad9](https://github.com/danielscholl/agent-base-v2/commit/0394ad940de5dbdd5d39337731b7e9bcacbee39f))
* **installer:** restrict git URL validation to HTTPS only ([777ba65](https://github.com/danielscholl/agent-base-v2/commit/777ba6565d1d6dc7f657fbe4d3cc17bc397ba151))
* **model:** improve OpenAI client robustness and cross-platform compatibility ([1555e8b](https://github.com/danielscholl/agent-base-v2/commit/1555e8bc4bf51bd12c1061a0328696b86a97f8b2))
* resolve race conditions and improve error handling across components ([024a271](https://github.com/danielscholl/agent-base-v2/commit/024a271f0646bfd2b40678b4b6d124a6da97ea72))
* **review:** address PR review comments ([3951a04](https://github.com/danielscholl/agent-base-v2/commit/3951a043c7887e88a5ab5f54ddeecad31a81c681))
* **review:** address PR review comments ([e1af56f](https://github.com/danielscholl/agent-base-v2/commit/e1af56fbed5f480c893e43e94aa2060c6aed6adc))
* **review:** address PR review comments ([b835713](https://github.com/danielscholl/agent-base-v2/commit/b835713a78284c720861589ee77b0bd81b8c0139))
* **review:** address PR review comments ([83714bd](https://github.com/danielscholl/agent-base-v2/commit/83714bd51c75e3bb2a0d5eddb7d3a499a396d572))
* **review:** address PR review comments ([f14a2e3](https://github.com/danielscholl/agent-base-v2/commit/f14a2e38235fe345aa708a3e2fad6649141c3dea))
* **review:** address PR review comments ([5d0719c](https://github.com/danielscholl/agent-base-v2/commit/5d0719c48778d10f7c4732cdfa9e122d9cb5db0d))
* **security:** replace Math.random with crypto.randomBytes ([3b59639](https://github.com/danielscholl/agent-base-v2/commit/3b59639774b1c96a02d8a0aed0559af2f5338523))
* **skills:** address PR review comments from Copilot ([a0f9f3d](https://github.com/danielscholl/agent-base-v2/commit/a0f9f3d3a328e34fe6f8a578968169a6f6c73414))
* **telemetry:** correct OTLP endpoint reachability check ([dcd398e](https://github.com/danielscholl/agent-base-v2/commit/dcd398e7c71596d8f43dd8c9783868660f8cbb90))
* **telemetry:** improve gRPC endpoint detection using URL parsing ([6939981](https://github.com/danielscholl/agent-base-v2/commit/6939981460fa5bd9165885ca6757ed1959e651ab))
* **test:** add passWithNoTests flag to coverage script ([b3ce5f4](https://github.com/danielscholl/agent-base-v2/commit/b3ce5f445174d4dafca13a05629c2339b23a6494))
* **test:** update InteractiveShell mock to match resolveModelName signature ([c24a4f1](https://github.com/danielscholl/agent-base-v2/commit/c24a4f11bcd70d7f55ac38df5c4cd5b95e41323b))
* **tools:** add type safety comment for template literal usage ([299816d](https://github.com/danielscholl/agent-base-v2/commit/299816d83d459f0c4e4dc44415464306a3508577))
* **webfetch:** add additional script tag sanitization in HTML processing ([915d8dd](https://github.com/danielscholl/agent-base-v2/commit/915d8dd6466f0549ef39b75bf5bb910977f9feae))
* **webfetch:** add final script tag verification in HTML sanitization ([bd625c7](https://github.com/danielscholl/agent-base-v2/commit/bd625c7be52cc6212816fe6b7b8d1e882dc8dbe0))
* **webfetch:** enhance HTML sanitization with improved script removal ([f7a7b61](https://github.com/danielscholl/agent-base-v2/commit/f7a7b616fbe4e4e28f32391afac9ee17cdc5b426))
* **webfetch:** replace regex loops with while loops for static analysis ([a5c20e5](https://github.com/danielscholl/agent-base-v2/commit/a5c20e51d412a337120c7e038c8efddcf9dc6793))
* **workspace:** harden workspace root against symlink escapes ([383afb6](https://github.com/danielscholl/agent-base-v2/commit/383afb6e332c0c0be98daec29f96401dfb6fdba7))


### Documentation

* add Archon AI-assisted development workflow ([8cc5102](https://github.com/danielscholl/agent-base-v2/commit/8cc5102a9c4278c6bde67b8c34430ee31a6f8d89))
* add reference guides and update CLAUDE.md structure ([8a28265](https://github.com/danielscholl/agent-base-v2/commit/8a2826553e5f590deac124afcf27dba5618c597b))
* add typed callbacks specification and git hooks documentation ([af77bd0](https://github.com/danielscholl/agent-base-v2/commit/af77bd0e9a0d291fc9ba2f94deed2db9acc0055f))
* add typed callbacks specification and git hooks documentation ([61b8dcc](https://github.com/danielscholl/agent-base-v2/commit/61b8dcc1ac5ace687f38b7e62f3c40844a2eac8d))
* **architecture:** add comprehensive model layer and provider system documentation ([62f9127](https://github.com/danielscholl/agent-base-v2/commit/62f91273eeb6a05d6cc2bfb807b79e488aa95470))
* **architecture:** add deep dive and diagrams for providers folder ([12ca0ee](https://github.com/danielscholl/agent-base-v2/commit/12ca0ee65321a6d5459a49cbdd54dba7f48e889d))
* **architecture:** add status banners and source-of-truth notes ([487b3dc](https://github.com/danielscholl/agent-base-v2/commit/487b3dc25b20a8b2e294a67b08d5b977cf0abb4a))
* **architecture:** add system architecture document ([f7c0b67](https://github.com/danielscholl/agent-base-v2/commit/f7c0b67d241ee337798ddd4fa22485b85e897f28))
* **architecture:** align architecture documentation with implementation ([a0acb8d](https://github.com/danielscholl/agent-base-v2/commit/a0acb8db30c54c196f7fa78747770386b8a211c6))
* **architecture:** refactor into multi-file structure ([552011f](https://github.com/danielscholl/agent-base-v2/commit/552011f8ade84320c9cb018d28c6cb425f6d7022))
* **architecture:** reflect extended skills, extension points, file layout, and telemetry ([5e7de7d](https://github.com/danielscholl/agent-base-v2/commit/5e7de7dcebc42789da00bb3ce17912bb22b3023f))
* **architecture:** update architecture docs with revised error handling ([5e7de7d](https://github.com/danielscholl/agent-base-v2/commit/5e7de7dcebc42789da00bb3ce17912bb22b3023f))
* **arch:** update architecture docs for error handling and telemetry ([44b3ff1](https://github.com/danielscholl/agent-base-v2/commit/44b3ff1b8434f326077dd14390852cffd1837af0))
* **arch:** update architecture docs for function calling and telemetry ([e5400f8](https://github.com/danielscholl/agent-base-v2/commit/e5400f89207d5fd213e8793e4b081f55d4d6d848))
* **cli:** remove examples section from help text ([29c342f](https://github.com/danielscholl/agent-base-v2/commit/29c342f336b09cc2247cd13f354c5b0ac675bb0b))
* **cli:** remove examples section from help text ([98f7258](https://github.com/danielscholl/agent-base-v2/commit/98f725828e21b31e0891cd33f67527fbf767a9ff))
* **config:** clarify API key validation behavior for enterprise setups ([781208c](https://github.com/danielscholl/agent-base-v2/commit/781208c17f9e7419150181379ec1fe0491f6c5d1))
* **contrib:** enhance AI development workflow documentation ([1e4f0b9](https://github.com/danielscholl/agent-base-v2/commit/1e4f0b9a5c3783ae826bcacbd88b5395f9487472))
* document executionResult support for onToolEnd in AgentCallbacks ([93af08f](https://github.com/danielscholl/agent-base-v2/commit/93af08fa1f9913b447bf2331e2b8f8ad67dd4a07))
* enhance API documentation with parameter details and examples ([7c38db1](https://github.com/danielscholl/agent-base-v2/commit/7c38db123282c90f11b1fdd80ebe1eb270e3456f))
* **errors:** clarify agent error handling docs and types ([c8ce078](https://github.com/danielscholl/agent-base-v2/commit/c8ce078692cbb9eb01f3ffc4278ac62f5c4a46ec))
* improve documentation and code comments for memory system ([2b9e4f7](https://github.com/danielscholl/agent-base-v2/commit/2b9e4f7e18efeb2f71d6f8e1ec08839c3159b5d0))
* update O1 model references and remove environment template ([6810967](https://github.com/danielscholl/agent-base-v2/commit/68109671ff5a6f916662e5c2968f856ab23acadf))
* **webfetch:** add LGTM security annotations for HTML sanitization ([4c46a67](https://github.com/danielscholl/agent-base-v2/commit/4c46a678a643b5d893c132dace5ddeab51d6b31d))


### Code Refactoring

* **agent:** remove unused token usage tracking and improve memory status display ([4d097d6](https://github.com/danielscholl/agent-base-v2/commit/4d097d6ed9499436ce5515ca71fa91fd7f017a7c))
* **cli:** remove access check and unused imports in update command ([11aa76d](https://github.com/danielscholl/agent-base-v2/commit/11aa76d91dbd349d32ed7505a1df3d98b534ed2f))
* **config:** migrate configuration format from JSON to YAML ([2149c79](https://github.com/danielscholl/agent-base-v2/commit/2149c79030726837c8f367b7c3b1ca3e3f6579d2))
* **config:** simplify config command - edit opens system editor ([44f278f](https://github.com/danielscholl/agent-base-v2/commit/44f278f92b54312ef05831cd463498b396181deb))
* **filesystem:** eliminate TOCTOU race conditions in file operations ([863ee63](https://github.com/danielscholl/agent-base-v2/commit/863ee63e8b688fd9a80645aaf9da96495fcf7216))
* improve filesystem config sync and add TOCTOU documentation ([e8ddc02](https://github.com/danielscholl/agent-base-v2/commit/e8ddc020dabe83968e3dbfc6857fc88f226935c0))
* replace Math.random() with crypto.randomUUID() for ID generation ([befb63f](https://github.com/danielscholl/agent-base-v2/commit/befb63fc8033dde01fc58da0b48783c68119578f))
* **SinglePrompt:** remove toolNodes prop, rely on phases ([c246224](https://github.com/danielscholl/agent-base-v2/commit/c246224d3cfb9dc241b38eca345c4418927b9ee9))
* **test:** replace manual type guards with utility functions ([dcf5051](https://github.com/danielscholl/agent-base-v2/commit/dcf505171e68002df5ae902e2652ae3a7affdb91))
* **tools:** align tool definitions with new Tool.define API ([b505ac7](https://github.com/danielscholl/agent-base-v2/commit/b505ac7007c90de7d66385ffa5fd6d57d5dd22c0))
* **tools:** remove isSuccessResponse and isErrorResponse guards ([f0c1743](https://github.com/danielscholl/agent-base-v2/commit/f0c1743534ea28aa077bc74be8186bbe3887b3fc))
* **tools:** remove legacy tool patterns and hello tool scaffolding ([42eb9d2](https://github.com/danielscholl/agent-base-v2/commit/42eb9d20af761bda610050eeda5e084cbd4f33cd))
* **tools:** remove legacy tool patterns and hello tool scaffolding ([cea1332](https://github.com/danielscholl/agent-base-v2/commit/cea1332064499cd52d69b432fbd39bd15115f1cc))
* **tools:** return structured errors instead of throwing ([add3ac1](https://github.com/danielscholl/agent-base-v2/commit/add3ac1195c742998a563a632177a3147e059989))
* **tools:** strengthen error handling across tools ([9247deb](https://github.com/danielscholl/agent-base-v2/commit/9247deb8a94020c358157d03577ccf853746e7f1))
* **ui:** extract session restore logic and improve navigation ([e2a7c46](https://github.com/danielscholl/agent-base-v2/commit/e2a7c4684b553f9779b6875bb2ee6cb154acd9b6))
* **utils:** extract resolveModelName to shared utility ([aab0ccc](https://github.com/danielscholl/agent-base-v2/commit/aab0cccfa4cb1e864d0cb9706ea9e3304132e6a9))
* **webfetch:** extract dangerous element removal into separate function ([c17621a](https://github.com/danielscholl/agent-base-v2/commit/c17621a97a82d1ff4efb234d241cd0f121d252ea))
* **webfetch:** improve HTML entity decoding and tag removal ([10d1b5a](https://github.com/danielscholl/agent-base-v2/commit/10d1b5a0f6beab694b10d22cbc080b06c953c066))


### Tests

* add Jest setup file for test environment cleanup ([9f8f385](https://github.com/danielscholl/agent-base-v2/commit/9f8f385157d2402c57083f47e37eefeccee1cd0d))
* **bash:** add timeout configuration for abort signal tests ([fe1526e](https://github.com/danielscholl/agent-base-v2/commit/fe1526e6269e49f6907588c98d861effea09d115))
* **cli:** increase waitForRender timeout to 100ms for CI environments ([9fd4714](https://github.com/danielscholl/agent-base-v2/commit/9fd471426cefae33518655f1909576890c2b8db9))
* **cli:** isolate CLI tests with module mocks ([b3a79b2](https://github.com/danielscholl/agent-base-v2/commit/b3a79b2a1596f78f48882fbb7db1ba42257a979f))
* **cli:** refactor tests to render CLI output without mocks ([54c7591](https://github.com/danielscholl/agent-base-v2/commit/54c759192902ce2f51f05ee2460de3201963d2de))
* **cli:** replace waitForRender with content polling in tests ([cf17c42](https://github.com/danielscholl/agent-base-v2/commit/cf17c4259139c3cb03ea53439fde04d7de0eafaa))
* **config:** add GitHub provider environment detection and OAuth token tests ([ef33be9](https://github.com/danielscholl/agent-base-v2/commit/ef33be9004dd551de9a27d350157454e048b3093))
* **config:** add tests for loadConfigFromFiles YAML parsing and defaults ([379d300](https://github.com/danielscholl/agent-base-v2/commit/379d30042b84bfcba52c8ee6ad5a4c8c8be6146a))
* **installer:** add comprehensive installer tests and mocks ([7b39051](https://github.com/danielscholl/agent-base-v2/commit/7b39051e002ca7e4ef534a84dd359cee5ba64c7b))
* **llm:** add stream error handling and retry disabled tests ([a4daab9](https://github.com/danielscholl/agent-base-v2/commit/a4daab955961129ec5493d1c4f9a9b24f6d65784))
* **shell:** add error state timing verification to config init test ([4f79f95](https://github.com/danielscholl/agent-base-v2/commit/4f79f959ce9c8c8c7fce6a890967fe75d641e554))
* **tests:** add tests for executionResult-driven error handling ([7e94d3b](https://github.com/danielscholl/agent-base-v2/commit/7e94d3b7258e655a2926277e90a6eecb77d4135b))
* **tests:** replace fixed delays with polling in tests for stability ([933a586](https://github.com/danielscholl/agent-base-v2/commit/933a586a47ae9d1df9f2bc2e747bb8f5f6fbfbe0))
* **tests:** update gpt model expectations to gpt-5-mini ([e01521e](https://github.com/danielscholl/agent-base-v2/commit/e01521ed93bb737ebcba3435cc432c05f1381e80))
* **tools:** add comprehensive test suite for all tool implementations ([eff7387](https://github.com/danielscholl/agent-base-v2/commit/eff73878fe491c3c1cbf2665a1994af2f918657a))
* update tests for prompts and tool registry ([8a614c9](https://github.com/danielscholl/agent-base-v2/commit/8a614c9194917121d738eb770bb1c524c4c01ca8))


### Build System

* add husky and lint-staged for pre-commit hooks ([adf8bb6](https://github.com/danielscholl/agent-base-v2/commit/adf8bb660138f69afe9a6b09965e67881b75af3d))
* **deps:** upgrade all packages to align with tech stack targets ([629ec13](https://github.com/danielscholl/agent-base-v2/commit/629ec1395ab7d3bd9437a688ffb1fb2c26c0205f))
* **deps:** upgrade to Node 24 LTS with Bun 1.3.4 ([4bbcc1c](https://github.com/danielscholl/agent-base-v2/commit/4bbcc1c962ce109cc171f2ff7fa6fcae19691aa8))
* **deps:** upgrade to Node 24 LTS with Bun 1.3.4 ([8cefdc0](https://github.com/danielscholl/agent-base-v2/commit/8cefdc0c768d025145b9875eaea9a85997799b3b))
* **release:** simplify GitHub release artifact creation ([e4a35bc](https://github.com/danielscholl/agent-base-v2/commit/e4a35bc0dcd2f594096edd9b9f400a5a7042dd3e))


### Continuous Integration

* add GitHub workflows for validation and releases ([a421c64](https://github.com/danielscholl/agent-base-v2/commit/a421c645be20e2ae5691b233532334fda78126ee))
* optimize GitHub workflows and CodeQL configuration ([eeeb6c4](https://github.com/danielscholl/agent-base-v2/commit/eeeb6c4199fc419427ed955de119ea85651c0681))
* **security:** update CodeQL action to v4 and improve SBOM generation ([fb9c6ee](https://github.com/danielscholl/agent-base-v2/commit/fb9c6ee3ab82693215db355fc9b5d8a5ce68d5bd))
* update bun version from 1.1 to 1.2 in test matrix ([387dc2d](https://github.com/danielscholl/agent-base-v2/commit/387dc2dc92b73ed33473e1854e67025df600ded8))


### Miscellaneous

* **bun.lock:** update bun.lock to reflect new dependency versions ([c11a839](https://github.com/danielscholl/agent-base-v2/commit/c11a8392314a70c84e031690f27173765e400611))
* **cli:** increase DEFAULT_MAX_ITERATIONS to 50 ([32159b3](https://github.com/danielscholl/agent-base-v2/commit/32159b337d7a8d8e57bbaa67ec589cf1a90244a0))
* **docs:** remove outdated TypeScript rewrite feature specs and plans ([54d38e9](https://github.com/danielscholl/agent-base-v2/commit/54d38e9883cf5f3e277bbed23a58c5e8be94c649))
* increase iteration limit to 50 and clean up help text ([d96d19d](https://github.com/danielscholl/agent-base-v2/commit/d96d19d39828212a693ed4ba9d4df68beb0b594d))
* **jest:** lower branch coverage for src/tools/**/*.ts ([0baf492](https://github.com/danielscholl/agent-base-v2/commit/0baf492fb772fec80c96975dbd8f99b86b38e79b))
* **lockfile:** update bun.lock by removing configVersion ([ed64f12](https://github.com/danielscholl/agent-base-v2/commit/ed64f1290874c5aaea1ab94e46343374a50a2a58))
* **shell:** add placeholder for resume session in InteractiveShell ([9d2dbb0](https://github.com/danielscholl/agent-base-v2/commit/9d2dbb0472426dabc15ab42269679704aefeea49))
* **test:** adjust coverage thresholds for Jest 30 compatibility ([0044ac8](https://github.com/danielscholl/agent-base-v2/commit/0044ac8626b51b05a5610bfcdc71377dd0ac6db9))
* trigger CI re-run ([6866921](https://github.com/danielscholl/agent-base-v2/commit/68669217c4603b5e98be7fbc5d5ed0cbf07961b0))
