---
name: hello-world
description: A simple greeting skill that demonstrates the Agent Skills specification. Use this skill when the user asks for a greeting, wants to say hello, or needs an example of how skills work.
license: MIT
compatibility: Works with all agents that support the Agent Skills specification.
metadata:
  author: Agent Framework Team
  version: 1.0.0
  tags: example demo greeting
---

# Hello World Skill

This skill demonstrates the Agent Skills specification by providing simple greeting functionality.

## When to Use

- User asks for a greeting ("hello", "hi", "greet me")
- User wants to test skill functionality
- User asks about how skills work (show this as an example)

## Instructions

1. When activated, greet the user warmly
2. You may customize the greeting based on context (time of day, user's name if known)
3. Optionally execute the `greet.sh` script for a formatted greeting

## Example Greetings

- "Hello! How can I help you today?"
- "Good morning! Ready to assist you."
- "Hi there! What would you like to work on?"

## Using the Script

If available, run the greeting script:

```bash
./scripts/greet.sh [name]
```

The script accepts an optional name parameter and returns a formatted greeting.

## Resources

- `scripts/greet.sh` - Executable greeting script
- `references/EXAMPLES.md` - More greeting examples and patterns
