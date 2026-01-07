---
name: prime
description: Prime understanding of the codebase
argument-hint: "[folder] (optional)"
examples:
  - "/prime folder1"
  - "/prime"
---

<prime-command>
  <target>${1:-.}</target>

  <objective>
    Build a lightweight understanding of the target service/repository structure and conventions.
    Target defaults to current directory (.) if no folder argument provided.
    If target is "all", provide overview of all directories in workspace root.
  </objective>

  <constraints>
    <rule>MINIMIZE context usage - aim for under 20k tokens total</rule>
    <rule>DO NOT read source code files (.py, .ts, .js, etc.) - only list them</rule>
    <rule>DO NOT read test files - only note their existence</rule>
    <rule>DO NOT read agent definitions - only list available agents</rule>
    <rule>DO NOT launch subagents - this is a quick overview only</rule>
    <rule>ONLY read: README.md, config files (pyproject.toml, package.json), and CLAUDE.md</rule>
    <rule>SCOPE: Focus ONLY on the target directory (or workspace root if "all")</rule>
  </constraints>

  <phase number="1" name="structure-discovery">
    <step name="validate-target">
      <action>Verify target directory exists</action>
      <command>ls -la ${1:-.} (or ls -la . if target is "all")</command>
      <on-failure>Report that target directory was not found</on-failure>
    </step>

    <step name="file-listing">
      <action>Get file listing for target and summarize structure</action>
      <command>If "all": ls -la to list top-level directories. Otherwise: git ls-files ${1:-.}/ | head -100 (or git ls-files if target is ".")</command>
      <output>List directories and count files per directory - do not enumerate every file</output>
    </step>

    <step name="read-readme">
      <action>Read README.md from target directory</action>
      <path>${1:-.}/README.md (or ./README.md if target is "all" or ".")</path>
      <extract>Project purpose, tech stack, key commands</extract>
    </step>
  </phase>

  <phase number="2" name="config-detection">
    <step name="find-config">
      <action>Identify which config file exists in target (only ONE)</action>
      <search-path>${1:-.}/ (or ./ if "all" or ".")</search-path>
      <priority>pyproject.toml > package.json > go.mod > Cargo.toml > pom.xml</priority>
      <read>Read ONLY the first config file found</read>
    </step>
  </phase>

  <phase number="3" name="inventory-only">
    <step name="list-commands">
      <action>List available slash commands (filenames only)</action>
      <glob>${1:-.}/.agent/commands/*.md (or .agent/commands/*.md if "all" or ".")</glob>
      <output>List names only, do not read contents</output>
    </step>

    <step name="list-tests">
      <action>Note test directory existence in target</action>
      <glob>${1:-.}/tests/**/* OR ${1:-.}/test/**/* OR ${1:-.}/__tests__/**/*</glob>
      <output>Report count only (e.g., "12 test files found")</output>
    </step>
  </phase>

  <phase number="4" name="summarize">
    <format>Concise markdown summary for the target directory with:</format>
    <sections>
      <section>Target: ${1:-.}</section>
      <section>Project: 1-2 sentence description</section>
      <section>Tech: Language, framework, package manager</section>
      <section>Structure: Key directories (3-5 max)</section>
      <section>Commands: List available /commands</section>
      <section>Tests: Framework and count</section>
      <section>Next: What to run for deeper analysis</section>
    </sections>
  </phase>

  <anti-patterns>
    <avoid>Reading full source files to "understand patterns"</avoid>
    <avoid>Reading test files to "understand testing approach"</avoid>
    <avoid>Reading multiple similar files</avoid>
    <avoid>Launching codebase-analyst agent (use /feature for deep analysis)</avoid>
    <avoid>Producing multi-page summaries</avoid>
    <avoid>Exploring directories outside of the target directory</avoid>
  </anti-patterns>
</prime-command>
