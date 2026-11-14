.PHONY: setup dev lint test check ready credits

setup:
	npm install

dev:
	npm run dev

lint:
	npm run lint && npm run typecheck

test:
	npm test && npm run build

check: lint test

# Run before opening a PR: fails unless the branch sits on top of the latest main and passes every check.
ready:
	git fetch origin
	@git merge-base --is-ancestor origin/main HEAD || (echo "Behind main: run git rebase origin/main first" && exit 1)
	@git symbolic-ref --short HEAD | grep -qvx main || (echo "You are on main: work on a branch" && exit 1)
	$(MAKE) check

# Lists every shipped asset with its credit, licence and size. Fails when one has no credit. Not part of check.
credits:
	@node scripts/credits-report.mjs
